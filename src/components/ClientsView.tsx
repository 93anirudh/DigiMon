import { useEffect, useState, useCallback } from 'react'
import type { Client, TaskWithClient } from '../types/practice'
import { ClientForm } from './ClientForm'
import { KanbanView } from './KanbanView'

interface Props {
  onOpenClient: (clientId: number) => void
}

type Tab = 'cards' | 'kanban'

export function ClientsView({ onOpenClient }: Props) {
  const [tab, setTab] = useState<Tab>('cards')
  const [clients, setClients] = useState<Client[]>([])
  const [tasks, setTasks] = useState<TaskWithClient[]>([])
  const [showNewClient, setShowNewClient] = useState(false)
  const [counts, setCounts] = useState<{ totalClients: number; tasksByStatus: Record<string, number> } | null>(null)
  const [search, setSearch] = useState('')

  const reload = useCallback(async () => {
    const [c, t, k] = await Promise.all([
      window.electronAPI.listClients(false),
      window.electronAPI.listAllTasks(),
      window.electronAPI.dashboardCounts(),
    ])
    setClients(c)
    setTasks(t)
    setCounts(k)
  }, [])

  useEffect(() => { reload() }, [reload])

  const filtered = clients.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.gstin || '').toLowerCase().includes(search.toLowerCase())
  )

  const taskCountByClient = tasks.reduce((acc, t) => {
    if (t.status !== 'completed') acc[t.client_id] = (acc[t.client_id] || 0) + 1
    return acc
  }, {} as Record<number, number>)

  const flaggedByClient = tasks.reduce((acc, t) => {
    if (t.status === 'flagged' || t.status === 'needs_input') {
      acc[t.client_id] = (acc[t.client_id] || 0) + 1
    }
    return acc
  }, {} as Record<number, number>)

  return (
    <div className="practice-view" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '20px 28px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)' }}>Practice</h1>
            {counts && (
              <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
                {counts.totalClients} clients · {(counts.tasksByStatus.in_progress || 0) + (counts.tasksByStatus.not_started || 0)} open tasks
                {counts.tasksByStatus.flagged > 0 && (
                  <span style={{ color: '#F59E0B', marginLeft: 10 }}>
                    · {counts.tasksByStatus.flagged} flagged
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => setShowNewClient(true)}
            style={{
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              padding: '9px 16px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            + New Client
          </button>
        </div>

        {/* Tabs + Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', background: 'var(--surface)', borderRadius: 8, padding: 3 }}>
            {(['cards', 'kanban'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '6px 14px',
                  background: tab === t ? 'var(--surface3)' : 'transparent',
                  color: tab === t ? 'var(--text)' : 'var(--text2)',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === 'cards' && (
            <input
              type="text"
              placeholder="Search clients..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                flex: 1,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                padding: '8px 12px',
                borderRadius: 8,
                fontSize: 13,
                outline: 'none',
              }}
            />
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: 28 }}>
        {tab === 'cards' && (
          <>
            {filtered.length === 0 ? (
              <EmptyClientsState onCreate={() => setShowNewClient(true)} />
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 14,
              }}>
                {filtered.map(c => (
                  <ClientCard
                    key={c.id}
                    client={c}
                    openTaskCount={taskCountByClient[c.id] || 0}
                    flaggedCount={flaggedByClient[c.id] || 0}
                    onClick={() => onOpenClient(c.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'kanban' && (
          <KanbanView
            tasks={tasks}
            onChange={reload}
            onOpenClient={onOpenClient}
          />
        )}
      </div>

      {showNewClient && (
        <ClientForm
          onClose={() => setShowNewClient(false)}
          onSaved={async () => { setShowNewClient(false); await reload() }}
        />
      )}
    </div>
  )
}

// ── Client Card ───────────────────────────────────────────

function ClientCard({
  client, openTaskCount, flaggedCount, onClick,
}: {
  client: Client
  openTaskCount: number
  flaggedCount: number
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 16,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-accent)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 15, fontWeight: 600, color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {client.name}
          </div>
          {client.gstin && (
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace', marginTop: 3 }}>
              {client.gstin}
            </div>
          )}
        </div>
        {flaggedCount > 0 && (
          <span style={{
            background: 'rgba(245, 158, 11, 0.15)',
            color: '#F59E0B',
            padding: '3px 7px',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
          }}>
            {flaggedCount} ⚠
          </span>
        )}
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 10,
        paddingTop: 10,
        borderTop: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: 12, color: 'var(--text2)' }}>
          {openTaskCount === 0 ? 'No open tasks' : `${openTaskCount} open task${openTaskCount === 1 ? '' : 's'}`}
        </span>
        {client.business_type && (
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>{client.business_type}</span>
        )}
      </div>
    </div>
  )
}

function EmptyClientsState({ onCreate }: { onCreate: () => void }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '80px 20px',
      color: 'var(--text2)',
    }}>
      <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>📋</div>
      <div style={{ fontSize: 16, color: 'var(--text)', marginBottom: 6 }}>No clients yet</div>
      <div style={{ fontSize: 13, marginBottom: 20 }}>Add your first client to get started.</div>
      <button
        onClick={onCreate}
        style={{
          background: 'var(--accent)',
          color: 'white',
          border: 'none',
          padding: '10px 18px',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        + Add Client
      </button>
    </div>
  )
}
