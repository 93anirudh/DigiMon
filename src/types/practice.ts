// Shared types for CA practice management.
// Used across the Electron main process and the React renderer.

export type TaskStatus =
  | 'not_started'
  | 'in_progress'
  | 'needs_input'
  | 'completed'
  | 'flagged'

export type WorkflowKind =
  | 'gstr_2b'        // GSTR-2B reconciliation (the wedge)
  | 'gstr_1'         // Future
  | 'gstr_3b'        // Future
  | 'tds_return'     // Future
  | 'itr'            // Future
  | 'form_3cd'       // Future
  | 'custom'         // Adhoc co-pilot tasks

export interface Client {
  id: number
  name: string
  gstin: string | null
  pan: string | null
  contact_email: string | null
  contact_phone: string | null
  fy_end: string                // 'MM-DD', default '03-31'
  business_type: string | null
  notes: string | null
  archived: number              // 0 or 1
  created_at: string
  updated_at: string
}

export interface ClientInput {
  name: string
  gstin?: string | null
  pan?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  fy_end?: string
  business_type?: string | null
  notes?: string | null
}

export interface Task {
  id: number
  client_id: number
  workflow: WorkflowKind
  period: string                // 'YYYY-MM' for monthly, 'YYYY' for yearly, 'YYYY-Q[1-4]' for quarterly
  status: TaskStatus
  due_date: string | null       // ISO date 'YYYY-MM-DD'
  result_summary_json: string | null
  chat_id: number | null        // optional link to a Co-pilot chat
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface TaskInput {
  client_id: number
  workflow: WorkflowKind
  period: string
  due_date?: string | null
  status?: TaskStatus
}

export interface TaskFile {
  id: number
  task_id: number
  kind: string                  // 'purchase_register' | 'gstr_2b_json' | 'output_pdf' | etc
  original_name: string
  stored_path: string
  size_bytes: number | null
  created_at: string
}

// Convenience: a task with its client name attached, used in kanban / dashboard
export interface TaskWithClient extends Task {
  client_name: string
  client_gstin: string | null
}

// UI labels — kept here so main and renderer agree
export const WORKFLOW_LABELS: Record<WorkflowKind, string> = {
  gstr_2b:   'GSTR-2B Reconciliation',
  gstr_1:    'GSTR-1 Filing',
  gstr_3b:   'GSTR-3B Filing',
  tds_return:'TDS Return',
  itr:       'Income Tax Return',
  form_3cd:  'Form 3CD Audit',
  custom:    'Custom Task',
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started:  'Not Started',
  in_progress:  'In Progress',
  needs_input:  'Needs Input',
  completed:    'Completed',
  flagged:      'Flagged',
}

export const STATUS_ORDER: TaskStatus[] = [
  'not_started',
  'in_progress',
  'needs_input',
  'completed',
  'flagged',
]
