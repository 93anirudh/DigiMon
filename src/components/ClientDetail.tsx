import { useEffect, useState, useCallback } from 'react'
import type { Client, Task, TaskStatus } from '../types/practice'
import { STATUS_LABELS, WORKFLOW_LABELS } from '../types/practice'
import { ClientForm } from './ClientForm'
import { NewTaskForm } from './NewTaskForm'

interface Props {
  clientId: number
  onBack: () => void
  onClientDeleted: () => void
  onOpenCopilot: (chatId: number) => void
  onOpenTask: (taskId: number) => void
}

type Tab = 'overview' | 'tasks' | 'copilot'

export function ClientDetail({ clientId, onBack, onClientDeleted, onOpenCopilot, onOpenTask }: Props) {
  const [client, setClient] = useState<Client | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [tab, setTab] = useState<Tab>('overview')
  const [showEdit, setShowEdit] = useState(false)
  const [showNewTask, setShowNewTask] = useState(false)

  const reload = useCallback(async () => {
    const [c, t] = await Promise.all([
      window.electronAPI.getClient(clientId),
      window.electronAPI.listTasksForClient(clientId),
    ])
    setClient(c || null)
    setTasks(t)
  }, [clientId])

  useEffect(() => { reload() }, [reload])

  const handleDelete = async () => {
    if (!client) return
    if (!confirm(`Delete ${client.name}? All tasks and files will be removed. This cannot be undone.`)) return
    await window.electronAPI.deleteClient(client.id)
    onClientDeleted()
  }

  const handleNewCopilotChat = async () => {
    const chatId = await window.electronAPI.createChat(client ? `${client.name} — Co-pilot` : 'Co-pilot')
    onOpenCopilot(chatId)
  }

  if (!client) {
    return <div style={{ padding: 28, color: 'var(--text2)' }}>Loading…</div>
  }

  const openTasks = tasks.filter(t => t.status !== 'completed').length
  const flagged = tasks.filter(t => t.status === 'flagged' || t.status === 'needs_input').length

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '16px 28px',
        borderBottom: '1px solid var(--border)',
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'transparent', border: 'none', color: 'var(--text2)',
            cursor: 'pointer', fontSize: 13, padding: 0, marginBottom: 10,
          }}
        >
          ← All Clients
        </button>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)' }}>{client.name}</h1>
            <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 12, color: 'var(--text2)', flexWrap: 'wrap' }}>
              {client.gstin && <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>GSTIN: {client.gstin}</span>}
              {client.pan && <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>PAN: {client.pan}</span>}
              {client.business_type && <span>{client.business_type}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowEdit(true)} style={btnGhostSmall}>Edit</button>
            <button onClick={handleDelete} style={{ ...btnGhostSmall, color: '#EF4444' }}>Delete</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginTop: 16, borderBottom: '1px solid var(--border)', marginLeft: -28, marginRight: -28, paddingLeft: 28, paddingRight: 28 }}>
          {([
            { id: 'overview', label: 'Overview' },
            { id: 'tasks',    label: `Tasks${openTasks > 0 ? ` · ${openTasks}` : ''}` },
            { id: 'copilot',  label: 'Co-pilot' },
          ] as { id: Tab; label: string }[]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                background: 'transparent',
                border: 'none',
                color: tab === t.id ? 'var(--text)' : 'var(--text2)',
                padding: '10px 14px',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: 28 }}>
        {tab === 'overview' && (
          <Overview
            client={client}
            taskCount={tasks.length}
            openTasks={openTasks}
            flagged={flagged}
          />
        )}

        {tab === 'tasks' && (
          <TasksTab
            tasks={tasks}
            onNewTask={() => setShowNewTask(true)}
            onChange={reload}
            onOpenTask={onOpenTask}
          />
        )}

        {tab === 'copilot' && (
          <CopilotTab onStart={handleNewCopilotChat} />
        )}
      </div>

      {showEdit && (
        <ClientForm
          existing={client}
          onClose={() => setShowEdit(false)}
          onSaved={async () => { setShowEdit(false); await reload() }}
        />
      )}

      {showNewTask && (
        <NewTaskForm
          presetClientId={client.id}
          onClose={() => setShowNewTask(false)}
          onSaved={async () => { setShowNewTask(false); await reload() }}
        />
      )}
    </div>
  )
}

// ── Overview Tab ─────────────────────────────────────────

