// CA practice management — CRUD operations on clients and tasks.
// Pure DB layer. No LLM calls here.

import { getDb } from './database'

// ── Clients ───────────────────────────────────────────────

export interface ClientCreateInput {
  name: string
  gstin?: string | null
  pan?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  fy_end?: string
  business_type?: string | null
  notes?: string | null
}

export function createClient(input: ClientCreateInput): number {
  const db = getDb()
  const result = db.prepare(`
    INSERT INTO clients
      (name, gstin, pan, contact_email, contact_phone, fy_end, business_type, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.name.trim(),
    input.gstin?.trim() || null,
    input.pan?.trim() || null,
    input.contact_email?.trim() || null,
    input.contact_phone?.trim() || null,
    input.fy_end || '03-31',
    input.business_type?.trim() || null,
    input.notes?.trim() || null,
  )
  return Number(result.lastInsertRowid)
}

export function listClients(includeArchived = false) {
  const db = getDb()
  const sql = includeArchived
    ? 'SELECT * FROM clients ORDER BY name ASC'
    : 'SELECT * FROM clients WHERE archived = 0 ORDER BY name ASC'
  return db.prepare(sql).all()
}

export function getClient(id: number) {
  const db = getDb()
  return db.prepare('SELECT * FROM clients WHERE id = ?').get(id)
}

export function updateClient(id: number, patch: Partial<ClientCreateInput>) {
  const db = getDb()
  const allowed = [
    'name', 'gstin', 'pan', 'contact_email', 'contact_phone',
    'fy_end', 'business_type', 'notes',
  ] as const

  const setParts: string[] = []
  const values: any[] = []
  for (const key of allowed) {
    if (key in patch) {
      setParts.push(`${key} = ?`)
      values.push((patch as any)[key])
    }
  }
  if (!setParts.length) return false

  setParts.push(`updated_at = CURRENT_TIMESTAMP`)
  values.push(id)
  db.prepare(`UPDATE clients SET ${setParts.join(', ')} WHERE id = ?`).run(...values)
  return true
}

export function archiveClient(id: number, archived = true) {
  const db = getDb()
  db.prepare('UPDATE clients SET archived = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(archived ? 1 : 0, id)
  return true
}

export function deleteClient(id: number) {
  const db = getDb()
  // ON DELETE CASCADE handles tasks/files/runs
  db.prepare('DELETE FROM clients WHERE id = ?').run(id)
  return true
}

// ── Tasks ─────────────────────────────────────────────────

export interface TaskCreateInput {
  client_id: number
  workflow: string
  period: string
  due_date?: string | null
  status?: string
}

export function createTask(input: TaskCreateInput): number {
  const db = getDb()
  const result = db.prepare(`
    INSERT INTO tasks (client_id, workflow, period, due_date, status)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    input.client_id,
    input.workflow,
    input.period,
    input.due_date || null,
    input.status || 'not_started',
  )
  return Number(result.lastInsertRowid)
}

export function listTasksForClient(clientId: number) {
  const db = getDb()
  return db.prepare(
    'SELECT * FROM tasks WHERE client_id = ? ORDER BY due_date ASC, created_at DESC'
  ).all(clientId)
}

// All tasks across all clients with the client name joined — for the kanban board
export function listAllTasksWithClient() {
  const db = getDb()
  return db.prepare(`
    SELECT
      t.*,
      c.name  AS client_name,
      c.gstin AS client_gstin
    FROM tasks t
    JOIN clients c ON c.id = t.client_id
    WHERE c.archived = 0
    ORDER BY
      CASE t.status
        WHEN 'flagged' THEN 0
        WHEN 'needs_input' THEN 1
        WHEN 'in_progress' THEN 2
        WHEN 'not_started' THEN 3
        WHEN 'completed' THEN 4
        ELSE 5
      END,
      t.due_date ASC NULLS LAST,
      t.updated_at DESC
  `).all()
}

export function getTask(id: number) {
  const db = getDb()
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
}

export function updateTaskStatus(id: number, status: string) {
  const db = getDb()
  const completedAt = status === 'completed' ? new Date().toISOString() : null
  db.prepare(`
    UPDATE tasks
    SET status = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, completedAt, id)
  return true
}

export function updateTask(id: number, patch: Partial<TaskCreateInput & { result_summary_json: string; chat_id: number }>) {
  const db = getDb()
  const allowed = ['workflow', 'period', 'due_date', 'status', 'result_summary_json', 'chat_id'] as const
  const setParts: string[] = []
  const values: any[] = []
  for (const key of allowed) {
    if (key in patch) {
      setParts.push(`${key} = ?`)
      values.push((patch as any)[key])
    }
  }
  if (!setParts.length) return false
  setParts.push(`updated_at = CURRENT_TIMESTAMP`)
  values.push(id)
  db.prepare(`UPDATE tasks SET ${setParts.join(', ')} WHERE id = ?`).run(...values)
  return true
}

export function deleteTask(id: number) {
  const db = getDb()
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
  return true
}

// ── Dashboard counters ────────────────────────────────────

export function getDashboardCounts() {
  const db = getDb()
  const total = (db.prepare('SELECT COUNT(*) AS n FROM clients WHERE archived = 0').get() as { n: number }).n
  const byStatus = db.prepare(`
    SELECT t.status AS status, COUNT(*) AS n
    FROM tasks t
    JOIN clients c ON c.id = t.client_id
    WHERE c.archived = 0
    GROUP BY t.status
  `).all() as Array<{ status: string; n: number }>

  const counts: Record<string, number> = {
    not_started: 0, in_progress: 0, needs_input: 0, completed: 0, flagged: 0,
  }
  for (const row of byStatus) counts[row.status] = row.n
  return { totalClients: total, tasksByStatus: counts }
}
