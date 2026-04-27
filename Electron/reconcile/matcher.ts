// GSTR-2B reconciliation matcher.
// Pure deterministic algorithm. ZERO LLM calls.
// Per task: ~5ms for 1000 invoices on a laptop. ~₹0 cost.

import type { NormalizedInvoice } from './parsers'

export type MismatchCategory =
  | 'matched'
  | 'amount_mismatch'        // GSTIN+invoice match, but taxable_value differs
  | 'date_mismatch'          // GSTIN+invoice match, but date >5 days off
  | 'in_2b_not_books'        // 2B has it, register does not (potential ITC opportunity)
  | 'in_books_not_2b'        // register has it, 2B does not (ITC blocked, follow up)
  | 'gstin_mismatch'         // very rare: same invoice number against different GSTIN

export interface MatchedRow {
  category: MismatchCategory
  register?: NormalizedInvoice
  gstr2b?: NormalizedInvoice
  // Pre-computed deltas for UI display (in rupees)
  delta_taxable: number
  delta_total_tax: number
  delta_days: number
  // A short pre-computed reason — local, no LLM
  reason: string
}

export interface ReconciliationResult {
  generated_at: string
  totals: {
    register_count: number
    gstr2b_count: number
    matched: number
    amount_mismatch: number
    date_mismatch: number
    in_2b_not_books: number
    in_books_not_2b: number
    gstin_mismatch: number
    // Financial impact in rupees
    itc_at_risk: number          // total_tax of in_books_not_2b rows
    itc_opportunity: number      // total_tax of in_2b_not_books rows
    amount_disputed: number      // sum of |delta_total_tax| in amount_mismatch rows
  }
  rows: MatchedRow[]
}

// ── Invoice number normalization ──────────────────────────
// Real-world quirks: 'INV-001' vs 'INV/001' vs 'inv001' vs '0001' vs '1'.
// We strip case, all separators, and leading zeros.
function normalizeInvNum(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[\/\-\s\\.]/g, '')   // strip separators
    .replace(/^0+/, '')             // strip leading zeros
}

function makeKey(gstin: string, invNum: string): string {
  return `${gstin}::${normalizeInvNum(invNum)}`
}

function daysBetween(a: string, b: string): number {
  if (!a || !b) return 999
  const da = new Date(a).getTime()
  const db = new Date(b).getTime()
  if (isNaN(da) || isNaN(db)) return 999
  return Math.abs(Math.round((da - db) / 86400000))
}

const TAXABLE_TOLERANCE_RUPEES = 1   // ±₹1 for rounding
const DATE_TOLERANCE_DAYS = 5

