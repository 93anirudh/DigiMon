// GSTR-2B reconciliation service.
// - Stores uploaded files under userData/clients/{clientId}/tasks/{taskId}/
// - Runs the deterministic matcher
// - Persists the result on the task as JSON
// - Updates task status based on findings

import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { getDb } from '../database'
import { parsePurchaseRegisterCSV, parseGstr2bJSON, type NormalizedInvoice } from './parsers'
import { reconcile, type ReconciliationResult } from './matcher'

export type FileKind = 'purchase_register' | 'gstr2b_json' | 'output_pdf' | 'output_xlsx'

function tasksDir(taskId: number): string {
  const db = getDb()
  const task = db.prepare('SELECT client_id FROM tasks WHERE id = ?').get(taskId) as { client_id: number } | undefined
  if (!task) throw new Error(`Task ${taskId} not found`)
  const dir = path.join(app.getPath('userData'), 'clients', String(task.client_id), 'tasks', String(taskId))
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

// ── Save uploaded file to disk + record in DB ─────────────

export function ingestFile(
  taskId: number,
  kind: FileKind,
  sourcePath: string,
  originalName: string,
): { fileId: number; storedPath: string } {
  const dir = tasksDir(taskId)
  const ext = path.extname(originalName) || path.extname(sourcePath) || ''
  const safeName = `${kind}_${Date.now()}${ext}`
  const storedPath = path.join(dir, safeName)

  fs.copyFileSync(sourcePath, storedPath)
  const stat = fs.statSync(storedPath)

  const db = getDb()
  // Replace any earlier file of the same kind for this task
  db.prepare('DELETE FROM task_files WHERE task_id = ? AND kind = ?').run(taskId, kind)
  const result = db.prepare(`
    INSERT INTO task_files (task_id, kind, original_name, stored_path, size_bytes)
    VALUES (?, ?, ?, ?, ?)
  `).run(taskId, kind, originalName, storedPath, stat.size)

  return { fileId: Number(result.lastInsertRowid), storedPath }
}

// Save file content directly (e.g., from drag-drop where we have ArrayBuffer)
export function ingestBuffer(
  taskId: number,
  kind: FileKind,
  bytes: Buffer,
  originalName: string,
): { fileId: number; storedPath: string } {
  const dir = tasksDir(taskId)
  const ext = path.extname(originalName) || ''
  const safeName = `${kind}_${Date.now()}${ext}`
  const storedPath = path.join(dir, safeName)

  fs.writeFileSync(storedPath, bytes)

  const db = getDb()
  db.prepare('DELETE FROM task_files WHERE task_id = ? AND kind = ?').run(taskId, kind)
  const result = db.prepare(`
    INSERT INTO task_files (task_id, kind, original_name, stored_path, size_bytes)
    VALUES (?, ?, ?, ?, ?)
  `).run(taskId, kind, originalName, storedPath, bytes.length)

  return { fileId: Number(result.lastInsertRowid), storedPath }
}

export function listTaskFiles(taskId: number) {
  const db = getDb()
  return db.prepare('SELECT * FROM task_files WHERE task_id = ? ORDER BY kind, created_at').all(taskId)
}

export function deleteTaskFile(fileId: number) {
  const db = getDb()
  const file = db.prepare('SELECT * FROM task_files WHERE id = ?').get(fileId) as { stored_path: string } | undefined
  if (!file) return false
  try { if (fs.existsSync(file.stored_path)) fs.unlinkSync(file.stored_path) } catch {}
  db.prepare('DELETE FROM task_files WHERE id = ?').run(fileId)
  return true
}

// ── Run reconciliation ────────────────────────────────────

export interface RunOutcome {
  ok: boolean
  result?: ReconciliationResult
  error?: string
  durationMs?: number
}

export function runGstr2bReconciliation(taskId: number): RunOutcome {
  const db = getDb()
  const files = db.prepare('SELECT * FROM task_files WHERE task_id = ?').all(taskId) as Array<{ kind: string; stored_path: string }>
  const reg = files.find(f => f.kind === 'purchase_register')
  const twoB = files.find(f => f.kind === 'gstr2b_json')

  if (!reg)  return { ok: false, error: 'Purchase Register file not uploaded yet.' }
  if (!twoB) return { ok: false, error: 'GSTR-2B JSON file not uploaded yet.' }

  // Log a run start
  const runResult = db.prepare(`
    INSERT INTO task_runs (task_id, status) VALUES (?, 'running')
  `).run(taskId)
  const runId = Number(runResult.lastInsertRowid)

  const t0 = Date.now()
  let registerInvoices: NormalizedInvoice[] = []
  let gstr2bInvoices: NormalizedInvoice[] = []

  try {
    registerInvoices = parsePurchaseRegisterCSV(reg.stored_path)
    gstr2bInvoices   = parseGstr2bJSON(twoB.stored_path)
  } catch (err: any) {
    db.prepare(`
      UPDATE task_runs SET status = 'error', ended_at = CURRENT_TIMESTAMP, error_message = ?
      WHERE id = ?
    `).run(err.message || String(err), runId)
    return { ok: false, error: err.message || 'Failed to parse files.' }
  }

  const result = reconcile(registerInvoices, gstr2bInvoices)
  const durationMs = Date.now() - t0

  // Persist on the task
  db.prepare(`
    UPDATE tasks
    SET result_summary_json = ?,
        status = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    JSON.stringify(result),
    deriveStatus(result),
    taskId,
  )

  db.prepare(`
    UPDATE task_runs
    SET status = 'success', ended_at = CURRENT_TIMESTAMP,
        tokens_used = 0, cost_paise = 0,
        log_json = ?
    WHERE id = ?
  `).run(JSON.stringify({ durationMs, totals: result.totals }), runId)

  return { ok: true, result, durationMs }
}

// Decide task status based on what the matcher found.
// - All matched → completed
// - Any flag-worthy issue → flagged (CA must review)
function deriveStatus(result: ReconciliationResult): string {
  const { in_books_not_2b, amount_mismatch, gstin_mismatch, in_2b_not_books, date_mismatch } = result.totals
  if (in_books_not_2b > 0 || amount_mismatch > 0 || gstin_mismatch > 0) return 'flagged'
  if (in_2b_not_books > 0 || date_mismatch > 0) return 'needs_input'
  return 'completed'
}

export function getReconciliationResult(taskId: number): ReconciliationResult | null {
  const db = getDb()
  const task = db.prepare('SELECT result_summary_json FROM tasks WHERE id = ?').get(taskId) as { result_summary_json: string | null } | undefined
  if (!task?.result_summary_json) return null
  try { return JSON.parse(task.result_summary_json) } catch { return null }
}

export function listRuns(taskId: number) {
  const db = getDb()
  return db.prepare('SELECT * FROM task_runs WHERE task_id = ? ORDER BY started_at DESC').all(taskId)
}
