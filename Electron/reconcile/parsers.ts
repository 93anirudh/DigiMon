// File parsers for GSTR-2B reconciliation.
// Output a normalized Invoice[] regardless of input format.

import fs from 'fs'
import path from 'path'
import * as XLSX from 'xlsx'

export interface NormalizedInvoice {
  source: 'register' | 'gstr2b'
  supplier_gstin: string
  supplier_name: string | null
  invoice_number: string
  invoice_date: string         // 'YYYY-MM-DD'
  taxable_value: number        // in rupees
  igst: number
  cgst: number
  sgst: number
  cess: number
  total_tax: number
  invoice_value: number
  raw_row: any                 // for debugging / drill-down
}

// ── CSV parser (handles quoted fields, BOM, CRLF) ─────────

function parseCSV(text: string): string[][] {
  // Strip UTF-8 BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += ch
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === ',') { cur.push(field); field = '' }
      else if (ch === '\n') { cur.push(field); rows.push(cur); cur = []; field = '' }
      else if (ch === '\r') { /* swallow */ }
      else field += ch
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur) }
  return rows.filter(r => r.some(c => c.trim().length > 0))
}

// ── Header alias resolution ───────────────────────────────
// Indian accounting software uses wildly different column names.
// We normalize them all to a canonical set.

const HEADER_ALIASES: Record<string, string[]> = {
  supplier_gstin: ['supplier gstin', 'gstin', 'gstin of supplier', 'vendor gstin', 'party gstin', 'gst no', 'gstin/uin of supplier'],
  supplier_name:  ['supplier name', 'supplier', 'vendor name', 'vendor', 'party name', 'party', 'name of supplier'],
  invoice_number: ['invoice number', 'invoice no', 'inv no', 'invoice no.', 'bill no', 'bill number', 'document number'],
  invoice_date:   ['invoice date', 'inv date', 'bill date', 'date', 'document date'],
  taxable_value:  ['taxable value', 'taxable amount', 'taxable', 'taxable amt', 'value', 'assessable value'],
  igst:           ['igst', 'igst amount', 'integrated tax'],
  cgst:           ['cgst', 'cgst amount', 'central tax'],
  sgst:           ['sgst', 'sgst amount', 'state tax', 'sgst/utgst'],
  cess:           ['cess', 'cess amount'],
  invoice_value:  ['invoice value', 'total', 'total invoice value', 'total amount', 'gross total'],
}

function resolveHeaders(headerRow: string[]): Record<string, number> {
  const map: Record<string, number> = {}
  const normalized = headerRow.map(h => h.trim().toLowerCase())
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) {
      const idx = normalized.indexOf(alias)
      if (idx !== -1) { map[canonical] = idx; break }
    }
  }
  return map
}

// ── Date normalization ────────────────────────────────────
// Accepts: 'YYYY-MM-DD', 'DD/MM/YYYY', 'DD-MM-YYYY', 'DD-MMM-YYYY', JS Date
function parseDate(raw: string): string {
  if (!raw) return ''
  const s = String(raw).trim()
  // Already ISO?
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (dmy) {
    let [, d, m, y] = dmy
    if (y.length === 2) y = (Number(y) > 50 ? '19' : '20') + y
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // DD-MMM-YYYY (e.g., 14-Mar-2026)
  const dmonth = s.match(/^(\d{1,2})[\-\s]([A-Za-z]{3})[\-\s](\d{2,4})$/)
  if (dmonth) {
    const [, d, mon, y] = dmonth
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    }
    const mm = months[mon.toLowerCase()]
    if (mm) {
      const yy = y.length === 2 ? (Number(y) > 50 ? '19' : '20') + y : y
      return `${yy}-${mm}-${d.padStart(2, '0')}`
    }
  }

  // Excel serial date (rare but possible)
  const n = Number(s)
  if (!isNaN(n) && n > 25569 && n < 60000) {
    const d = new Date((n - 25569) * 86400 * 1000)
    return d.toISOString().slice(0, 10)
  }

  return s   // give up; matcher will treat as mismatch
}

function parseAmount(raw: any): number {
  if (raw == null || raw === '') return 0
  const s = String(raw).replace(/[,₹\s]/g, '').replace(/\(([^)]+)\)/, '-$1')
  const n = Number(s)
  return isNaN(n) ? 0 : n
}

// ── Public: parse purchase register (auto-detect format) ─

export function parsePurchaseRegister(filePath: string): NormalizedInvoice[] {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.xlsx' || ext === '.xls' || ext === '.xlsm') {
    return parsePurchaseRegisterXLSX(filePath)
  }
  // default to CSV (covers .csv, .txt, no extension)
  return parsePurchaseRegisterCSV(filePath)
}

// ── Public: parse purchase register (XLSX) ────────────────

