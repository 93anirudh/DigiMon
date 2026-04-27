// Per-row "Why is this flagged?" explainer.
// Uses Gemini Flash with a tightly-scoped prompt. ~150-300 tokens per call.
// Results are cached on the task's result_summary_json — so re-opening the
// task is free, and the same row never burns tokens twice.

import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { getDb } from '../database'
import { storeGet } from '../store'
import type { ReconciliationResult, MatchedRow } from './matcher'

const SYSTEM_PROMPT = `You are an Indian Chartered Accountant's assistant explaining a single GSTR-2B reconciliation discrepancy to a CA.

You will be given:
- The category of the mismatch
- The invoice details from the books and/or 2B
- The pre-computed reason

Your job: write 2-3 short sentences explaining (a) what the discrepancy means in practical terms, (b) the most likely cause, (c) the recommended next step. Be specific to Indian GST context. Plain English, no jargon, no bullet points, no markdown. Keep it under 60 words. Do not repeat the row data — the CA can already see it.`

export interface ExplainResult {
  ok: boolean
  explanation?: string
  cached?: boolean
  tokens_used?: number
  cost_paise?: number
  error?: string
}

// Cache key: stable hash of the row identity
function rowKey(row: MatchedRow): string {
  const inv = row.register || row.gstr2b
  return `${row.category}::${inv?.supplier_gstin || ''}::${inv?.invoice_number || ''}::${inv?.invoice_date || ''}`
}

export async function explainRow(taskId: number, rowIndex: number): Promise<ExplainResult> {
  const db = getDb()
  const task = db.prepare('SELECT result_summary_json FROM tasks WHERE id = ?').get(taskId) as { result_summary_json: string | null } | undefined
  if (!task?.result_summary_json) return { ok: false, error: 'No reconciliation result yet. Run reconciliation first.' }

  let result: ReconciliationResult
  try { result = JSON.parse(task.result_summary_json) } catch { return { ok: false, error: 'Could not parse result.' } }

  const row = result.rows[rowIndex]
  if (!row) return { ok: false, error: 'Row index out of range.' }

  // Cache lookup
  const cache: Record<string, string> = (result as any).explanations || {}
  const key = rowKey(row)
  if (cache[key]) {
    return { ok: true, explanation: cache[key], cached: true, tokens_used: 0, cost_paise: 0 }
  }

  // No cache → call Flash
  const apiKey = storeGet('gemini_api_key')
  if (!apiKey) return { ok: false, error: 'No Gemini API key configured. Set one in Settings.' }

  const inv = row.register || row.gstr2b
  const userPrompt = [
    `Category: ${row.category}`,
    `Pre-computed reason: ${row.reason}`,
    inv && `Supplier: ${inv.supplier_name || '(unknown)'} (GSTIN ${inv.supplier_gstin})`,
    inv && `Invoice: ${inv.invoice_number} dated ${inv.invoice_date}`,
    row.register && `In books: taxable ₹${row.register.taxable_value.toFixed(2)}, total tax ₹${row.register.total_tax.toFixed(2)}`,
    row.gstr2b   && `In 2B:    taxable ₹${row.gstr2b.taxable_value.toFixed(2)}, total tax ₹${row.gstr2b.total_tax.toFixed(2)}`,
    row.delta_taxable !== 0 && `Taxable value delta: ₹${row.delta_taxable.toFixed(2)}`,
    row.delta_days > 5 && `Date delta: ${row.delta_days} days`,
  ].filter(Boolean).join('\n')

  const model = new ChatGoogleGenerativeAI({
    apiKey,
    model: 'gemini-2.5-flash',
    apiVersion: 'v1beta',
    maxOutputTokens: 200,   // hard cap to keep cost predictable
    temperature: 0.2,
  })

  let explanation = ''
  let tokensIn = 0
  let tokensOut = 0
  try {
    const response = await model.invoke([
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(userPrompt),
    ])
    explanation = extractText(response.content).trim()

    // LangChain exposes usage_metadata on the response
    const usage = (response as any).usage_metadata || (response as any).response_metadata?.usage
    tokensIn  = usage?.input_tokens  || usage?.prompt_token_count   || 0
    tokensOut = usage?.output_tokens || usage?.candidates_token_count || 0
  } catch (err: any) {
    return { ok: false, error: err.message || 'LLM call failed' }
  }

  if (!explanation) return { ok: false, error: 'Empty response from LLM' }

  // Persist in the cache on the task
  cache[key] = explanation
  ;(result as any).explanations = cache
  db.prepare('UPDATE tasks SET result_summary_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(JSON.stringify(result), taskId)

  // Estimate cost in paise. Gemini 2.5 Flash @ Apr 2026:
  //  - input:  ~$0.30 / 1M tokens
  //  - output: ~$2.50 / 1M tokens
  // 1 USD ≈ 83 INR ≈ 8300 paise.
  const cost_paise = Math.round(
    (tokensIn  / 1_000_000) * 0.30 * 8300 +
    (tokensOut / 1_000_000) * 2.50 * 8300
  )

  // Log to task_runs for the visible telemetry
  db.prepare(`
    INSERT INTO task_runs (task_id, started_at, ended_at, status, tokens_used, cost_paise, log_json)
    VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'success', ?, ?, ?)
  `).run(taskId, tokensIn + tokensOut, cost_paise, JSON.stringify({ kind: 'explain_row', rowIndex }))

  return { ok: true, explanation, cached: false, tokens_used: tokensIn + tokensOut, cost_paise }
}

function extractText(content: any): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((b: any) => (typeof b === 'string' ? b : (b?.text || '')))
      .join('')
  }
  return String(content || '')
}