export function reconcile(
  register: NormalizedInvoice[],
  gstr2b: NormalizedInvoice[],
): ReconciliationResult {
  // Index both sides by (GSTIN + normalized invoice number)
  const regByKey = new Map<string, NormalizedInvoice>()
  const twoBByKey = new Map<string, NormalizedInvoice>()

  for (const r of register) regByKey.set(makeKey(r.supplier_gstin, r.invoice_number), r)
  for (const t of gstr2b)   twoBByKey.set(makeKey(t.supplier_gstin, t.invoice_number), t)

  // Also index by invoice number alone — to detect GSTIN mismatches
  const regByInv = new Map<string, NormalizedInvoice[]>()
  const twoBByInv = new Map<string, NormalizedInvoice[]>()
  for (const r of register) {
    const k = normalizeInvNum(r.invoice_number)
    if (!regByInv.has(k)) regByInv.set(k, [])
    regByInv.get(k)!.push(r)
  }
  for (const t of gstr2b) {
    const k = normalizeInvNum(t.invoice_number)
    if (!twoBByInv.has(k)) twoBByInv.set(k, [])
    twoBByInv.get(k)!.push(t)
  }

  const rows: MatchedRow[] = []
  const seenInTwoB = new Set<string>()

  for (const r of register) {
    const key = makeKey(r.supplier_gstin, r.invoice_number)
    const t = twoBByKey.get(key)
    if (t) {
      seenInTwoB.add(key)
      const dT = +(r.taxable_value - t.taxable_value).toFixed(2)
      const dTax = +(r.total_tax - t.total_tax).toFixed(2)
      const dDays = daysBetween(r.invoice_date, t.invoice_date)

      if (Math.abs(dT) > TAXABLE_TOLERANCE_RUPEES) {
        rows.push({
          category: 'amount_mismatch',
          register: r, gstr2b: t,
          delta_taxable: dT, delta_total_tax: dTax, delta_days: dDays,
          reason: dT > 0
            ? `Books shows ₹${formatINR(Math.abs(dT))} more taxable value than 2B`
            : `2B shows ₹${formatINR(Math.abs(dT))} more taxable value than books`,
        })
      } else if (dDays > DATE_TOLERANCE_DAYS) {
        rows.push({
          category: 'date_mismatch',
          register: r, gstr2b: t,
          delta_taxable: dT, delta_total_tax: dTax, delta_days: dDays,
          reason: `Date differs by ${dDays} days (books: ${r.invoice_date}, 2B: ${t.invoice_date})`,
        })
      } else {
        rows.push({
          category: 'matched',
          register: r, gstr2b: t,
          delta_taxable: dT, delta_total_tax: dTax, delta_days: dDays,
          reason: 'Matched',
        })
      }
    } else {
      // Check whether 2B has this invoice number under a DIFFERENT GSTIN
      const sameInv = twoBByInv.get(normalizeInvNum(r.invoice_number)) || []
      const otherGstin = sameInv.find(x => x.supplier_gstin !== r.supplier_gstin)
      if (otherGstin) {
        rows.push({
          category: 'gstin_mismatch',
          register: r, gstr2b: otherGstin,
          delta_taxable: 0, delta_total_tax: 0, delta_days: 0,
          reason: `Books shows GSTIN ${r.supplier_gstin}; 2B has same invoice under ${otherGstin.supplier_gstin}`,
        })
        seenInTwoB.add(makeKey(otherGstin.supplier_gstin, otherGstin.invoice_number))
      } else {
        rows.push({
          category: 'in_books_not_2b',
          register: r,
          delta_taxable: 0, delta_total_tax: 0, delta_days: 0,
          reason: `Supplier hasn't filed this invoice — ITC of ₹${formatINR(r.total_tax)} is blocked. Follow up with ${r.supplier_name || r.supplier_gstin}.`,
        })
      }
    }
  }

  // Anything in 2B not yet seen → in_2b_not_books
  for (const t of gstr2b) {
    const key = makeKey(t.supplier_gstin, t.invoice_number)
    if (seenInTwoB.has(key)) continue
    rows.push({
      category: 'in_2b_not_books',
      gstr2b: t,
      delta_taxable: 0, delta_total_tax: 0, delta_days: 0,
      reason: `Not recorded in books. Either missed entry (claim ₹${formatINR(t.total_tax)} ITC) or unauthorized invoice. Verify with ${t.supplier_name || t.supplier_gstin}.`,
    })
  }

  // ── Totals ───────────────────────────────────────────
  let matched = 0, amount_mismatch = 0, date_mismatch = 0
  let in_2b_not_books = 0, in_books_not_2b = 0, gstin_mismatch = 0
  let itc_at_risk = 0, itc_opportunity = 0, amount_disputed = 0

  for (const r of rows) {
    switch (r.category) {
      case 'matched':          matched++; break
      case 'amount_mismatch':
        amount_mismatch++
        amount_disputed += Math.abs(r.delta_total_tax)
        break
      case 'date_mismatch':    date_mismatch++; break
      case 'in_2b_not_books':
        in_2b_not_books++
        itc_opportunity += r.gstr2b?.total_tax || 0
        break
      case 'in_books_not_2b':
        in_books_not_2b++
        itc_at_risk += r.register?.total_tax || 0
        break
      case 'gstin_mismatch':   gstin_mismatch++; break
    }
  }

  return {
    generated_at: new Date().toISOString(),
    totals: {
      register_count: register.length,
      gstr2b_count: gstr2b.length,
      matched, amount_mismatch, date_mismatch,
      in_2b_not_books, in_books_not_2b, gstin_mismatch,
      itc_at_risk: +itc_at_risk.toFixed(2),
      itc_opportunity: +itc_opportunity.toFixed(2),
      amount_disputed: +amount_disputed.toFixed(2),
    },
    rows: rows.sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)),
  }
}

// Most actionable items first
const CATEGORY_ORDER: MismatchCategory[] = [
  'in_books_not_2b',     // ITC at risk — most urgent
  'amount_mismatch',     // financial discrepancy
  'gstin_mismatch',      // serious data error
  'date_mismatch',       // minor
  'in_2b_not_books',     // potential opportunity
  'matched',             // no action needed
]

function formatINR(n: number): string {
  // Indian comma format: 1,23,456.78
  const sign = n < 0 ? '-' : ''
  n = Math.abs(n)
  const [whole, frac] = n.toFixed(2).split('.')
  let s = whole
  if (whole.length > 3) {
    const last3 = whole.slice(-3)
    const rest = whole.slice(0, -3)
    const restFormatted = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')
    s = restFormatted + ',' + last3
  }
  return sign + s + (frac && frac !== '00' ? '.' + frac : '')
}

export const CATEGORY_LABELS: Record<MismatchCategory, string> = {
  matched:           'Matched',
  amount_mismatch:   'Amount Mismatch',
  date_mismatch:     'Date Mismatch',
  in_2b_not_books:   'In 2B, Not in Books',
  in_books_not_2b:   'In Books, Not in 2B',
  gstin_mismatch:    'GSTIN Mismatch',
}

export { formatINR }
