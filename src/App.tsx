import { useEffect, useState, useCallback } from 'react'
import { useTheme } from './hooks/useTheme'
import { Sidebar } from './components/Sidebar'
import { ChatView } from './components/ChatView'
import { SettingsView } from './components/SettingsView'
import { ApprovalModal } from './components/ApprovalModal'
import './index.css'

interface Chat { id: number; title: string; created_at: string }
interface ApprovalRequest { toolName: string; toolArgs: Record<string, any> }

export default function App() {
  const { dark, toggle } = useTheme()
  const [chats, setChats] = useState<Chat[]>([])
  const [activeChatId, setActiveChatId] = useState<number | null>(null)
  const [view, setView] = useState<'chat' | 'settings'>('chat')
  const [approval, setApproval] = useState<ApprovalRequest | null>(null)
  const [activeProvider, setActiveProvider] = useState<string>('gemini')
  const [quotaHit, setQuotaHit] = useState<{
    from: string; hasGrok: boolean; hasGemini: boolean
  } | null>(null)

  const loadChats = useCallback(async () => {
    const data = await window.electronAPI.getChats()
    setChats(data as Chat[])
  }, [])

  useEffect(() => {
    loadChats()
    window.electronAPI.getProvider().then(p => setActiveProvider(p))
    window.electronAPI.onApprovalRequired(data => setApproval(data))
    window.electronAPI.onProviderChange(p => setActiveProvider(p))
    window.electronAPI.onQuotaHit(data => setQuotaHit(data))
    window.electronAPI.onChatTitled(({ chatId, title }) => {
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, title } : c))
    })
  }, [])

  // ── Keyboard shortcuts ────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+N = New chat
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        handleNewChat()
      }
      // Ctrl+, = Settings
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault()
        setView(v => v === 'settings' ? 'chat' : 'settings')
      }
      // Escape = close settings
      if (e.key === 'Escape' && view === 'settings') {
        setView('chat')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [view])

  const handleNewChat = async () => {
    const id = await window.electronAPI.createChat('…')
    await loadChats()
    setActiveChatId(id)
    setView('chat')
  }

  const handleDeleteChat = async (id: number) => {
    await window.electronAPI.deleteChat(id)
    if (activeChatId === id) setActiveChatId(null)
    await loadChats()
  }

  const handleApproval = async (approved: boolean) => {
    await window.electronAPI.approveToolCall(approved)
    setApproval(null)
  }

  const handleSwitchProvider = async (to: string) => {
    await window.electronAPI.setProvider(to)
    setActiveProvider(to)
    setQuotaHit(null)
  }

  const activeChat = chats.find(c => c.id === activeChatId)

  return (
    <div className="app-shell">
      {/* Approval Modal */}
      {approval && (
        <ApprovalModal
          toolName={approval.toolName}
          toolArgs={approval.toolArgs}
          onApprove={() => handleApproval(true)}
          onReject={() => handleApproval(false)}
        />
      )}

      {/* Quota Modal */}
      {quotaHit && (
        <div className="overlay">
          <div className="modal">
            <div className="modal-hdr">
              <div className="modal-icon-wrap info">⚡</div>
              <div>
                <div className="modal-title">Quota Limit Reached</div>
                <div className="modal-sub">
                  {quotaHit.from === 'gemini' ? 'Gemini' : 'Grok'} has hit its rate limit
                </div>
              </div>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20, lineHeight: 1.65 }}>
              {quotaHit.from === 'gemini' && quotaHit.hasGrok
                ? 'Switch to Grok (xAI) to continue this session without interruption.'
                : quotaHit.from === 'grok' && quotaHit.hasGemini
                ? 'Switch back to Gemini to continue.'
                : 'No backup provider configured. Add a second API key in Settings, or wait for the quota to reset.'}
            </p>
            <div className="modal-btns">
              {((quotaHit.from === 'gemini' && quotaHit.hasGrok) ||
                (quotaHit.from === 'grok' && quotaHit.hasGemini)) && (
                <button className="btn-primary"
                  onClick={() => handleSwitchProvider(quotaHit.from === 'gemini' ? 'grok' : 'gemini')}>
                  Switch to {quotaHit.from === 'gemini' ? 'Grok' : 'Gemini'}
                </button>
              )}
              <button className="btn-ghost" onClick={() => setQuotaHit(null)}>Dismiss</button>
            </div>
          </div>
        </div>
      )}

      <Sidebar
        chats={chats}
        activeChatId={activeChatId}
        currentView={view}
        onSelectChat={id => { setActiveChatId(id); setView('chat') }}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
        onOpenSettings={() => setView('settings')}
        dark={dark}
        onToggleTheme={toggle}
      />

      <div className="main-content">
        {view === 'settings' ? (
          <SettingsView />
        ) : activeChatId && activeChat ? (
          <ChatView
            chatId={activeChatId}
            chatTitle={activeChat.title}
            activeProvider={activeProvider}
            dark={dark}
            onSendSuggestion={async (text) => {
              // handled inside ChatView, this is a passthrough
            }}
          />
        ) : (
          <WelcomeScreen onNewChat={handleNewChat} onSelectSuggestion={async (text) => {
            const id = await window.electronAPI.createChat('…')
            await loadChats()
            setActiveChatId(id)
            setView('chat')
            // Small delay to let ChatView mount, then send
            setTimeout(() => {
              window._pendingSuggestion = text
            }, 100)
          }} />
        )}
      </div>
    </div>
  )
}

// ── Welcome / Empty Screen ────────────────────────────
declare global { interface Window { _pendingSuggestion?: string } }

const SUGGESTIONS = [
  {
    icon: '📋',
    title: 'GST Filing Workflow',
    desc: 'Show me the complete GSTR-3B filing process as a flowchart',
    prompt: 'Show me the complete GSTR-3B monthly filing process as a detailed Mermaid flowchart, including all steps from data compilation to filing.',
  },
  {
    icon: '📊',
    title: 'TDS Compliance Table',
    desc: 'Create a reference table for TDS rates under different sections',
    prompt: 'Create a comprehensive markdown table of TDS rates under the Income Tax Act for FY 2024-25, covering all major sections (192, 194A, 194C, 194D, 194H, 194I, 194J, 194Q etc.).',
  },
  {
    icon: '🗂️',
    title: 'Tax Audit Checklist',
    desc: 'Generate a 3CD tax audit checklist for my client',
    prompt: 'Generate a comprehensive Form 3CD tax audit checklist organized by clause number, with key points to verify for each clause. Present it as a structured table.',
  },
  {
    icon: '📅',
    title: 'Compliance Calendar',
    desc: 'Show all key CA compliance dates for this month',
    prompt: 'Create a compliance calendar for the current month as a Gantt chart or table, including all GST, TDS, ROC, and income tax due dates.',
  },
]

function WelcomeScreen({ onNewChat, onSelectSuggestion }: {
  onNewChat: () => void
  onSelectSuggestion: (text: string) => void
}) {
  return (
    <div className="welcome-screen">
      <div className="welcome-logo">🏛️</div>
      <div className="welcome-title">Practice OS</div>
      <div className="welcome-sub">
        Your intelligent CA assistant. Ask about GST, TDS, ITR, audit workflows,
        or any compliance matter — with tables and diagrams built in.
      </div>

      <div className="suggestion-grid">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={i}
            className="suggestion-card"
            onClick={() => onSelectSuggestion(s.prompt)}
          >
            <span className="suggestion-icon">{s.icon}</span>
            <div className="suggestion-title">{s.title}</div>
            <div className="suggestion-desc">{s.desc}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