export function parsePurchaseRegisterXLSX(filePath: string): NormalizedInvoice[] {
  const wb = XLSX.readFile(filePath, { cellDates: true, raw: false })
  // Pick the first sheet that has data and identifiable headers
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, blankrows: false, defval: '' }) as any[][]
    if (rows.length < 2) continue

    // String-ify all cells for our existing alias logic
    const stringRows: string[][] = rows.map(r => r.map(c => c == null ? '' : String(c)))

    // Try header row 0 then 1 (some exports have a title row)
    let headerIdx = 0
    let headerMap = resolveHeaders(stringRows[0])
    if (headerMap.supplier_gstin === undefined || headerMap.invoice_number === undefined) {
      if (stringRows.length > 1) {
        const m2 = resolveHeaders(stringRows[1])
        if (m2.supplier_gstin !== undefined && m2.invoice_number !== undefined) {
          headerIdx = 1
          headerMap = m2
        }
      }
    }
    if (headerMap.supplier_gstin === undefined || headerMap.invoice_number === undefined) continue

    return rowsToInvoices(stringRows, headerIdx, headerMap)
  }
  throw new Error('No sheet in this Excel file has the required columns (GSTIN, Invoice Number, Invoice Date, Taxable Value).')
}

// Shared row → invoice projection
function rowsToInvoices(
  rows: string[][],
  headerIdx: number,
  headerMap: Record<string, number>,
): NormalizedInvoice[] {
  const out: NormalizedInvoice[] = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]
    const gstin = (r[headerMap.supplier_gstin] || '').trim().toUpperCase()
    const inv   = (r[headerMap.invoice_number] || '').trim()
    if (!gstin || !inv) continue

    const taxable = parseAmount(r[headerMap.taxable_value])
    const igst = parseAmount(r[headerMap.igst])
    const cgst = parseAmount(r[headerMap.cgst])
    const sgst = parseAmount(r[headerMap.sgst])
    const cess = parseAmount(r[headerMap.cess])
    const total_tax = igst + cgst + sgst + cess
    const invoice_value = headerMap.invoice_value !== undefined
      ? parseAmount(r[headerMap.invoice_value])
      : taxable + total_tax

    out.push({
      source: 'register',
      supplier_gstin: gstin,
      supplier_name: headerMap.supplier_name !== undefined ? (r[headerMap.supplier_name] || '').trim() || null : null,
      invoice_number: inv,
      invoice_date: parseDate(r[headerMap.invoice_date] || ''),
      taxable_value: taxable,
      igst, cgst, sgst, cess,
      total_tax,
      invoice_value,
      raw_row: r,
    })
  }
  return out
}

// ── Public: parse purchase register (CSV) ─────────────────

export function parsePurchaseRegisterCSV(filePath: string): NormalizedInvoice[] {
  const text = fs.readFileSync(filePath, 'utf-8')
  const rows = parseCSV(text)
  if (rows.length < 2) return []

  // Find the header row — sometimes there's a title row before headers
  let headerIdx = 0
  let headerMap = resolveHeaders(rows[0])
  if (headerMap.supplier_gstin === undefined || headerMap.invoice_number === undefined) {
    // try row 1
    if (rows.length > 1) {
      const m2 = resolveHeaders(rows[1])
      if (m2.supplier_gstin !== undefined && m2.invoice_number !== undefined) {
        headerIdx = 1
        headerMap = m2
      }
    }
  }
  if (headerMap.supplier_gstin === undefined || headerMap.invoice_number === undefined) {
    throw new Error('Could not identify required columns. Need at least: GSTIN, Invoice Number, Invoice Date, Taxable Value.')
  }

  return rowsToInvoices(rows, headerIdx, headerMap)
}

// ── Public: parse GSTR-2B JSON ────────────────────────────
// GSTN's official 2B JSON shape:
// {
//   "data": {
//     "docdata": {
//       "b2b": [
//         { "ctin": "GSTIN", "trdnm": "Name", "inv": [
//             { "inum": "INV-001", "dt": "14-03-2026", "val": 11800, "txval": 10000,
//               "iamt": 1800, "camt": 0, "samt": 0, "csamt": 0, ... }
//         ]}
//       ],
//       "cdnr": [ ... credit notes ... ]
//     }
//   }
// }
// Different vintages of the portal use slightly different structures, so we
// probe defensively.

export function parseGstr2bJSON(filePath: string): NormalizedInvoice[] {
  const text = fs.readFileSync(filePath, 'utf-8')
  const json = JSON.parse(text)

  // Locate the b2b array. Try several known paths.
  let b2b: any[] = []
  const candidates = [
    json?.data?.docdata?.b2b,
    json?.docdata?.b2b,
    json?.data?.b2b,
    json?.b2b,
  ]
  for (const c of candidates) {
    if (Array.isArray(c)) { b2b = c; break }
  }
  if (!b2b.length) {
    throw new Error('Could not find B2B section in GSTR-2B JSON. The file may be from a different format.')
  }

  const out: NormalizedInvoice[] = []
  for (const supplier of b2b) {
    const gstin = (supplier.ctin || '').trim().toUpperCase()
    const name = supplier.trdnm || null
    const invs = supplier.inv || []
    for (const inv of invs) {
      const taxable = Number(inv.txval || 0)
      const igst = Number(inv.iamt || 0)
      const cgst = Number(inv.camt || 0)
      const sgst = Number(inv.samt || 0)
      const cess = Number(inv.csamt || 0)
      out.push({
        source: 'gstr2b',
        supplier_gstin: gstin,
        supplier_name: name,
        invoice_number: String(inv.inum || '').trim(),
        invoice_date: parseDate(inv.dt || ''),
        taxable_value: taxable,
        igst, cgst, sgst, cess,
        total_tax: igst + cgst + sgst + cess,
        invoice_value: Number(inv.val || taxable + igst + cgst + sgst + cess),
        raw_row: inv,
      })
    }
  }
  return out
}
