import { useState, useMemo } from 'react'

interface Chat { id: number; title: string; created_at: string }

interface Props {
  chats: Chat[]
  activeChatId: number | null
  currentView: 'chat' | 'settings'
  onSelectChat: (id: number) => void
  onNewChat: () => void
  onDeleteChat: (id: number) => void
  onOpenSettings: () => void
  dark: boolean
  onToggleTheme: () => void
}

function groupByDate(chats: Chat[]): { label: string; items: Chat[] }[] {
  const now = new Date()
  const today    = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday= new Date(today); yesterday.setDate(today.getDate() - 1)
  const week     = new Date(today); week.setDate(today.getDate() - 7)
  const month    = new Date(today); month.setDate(today.getDate() - 30)

  const groups: { [key: string]: Chat[] } = {
    Today: [], Yesterday: [], 'Last 7 days': [], 'Last 30 days': [], Older: []
  }

  for (const chat of chats) {
    const d = new Date(chat.created_at)
    if (d >= today)      groups['Today'].push(chat)
    else if (d >= yesterday) groups['Yesterday'].push(chat)
    else if (d >= week)  groups['Last 7 days'].push(chat)
    else if (d >= month) groups['Last 30 days'].push(chat)
    else                 groups['Older'].push(chat)
  }

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }))
}

export function Sidebar({
  chats, activeChatId, currentView,
  onSelectChat, onNewChat, onDeleteChat,
  onOpenSettings, dark, onToggleTheme,
}: Props) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() =>
    search.trim()
      ? chats.filter(c => c.title.toLowerCase().includes(search.toLowerCase()))
      : chats,
    [chats, search]
  )

  const groups = useMemo(() =>
    search.trim()
      ? [{ label: 'Results', items: filtered }]
      : groupByDate(filtered),
    [filtered, search]
  )

  return (
    <div className="sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <div className="logo-row">
          <div className="logo-mark">
            <div className="logo-icon">P</div>
            <div className="logo-name">Practice OS</div>
          </div>
          <div className="header-actions">
            <button className="icon-btn" onClick={onNewChat} title="New chat (Ctrl+N)">
              ✎
            </button>
          </div>
        </div>
        <div className="logo-sub">CA Intelligence Suite</div>

        {/* Search */}
        <div className="sidebar-search" style={{ marginTop: 10 }}>
          <span className="sidebar-search-icon">⌕</span>
          <input
            placeholder="Search conversations…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Body */}
      <div className="sidebar-body">
        <button className="new-chat-btn" onClick={onNewChat}>
          <span>＋</span>
          <span>New conversation</span>
          <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.5 }}>⌃N</span>
        </button>

        {groups.length === 0 && (
          <div className="sidebar-empty">
            {search ? `No results for "${search}"` : 'No conversations yet.\nStart one above.'}
          </div>
        )}

        {groups.map(group => (
          <div key={group.label}>
            <div className="chat-group-label">{group.label}</div>
            {group.items.map(chat => (
              <div
                key={chat.id}
                className={`chat-item ${activeChatId === chat.id && currentView === 'chat' ? 'active' : ''}`}
                onClick={() => onSelectChat(chat.id)}
              >
                <div className="chat-item-icon">💬</div>
                <span className="chat-item-title">
                  {chat.title === '…' || chat.title === 'New Chat' ? 'Untitled' : chat.title}
                </span>
                <button
                  className="chat-del-btn"
                  onClick={e => { e.stopPropagation(); onDeleteChat(chat.id) }}
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="sidebar-footer">
        <button
          className={`settings-btn ${currentView === 'settings' ? 'active' : ''}`}
          onClick={onOpenSettings}
        >
          <span className="settings-btn-icon">⚙</span>
          <span>Settings & Integrations</span>
          <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.5 }}>⌃,</span>
        </button>
      </div>
    </div>
  )
}
