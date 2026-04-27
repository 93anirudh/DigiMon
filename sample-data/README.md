# Sample data for testing GSTR-2B reconciliation

Two files in this folder are designed to exercise every category of the matcher:

- `purchase_register_sample.csv` — 10 invoices, simulating Tally / Zoho Books export
- `gstr2b_sample.json` — 9 invoices, simulating the GSTN portal's GSTR-2B export

## Expected output when reconciled

| Invoice | Books | 2B | Category | Why |
|---|---|---|---|---|
| INV-2026-001 (Tata) | ✓ | ✓ | **Matched** | Identical |
| INV-2026-002 (Reliance) | ₹120,000 | ₹122,881 | **Amount Mismatch** | Books shows ₹2,881 less taxable value |
| INV/2026/003 vs INV-2026-003 (HUL) | ✓ | ✓ | **Matched** | Different separators normalize to same |
| INV-2026-004 (BPCL) | ✓ | ✗ | **In Books, Not in 2B** | Supplier didn't file → ITC ₹6,300 blocked |
| INV-2026-005 (Godrej) | 22-Mar | 10-Apr | **Date Mismatch** | 19 days apart |
| INV-2026-006 (ITC) | ✓ | ✓ | **Matched** | Identical |
| INV-2026-007 (Marico) | ✓ | ✓ | **Matched** | Identical |
| INV-2026-008 (Dabur) | ✓ | ✗ | **In Books, Not in 2B** | Supplier didn't file → ITC ₹2,700 blocked |
| INV-2026-009 (Nestle) | ✓ | ✓ | **Matched** | Identical |
| INV-2026-010 (Pidilite) | ✓ | ✓ | **Matched** | Identical |
| INV-2026-099 (Sun Pharma) | ✗ | ✓ | **In 2B, Not in Books** | Either missed entry (₹6,300 ITC) or fraud — verify |

**Summary expected:**
- Matched: 5
- Amount Mismatch: 1
- Date Mismatch: 1
- In Books, Not in 2B: 2 (₹9,000 ITC at risk)
- In 2B, Not in Books: 1 (₹6,300 ITC opportunity)

These are designed to be obvious so you can verify the engine works correctly.
