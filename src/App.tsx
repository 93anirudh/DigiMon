import { useEffect, useState, useCallback } from 'react'
import { Sidebar } from './components/Sidebar'
import { ChatView } from './components/ChatView'
import { SettingsView } from './components/SettingsView'
import { ApprovalModal } from './components/ApprovalModal'
import { SetupWizard } from './components/SetupWizard'
import { ClientsView } from './components/ClientsView'
import { ClientDetail } from './components/ClientDetail'
import './index.css'

interface Chat { id: number; title: string; created_at: string }
interface ApprovalRequest { toolName: string; toolArgs: Record<string, any> }

type View = 'practice' | 'practice-detail' | 'chat' | 'settings'

export default function App() {
  const [chats, setChats] = useState<Chat[]>([])
  const [activeChatId, setActiveChatId] = useState<number | null>(null)
  const [activeClientId, setActiveClientId] = useState<number | null>(null)
  const [view, setView] = useState<View>('practice')
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
        e.preventDefault(); setView(v => v === 'settings' ? 'practice' : 'settings')
      }
      if (e.key === 'Escape' && view === 'settings') setView('practice')
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

  const goToPractice = () => {
    setActiveClientId(null)
    setActiveChatId(null)
    setView('practice')
  }

  const openClient = (clientId: number) => {
    setActiveClientId(clientId)
    setView('practice-detail')
  }

  const openCopilotFromClient = async (chatId: number) => {
    await loadChats()
    setActiveChatId(chatId)
    setView('chat')
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
        onSelectChat={(id: number) => { setActiveChatId(id); setView('chat') }}
        onNewChat={handleNewChat}
        onGoHome={goToPractice}
        onGoPractice={goToPractice}
        onDeleteChat={handleDeleteChat}
        onOpenSettings={() => setView('settings')}
      />

      <div className="main-content">
        {view === 'settings' ? (
          <SettingsView />
        ) : view === 'practice' ? (
          <ClientsView onOpenClient={openClient} />
        ) : view === 'practice-detail' && activeClientId !== null ? (
          <ClientDetail
            clientId={activeClientId}
            onBack={goToPractice}
            onClientDeleted={goToPractice}
            onOpenCopilot={openCopilotFromClient}
          />
        ) : view === 'chat' && activeChatId && activeChat ? (
          <ChatView
            chatId={activeChatId}
            chatTitle={activeChat.title}
            activeModel={activeModel}
            onSwitchModel={handleSwitchModel}
          />
        ) : (
          <ClientsView onOpenClient={openClient} />
        )}
      </div>
    </div>
  )
}

declare global { interface Window { _pendingSuggestion?: string } }
