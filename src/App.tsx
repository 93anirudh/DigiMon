import { useEffect, useState, useCallback } from 'react'
import { useTheme } from './hooks/useTheme'
import { Sidebar } from './components/Sidebar'
import { ChatView } from './components/ChatView'
import { SettingsView } from './components/SettingsView'
import { ApprovalModal } from './components/ApprovalModal'
import { SetupWizard } from './components/SetupWizard'
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
    from: string; hasGrok: boolean; hasGemini: boolean; message?: string
  } | null>(null)
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const loadChats = useCallback(async () => {
    const data = await window.electronAPI.getChats()
    setChats(data as Chat[])
  }, [])

  const checkSetup = useCallback(async () => {
    const n = await window.electronAPI.needsSetup()
    setNeedsSetup(n)
  }, [])

  useEffect(() => {
    checkSetup()
    loadChats()
    window.electronAPI.getProvider().then(p => setActiveProvider(p))
    window.electronAPI.onApprovalRequired(data => setApproval(data))
    window.electronAPI.onProviderChange(p => setActiveProvider(p))
    window.electronAPI.onQuotaHit(data => setQuotaHit(data))
    window.electronAPI.onChatTitled(({ chatId, title }) => {
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, title } : c))
    })
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault(); handleNewChat()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault(); setView(v => v === 'settings' ? 'chat' : 'settings')
      }
      if (e.key === 'Escape' && view === 'settings') setView('chat')
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
    setToast(`Now using ${to === 'gemini' ? 'Gemini' : 'Grok'}`)
    setTimeout(() => setToast(null), 2500)
  }

  const handleSetupComplete = () => {
    setNeedsSetup(false)
  }

  const activeChat = chats.find(c => c.id === activeChatId)

  // Show wizard until we know the answer AND it's true
  if (needsSetup === true) {
    return (
      <div className="app-shell">
        <SetupWizard onComplete={handleSetupComplete} />
      </div>
    )
  }

  return (
    <div className="app-shell">
      {approval && (
        <ApprovalModal
          toolName={approval.toolName}
          toolArgs={approval.toolArgs}
          onApprove={() => handleApproval(true)}
          onReject={() => handleApproval(false)}
        />
      )}

      {quotaHit && (
        <div className="overlay">
          <div className="modal">
            <div className="modal-hdr">
              <div className="modal-icon-wrap info">⚡</div>
              <div>
                <div className="modal-title">Rate limit reached</div>
                <div className="modal-sub">
                  {quotaHit.message ?? `${quotaHit.from === 'gemini' ? 'Gemini' : 'Grok'} hit its rate limit`}
                </div>
              </div>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20, lineHeight: 1.65 }}>
              {quotaHit.from === 'gemini' && quotaHit.hasGrok
                ? 'Switch to Grok (xAI) to keep going.'
                : quotaHit.from === 'grok' && quotaHit.hasGemini
                ? 'Switch back to Gemini to keep going.'
                : 'No backup provider set up. Add a second API key in Settings → Advanced, or wait a minute.'}
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

      {/* Subtle toast for auto-switch and manual switch */}
      {toast && <div className="toast">{toast}</div>}

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
            onSwitchProvider={handleSwitchProvider}
          />
        ) : (
          <WelcomeScreen onSelectSuggestion={async (text) => {
            const id = await window.electronAPI.createChat('…')
            await loadChats()
            setActiveChatId(id)
            setView('chat')
            setTimeout(() => { window._pendingSuggestion = text }, 100)
          }} />
        )}
      </div>
    </div>
  )
}

declare global { interface Window { _pendingSuggestion?: string } }

const SUGGESTIONS = [
  { icon: '📋', title: 'GST Filing Workflow', desc: 'Show GSTR-3B process as a flowchart',
    prompt: 'Show me the complete GSTR-3B monthly filing process as a detailed Mermaid flowchart.' },
  { icon: '📊', title: 'TDS Rate Table', desc: 'All TDS sections for FY 2024-25',
    prompt: 'Create a markdown table of TDS rates for FY 2024-25 covering sections 192, 194A, 194C, 194D, 194H, 194I, 194J, 194Q.' },
  { icon: '🗂️', title: '3CD Audit Checklist', desc: 'Clause-wise tax audit checklist',
    prompt: 'Generate a Form 3CD tax audit checklist organised by clause number, as a table.' },
  { icon: '📅', title: 'Compliance Calendar', desc: 'Key dates for this month',
    prompt: 'Create a compliance calendar for this month as a table — GST, TDS, ROC, income tax due dates.' },
]

function WelcomeScreen({ onSelectSuggestion }: { onSelectSuggestion: (text: string) => void }) {
  return (
    <div className="welcome-screen">
      <div className="welcome-logo">🏛️</div>
      <div className="welcome-title">DigiMon</div>
      <div className="welcome-sub">
        Your CA-practice agent. Ask about GST, TDS, ITR, audit, or have it run commands on your machine — with tables and diagrams built in.
      </div>

      <div className="suggestion-grid">
        {SUGGESTIONS.map((s, i) => (
          <button key={i} className="suggestion-card" onClick={() => onSelectSuggestion(s.prompt)}>
            <span className="suggestion-icon">{s.icon}</span>
            <div className="suggestion-title">{s.title}</div>
            <div className="suggestion-desc">{s.desc}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
