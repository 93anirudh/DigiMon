import { useState } from 'react'
import type { TaskWithClient, TaskStatus } from '../types/practice'
import { STATUS_LABELS, WORKFLOW_LABELS } from '../types/practice'
import { NewTaskForm } from './NewTaskForm'

const COLUMNS: { status: TaskStatus; tint: string }[] = [
  { status: 'not_started', tint: 'rgba(113, 113, 122, 0.15)' },
  { status: 'in_progress', tint: 'rgba(99, 102, 241, 0.15)' },
  { status: 'needs_input', tint: 'rgba(168, 85, 247, 0.18)' },
  { status: 'flagged',     tint: 'rgba(245, 158, 11, 0.18)' },
  { status: 'completed',   tint: 'rgba(34, 197, 94, 0.15)' },
]

interface Props {
  tasks: TaskWithClient[]
  onChange: () => void
  onOpenClient: (clientId: number) => void
}

export function KanbanView({ tasks, onChange, onOpenClient }: Props) {
  const [showNewTask, setShowNewTask] = useState<{ status: TaskStatus } | null>(null)

  const grouped = COLUMNS.map(col => ({
    ...col,
    items: tasks.filter(t => t.status === col.status),
  }))

  const cycleStatus = async (task: TaskWithClient) => {
    const flow: TaskStatus[] = ['not_started', 'in_progress', 'needs_input', 'completed']
    const idx = flow.indexOf(task.status)
    const next = idx === -1 ? 'in_progress' : flow[(idx + 1) % flow.length]
    await window.electronAPI.updateTaskStatus(task.id, next)
    onChange()
  }

  return (
    <>
      <div style={{
        display: 'flex',
        gap: 12,
        overflowX: 'auto',
        paddingBottom: 8,
      }}>
        {grouped.map(col => (
          <div key={col.status} style={{
            minWidth: 280,
            flex: '0 0 280px',
            background: 'var(--surface-glass)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            maxHeight: 'calc(100vh - 220px)',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 6px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: col.tint.replace(/[\d.]+\)$/, '0.9)'),
                }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {STATUS_LABELS[col.status]}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>{col.items.length}</span>
              </div>
              <button
                onClick={() => setShowNewTask({ status: col.status })}
                title="Add task"
                style={{
                  background: 'transparent', border: 'none', color: 'var(--text3)',
                  cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1,
                }}
              >+</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
              {col.items.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text4)', padding: 12, textAlign: 'center' }}>
                  Empty
                </div>
              ) : col.items.map(t => (
                <KanbanCard
                  key={t.id}
                  task={t}
                  tint={col.tint}
                  onCycle={() => cycleStatus(t)}
                  onOpenClient={() => onOpenClient(t.client_id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {showNewTask && (
        <NewTaskForm
          presetStatus={showNewTask.status}
          onClose={() => setShowNewTask(null)}
          onSaved={async () => { setShowNewTask(null); onChange() }}
        />
      )}
    </>
  )
}

function KanbanCard({
  task, tint, onCycle, onOpenClient,
}: {
  task: TaskWithClient
  tint: string
  onCycle: () => void
  onOpenClient: () => void
}) {
  const due = task.due_date ? new Date(task.due_date) : null
  const isOverdue = due && task.status !== 'completed' && due < new Date()

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: `1px solid ${isOverdue ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`,
        borderLeft: `3px solid ${tint.replace(/[\d.]+\)$/, '0.8)')}`,
        borderRadius: 8,
        padding: 10,
        cursor: 'pointer',
      }}
      onClick={onCycle}
      title="Click to advance status"
    >
      <div
        onClick={e => { e.stopPropagation(); onOpenClient() }}
        style={{
          fontSize: 12,
          color: 'var(--text2)',
          marginBottom: 4,
          fontWeight: 500,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {task.client_name}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, marginBottom: 6 }}>
        {WORKFLOW_LABELS[task.workflow as keyof typeof WORKFLOW_LABELS] || task.workflow}
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: 11,
        color: 'var(--text3)',
      }}>
        <span>{task.period}</span>
        {due && (
          <span style={{ color: isOverdue ? '#EF4444' : 'var(--text3)' }}>
            {isOverdue ? 'Overdue' : `Due ${due.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`}
          </span>
        )}
      </div>
    </div>
  )
}
