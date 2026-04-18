import { useEffect, useState, useCallback } from 'react'
import { Sidebar } from './components/Sidebar'
import { ChatView } from './components/ChatView'
import { SettingsView } from './components/SettingsView'
import { ApprovalModal } from './components/ApprovalModal'
import { SetupWizard } from './components/SetupWizard'
import './index.css'

interface Chat { id: number; title: string; created_at: string }
interface ApprovalRequest { toolName: string; toolArgs: Record<string, any> }

export default function App() {
  const [chats, setChats] = useState<Chat[]>([])
  const [activeChatId, setActiveChatId] = useState<number | null>(null)
  const [view, setView] = useState<'chat' | 'settings'>('chat')
  const [approval, setApproval] = useState<ApprovalRequest | null>(null)
  const [activeModel, setActiveModel] = useState<string>('gemini-3-pro')
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
    window.electronAPI.getModel().then(m => setActiveModel(m))
    window.electronAPI.onApprovalRequired(data => setApproval(data))
    window.electronAPI.onModelChange(m => setActiveModel(m))
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

  const handleSwitchModel = async (to: string) => {
    await window.electronAPI.setModel(to)
    setActiveModel(to)
    const label = to === 'gemini-3-pro' ? 'Gemini Super'
                : to === 'gemini-2.5-pro' ? 'Gemini Smart'
                : 'Gemini Flash'
    setToast(`Now using ${label}`)
    setTimeout(() => setToast(null), 2500)
  }

  const handleSetupComplete = () => {
    setNeedsSetup(false)
  }

  const activeChat = chats.find(c => c.id === activeChatId)

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

      {toast && <div className="toast">{toast}</div>}

      <Sidebar
        chats={chats}
        activeChatId={activeChatId}
        currentView={view}
        onSelectChat={id => { setActiveChatId(id); setView('chat') }}
        onNewChat={handleNewChat}
        onGoHome={() => { setActiveChatId(null); setView('chat') }}
        onDeleteChat={handleDeleteChat}
        onOpenSettings={() => setView('settings')}
      />

      <div className="main-content">
        {view === 'settings' ? (
          <SettingsView />
        ) : activeChatId && activeChat ? (
          <ChatView
            chatId={activeChatId}
            chatTitle={activeChat.title}
            activeModel={activeModel}
            dark={true}
            onSwitchModel={handleSwitchModel}
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
  { icon: '📋', title: 'GST filing process',
    prompt: 'Show me the complete GSTR-3B monthly filing process as a detailed Mermaid flowchart.' },
  { icon: '📊', title: 'TDS rate table',
    prompt: 'Create a markdown table of TDS rates for FY 2024-25 covering sections 192, 194A, 194C, 194D, 194H, 194I, 194J, 194Q.' },
  { icon: '🗂️', title: '3CD audit checklist',
    prompt: 'Generate a Form 3CD tax audit checklist organised by clause number, as a table.' },
  { icon: '📅', title: 'Compliance calendar',
    prompt: 'Create a compliance calendar for this month as a table — GST, TDS, ROC, income tax due dates.' },
  { icon: '💡', title: 'Help me draft an email',
    prompt: 'Help me draft a polite email to a client asking for pending GST invoice details before the return due date.' },
]

function greetingForTime(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function WelcomeScreen({ onSelectSuggestion }: { onSelectSuggestion: (text: string) => void }) {
  return (
    <div className="welcome-screen">
      <div className="welcome-logo" />
      <div className="welcome-title">{greetingForTime()}</div>
      <div className="welcome-sub">
        How can I help you today?
      </div>

      <div className="suggestion-grid">
        {SUGGESTIONS.map((s, i) => (
          <button key={i} className="suggestion-card" onClick={() => onSelectSuggestion(s.prompt)}>
            <span className="suggestion-icon">{s.icon}</span>
            <span className="suggestion-title">{s.title}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
