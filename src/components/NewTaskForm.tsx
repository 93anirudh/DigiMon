import { useEffect, useState } from 'react'
import type { Client, TaskStatus, WorkflowKind } from '../types/practice'
import { WORKFLOW_LABELS } from '../types/practice'

interface Props {
  presetClientId?: number
  presetStatus?: TaskStatus
  onClose: () => void
  onSaved: () => void
}

export function NewTaskForm({ presetClientId, presetStatus, onClose, onSaved }: Props) {
  const [clients, setClients] = useState<Client[]>([])
  const [clientId, setClientId] = useState<number | null>(presetClientId ?? null)
  const [workflow, setWorkflow] = useState<WorkflowKind>('gstr_2b')
  const [period, setPeriod] = useState(defaultPeriod())
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.electronAPI.listClients(false).then(setClients)
  }, [])

  const submit = async () => {
    if (!clientId) { setError('Select a client'); return }
    if (!period.trim()) { setError('Period is required'); return }
    setSaving(true); setError(null)
    try {
      await window.electronAPI.createTask({
        client_id: clientId,
        workflow,
        period: period.trim(),
        due_date: dueDate || null,
        status: presetStatus || 'not_started',
      })
      onSaved()
    } catch (err: any) {
      setError(err.message || 'Failed to create task')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100, backdropFilter: 'blur(8px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface-solid)',
          border: '1px solid var(--border-md)',
          borderRadius: 14,
          padding: 24,
          width: '92%',
          maxWidth: 440,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 18 }}>
          New Task
        </div>

        {!presetClientId && (
          <Field label="Client *">
            <select
              value={clientId ?? ''}
              onChange={e => setClientId(e.target.value ? Number(e.target.value) : null)}
              style={selectStyle}
            >
              <option value="">— Select client —</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {clients.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
                No clients yet. Add one first.
              </div>
            )}
          </Field>
        )}

        <Field label="Workflow">
          <select
            value={workflow}
            onChange={e => setWorkflow(e.target.value as WorkflowKind)}
            style={selectStyle}
          >
            {Object.entries(WORKFLOW_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Period *">
            <input
              value={period}
              onChange={e => setPeriod(e.target.value)}
              placeholder="2026-03"
              style={inputStyle}
            />
          </Field>
          <Field label="Due Date">
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              style={inputStyle}
            />
          </Field>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            color: '#EF4444',
            padding: '10px 12px',
            borderRadius: 8,
            fontSize: 13,
            marginBottom: 12,
          }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
          <button onClick={onClose} disabled={saving} style={btnGhost}>Cancel</button>
          <button onClick={submit} disabled={saving || !clientId} style={{ ...btnPrimary, opacity: saving || !clientId ? 0.5 : 1 }}>
            {saving ? 'Creating…' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  )
}

function defaultPeriod(): string {
  const d = new Date()
  // GST returns are usually for the previous month
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  padding: '9px 12px',
  borderRadius: 8,
  fontSize: 13,
  outline: 'none',
}

const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' }

const btnGhost: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--text2)',
  border: '1px solid var(--border-md)',
  padding: '9px 16px',
  borderRadius: 8,
  fontSize: 13,
  cursor: 'pointer',
}

const btnPrimary: React.CSSProperties = {
  background: 'var(--accent)',
  color: 'white',
  border: 'none',
  padding: '9px 18px',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6, fontWeight: 500 }}>
        {label}
      </div>
      {children}
    </div>
  )
}