function Overview({
  client, taskCount, openTasks, flagged,
}: {
  client: Client
  taskCount: number
  openTasks: number
  flagged: number
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 720 }}>
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <Stat label="All Tasks" value={taskCount} />
        <Stat label="Open" value={openTasks} accent />
        <Stat label="Need Attention" value={flagged} warn={flagged > 0} />
      </div>

      {/* Contact info */}
      <Section title="Contact">
        <InfoRow label="Email" value={client.contact_email} />
        <InfoRow label="Phone" value={client.contact_phone} />
        <InfoRow label="FY End" value={`Mar 31 (${client.fy_end})`} />
      </Section>

      {client.notes && (
        <Section title="Notes">
          <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {client.notes}
          </div>
        </Section>
      )}
    </div>
  )
}

function Stat({ label, value, accent, warn }: { label: string; value: number; accent?: boolean; warn?: boolean }) {
  const color = warn ? '#F59E0B' : accent ? 'var(--accent)' : 'var(--text)'
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: 14,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 600, color }}>{value}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, fontWeight: 600 }}>
        {title}
      </div>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 16,
      }}>
        {children}
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      padding: '8px 0',
      borderBottom: '1px solid var(--border)',
      fontSize: 13,
    }}>
      <span style={{ color: 'var(--text2)' }}>{label}</span>
      <span style={{ color: value ? 'var(--text)' : 'var(--text4)' }}>{value || '—'}</span>
    </div>
  )
}

// ── Tasks Tab ────────────────────────────────────────────

function TasksTab({
  tasks, onNewTask, onChange, onOpenTask,
}: {
  tasks: Task[]
  onNewTask: () => void
  onChange: () => void
  onOpenTask: (taskId: number) => void
}) {
  const cycleStatus = async (e: React.MouseEvent, task: Task) => {
    e.stopPropagation()
    const flow: TaskStatus[] = ['not_started', 'in_progress', 'needs_input', 'completed']
    const idx = flow.indexOf(task.status)
    const next = idx === -1 ? 'in_progress' : flow[(idx + 1) % flow.length]
    await window.electronAPI.updateTaskStatus(task.id, next)
    onChange()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button
          onClick={onNewTask}
          style={{
            background: 'var(--accent)', color: 'white', border: 'none',
            padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}
        >
          + New Task
        </button>
      </div>

      {tasks.length === 0 ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
          No tasks yet. Create one to get started.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tasks.map(t => (
            <div
              key={t.id}
              onClick={() => onOpenTask(t.id)}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
              }}
              title="Open task"
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>
                  {WORKFLOW_LABELS[t.workflow as keyof typeof WORKFLOW_LABELS] || t.workflow}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                  {t.period}{t.due_date ? ` · Due ${new Date(t.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}` : ''}
                </div>
              </div>
              <div onClick={e => cycleStatus(e, t)} title="Click to advance status">
                <StatusBadge status={t.status} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const colors: Record<TaskStatus, { bg: string; fg: string }> = {
    not_started: { bg: 'rgba(113, 113, 122, 0.18)', fg: '#A1A1AA' },
    in_progress: { bg: 'rgba(99, 102, 241, 0.18)',  fg: '#818CF8' },
    needs_input: { bg: 'rgba(168, 85, 247, 0.18)',  fg: '#C084FC' },
    flagged:     { bg: 'rgba(245, 158, 11, 0.18)',  fg: '#FBBF24' },
    completed:   { bg: 'rgba(34, 197, 94, 0.18)',   fg: '#4ADE80' },
  }
  const c = colors[status]
  return (
    <span style={{
      background: c.bg, color: c.fg,
      padding: '4px 10px', borderRadius: 6,
      fontSize: 11, fontWeight: 600,
    }}>
      {STATUS_LABELS[status]}
    </span>
  )
}

// ── Co-pilot Tab ─────────────────────────────────────────

function CopilotTab({ onStart }: { onStart: () => void }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '60px 20px', color: 'var(--text2)',
    }}>
      <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>💬</div>
      <div style={{ fontSize: 16, color: 'var(--text)', marginBottom: 6 }}>Ask the Co-pilot</div>
      <div style={{ fontSize: 13, marginBottom: 20, textAlign: 'center', maxWidth: 360 }}>
        Adhoc questions about this client — pull recent emails, summarise documents, draft replies.
      </div>
      <button
        onClick={onStart}
        style={{
          background: 'var(--accent)', color: 'white', border: 'none',
          padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
        }}
      >
        Start a chat
      </button>
    </div>
  )
}

const btnGhostSmall: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--text2)',
  border: '1px solid var(--border-md)',
  padding: '6px 12px',
  borderRadius: 7,
  fontSize: 12,
  cursor: 'pointer',
}
