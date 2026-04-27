// Quick sanity test for the matcher.
// Run with: npx tsx /home/claude/DigiMon/scripts/test-matcher.ts
import { parsePurchaseRegisterCSV, parseGstr2bJSON } from '../Electron/reconcile/parsers'
import { reconcile, CATEGORY_LABELS } from '../Electron/reconcile/matcher'

const reg = parsePurchaseRegisterCSV('/home/claude/DigiMon/sample-data/purchase_register_sample.csv')
const twoB = parseGstr2bJSON('/home/claude/DigiMon/sample-data/gstr2b_sample.json')

console.log(`Purchase register: ${reg.length} invoices`)
console.log(`GSTR-2B:           ${twoB.length} invoices`)

const result = reconcile(reg, twoB)

console.log('\n=== TOTALS ===')
console.log(JSON.stringify(result.totals, null, 2))

console.log('\n=== ROWS ===')
for (const row of result.rows) {
  const inv = row.register || row.gstr2b
  console.log(`[${CATEGORY_LABELS[row.category].padEnd(22)}] ${inv?.invoice_number?.padEnd(15)} ${inv?.supplier_gstin}  -  ${row.reason}`)
}
