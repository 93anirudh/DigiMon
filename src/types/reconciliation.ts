// Mirror of Electron/reconcile/matcher.ts types for the renderer.
// Kept in sync manually — these are wire types over IPC.

export type MismatchCategory =
  | 'matched'
  | 'amount_mismatch'
  | 'date_mismatch'
  | 'in_2b_not_books'
  | 'in_books_not_2b'
  | 'gstin_mismatch'

export interface NormalizedInvoice {
  source: 'register' | 'gstr2b'
  supplier_gstin: string
  supplier_name: string | null
  invoice_number: string
  invoice_date: string
  taxable_value: number
  igst: number
  cgst: number
  sgst: number
  cess: number
  total_tax: number
  invoice_value: number
}

export interface MatchedRow {
  category: MismatchCategory
  register?: NormalizedInvoice
  gstr2b?: NormalizedInvoice
  delta_taxable: number
  delta_total_tax: number
  delta_days: number
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
    itc_at_risk: number
    itc_opportunity: number
    amount_disputed: number
  }
  rows: MatchedRow[]
}

export const CATEGORY_LABELS: Record<MismatchCategory, string> = {
  matched:           'Matched',
  amount_mismatch:   'Amount Mismatch',
  date_mismatch:     'Date Mismatch',
  in_2b_not_books:   'In 2B, Not in Books',
  in_books_not_2b:   'In Books, Not in 2B',
  gstin_mismatch:    'GSTIN Mismatch',
}

// Most actionable first
export const CATEGORY_DISPLAY_ORDER: MismatchCategory[] = [
  'in_books_not_2b',
  'amount_mismatch',
  'gstin_mismatch',
  'date_mismatch',
  'in_2b_not_books',
  'matched',
]

export const CATEGORY_COLORS: Record<MismatchCategory, { bg: string; fg: string; dot: string }> = {
  in_books_not_2b:   { bg: 'rgba(239, 68, 68, 0.18)',  fg: '#F87171', dot: '#EF4444' },
  amount_mismatch:   { bg: 'rgba(245, 158, 11, 0.18)', fg: '#FBBF24', dot: '#F59E0B' },
  gstin_mismatch:    { bg: 'rgba(245, 158, 11, 0.18)', fg: '#FBBF24', dot: '#F59E0B' },
  date_mismatch:     { bg: 'rgba(168, 85, 247, 0.18)', fg: '#C084FC', dot: '#A855F7' },
  in_2b_not_books:   { bg: 'rgba(99, 102, 241, 0.18)', fg: '#818CF8', dot: '#6366F1' },
  matched:           { bg: 'rgba(34, 197, 94, 0.18)',  fg: '#4ADE80', dot: '#22C55E' },
}

export function formatINR(n: number): string {
  const sign = n < 0 ? '-' : ''
  n = Math.abs(n)
  const [whole, frac] = n.toFixed(2).split('.')
  let s = whole
  if (whole.length > 3) {
    const last3 = whole.slice(-3)
    const rest = whole.slice(0, -3)
    s = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3
  }
  return '₹' + sign + s + (frac && frac !== '00' ? '.' + frac : '')
}
