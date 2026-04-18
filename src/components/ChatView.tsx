import { useEffect, useRef, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { UsageMeter } from './UsageMeter'
import { ModelDropdown } from './ModelDropdown'
import { DiagramRenderer, DiagramError, parseDiagramSpec } from './DiagramRenderer'

// ── Diagram handling ──────────────────────────────────
// The LLM emits:  ```digimon-diagram  \n  {JSON}  \n  ```
// We catch it in the code-block renderer below and send to DiagramRenderer.
// No mermaid parser, no escape-hell — just JSON.
function DiagramBlock({ code }: { code: string }) {
  const result = parseDiagramSpec(code)
  if (!result.ok) {
    return <DiagramError raw={code} error={result.error} />
  }
  return <DiagramRenderer spec={result.spec} />
}


function timeAgo(dateStr: string): string {
  const d = new Date(dateStr), now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

const MODEL_LABEL: Record<string, string> = {
  'gemini-3-pro':     'Gemini Super',
  'gemini-2.5-pro':   'Gemini Smart',
  'gemini-2.5-flash': 'Gemini Flash',
}

// Cycle through models in order: 3-pro → 2.5-pro → 2.5-flash → back to 3-pro
function nextModel(current: string): string {
  const chain = ['gemini-3-pro', 'gemini-2.5-pro', 'gemini-2.5-flash']
  const idx = chain.indexOf(current)
  return chain[(idx + 1) % chain.length]
}

interface Step {
  type: string; toolName?: string; toolArgs?: any
  result?: string; iteration?: number
  from?: string; to?: string; reason?: string
}

function StepRow({ step }: { step: Step }) {
  if (step.type === 'model_switched') {
    const toLabel = step.to && MODEL_LABEL[step.to] ? MODEL_LABEL[step.to] : step.to
    return (
      <div className="step-row">
        <span className="step-icon" style={{ color: 'var(--accent)' }}>⇄</span>
        <span className="step-text">
          Switched to <strong>{toLabel}</strong>
          {step.reason && (
            <span style={{ color: 'var(--text3)' }}> · {step.from} hit {step.reason}</span>
          )}
        </span>
      </div>
    )
  }
  if (step.type === 'thinking') return (
    <div className="step-row">
      <span className="step-icon" style={{ animation: 'breathe 1.5s ease infinite' }}>◌</span>
      <span className="step-text">Thinking…</span>
    </div>
  )
  if (step.type === 'tool_call') return (
    <div className="step-row">
      <span className="step-icon">⚙</span>
      <div className="step-text">
        <span className="step-tool">{step.toolName}</span>
        {step.toolArgs && (
          <span className="step-args">
            {Object.entries(step.toolArgs).slice(0, 2).map(([k, v]) =>
              ` ${k}="${String(v).slice(0, 35)}"`
            ).join('')}
          </span>
        )}
      </div>
    </div>
  )
  if (step.type === 'tool_result') return (
    <div className="step-row">
      <span className="step-icon step-result">✓</span>
      <span className="step-text step-result">{step.toolName} completed</span>
    </div>
  )
  return null
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  return (
    <button className={`action-btn ${copied ? 'copied' : ''}`} onClick={copy}>
      {copied ? '✓ Copied' : '⎘ Copy'}
    </button>
  )
}

interface Message { id: number; role: string; content: string; created_at?: string }

interface Props {
  chatId: number
  chatTitle: string
  activeModel: string
  onSwitchModel: (to: string) => void
}

export function ChatView({ chatId, chatTitle, activeModel, onSwitchModel }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamBuffer, setStreamBuffer] = useState('')
  const [steps, setSteps] = useState<Step[]>([])
  const [lastError, setLastError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const reloadMessages = useCallback(() =>
    window.electronAPI.getMessages(chatId).then(msgs => setMessages(msgs as Message[])),
    [chatId]
  )

  useEffect(() => {
    reloadMessages()
    window.electronAPI.removeListeners()

    window.electronAPI.onChunk(chunk => setStreamBuffer(p => p + chunk))

    window.electronAPI.onStep(step => {
      if (step.type === 'done' || step.type === 'usage') return
      setSteps(p => [...p, step])
    })

    window.electronAPI.onDone(() => {
      setStreaming(false); setSteps([]); setLastError(null)
      reloadMessages().then(() => setStreamBuffer(''))
    })

    window.electronAPI.onError(msg => {
      setStreaming(false); setSteps([]); setStreamBuffer('')
      setLastError(msg)
    })

    if (window._pendingSuggestion) {
      const text = window._pendingSuggestion
      delete window._pendingSuggestion
      sendText(text)
    }
  }, [chatId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamBuffer, steps, lastError])

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'
  }

  const sendText = async (text: string) => {
    if (!text.trim() || streaming) return
    setStreaming(true); setStreamBuffer(''); setSteps([]); setLastError(null)
    setMessages(prev => [...prev, {
      id: Date.now(), role: 'user', content: text,
      created_at: new Date().toISOString()
    }])
    await window.electronAPI.sendMessage(chatId, text)
  }

  const sendMessage = async () => {
    const text = input.trim(); if (!text) return
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    await sendText(text)
  }

  const handleRetry = async () => {
    setStreaming(true); setStreamBuffer(''); setSteps([]); setLastError(null)
    setMessages(prev => {
      const last = prev[prev.length - 1]
      return last?.role === 'assistant' ? prev.slice(0, -1) : prev
    })
    await window.electronAPI.retryLast(chatId)
  }

  const handleStop = async () => {
    await window.electronAPI.abortChat()
    // Backend will flush any partial response and fire 'done' — the
    // onDone handler flips streaming off and reloads messages.
  }

  // Click the pencil on your last user message → pulls it into the input
  // for editing, removes it from the list. Resubmitting is a fresh send.
  const handleEditLastUser = (content: string) => {
    if (streaming) return
    setInput(content)
    // Drop the last user msg (and its assistant reply if present) from local view.
    // DB already has them — that's fine, they stay as history unless user resends.
    setMessages(prev => {
      const copy = [...prev]
      // walk backwards: drop trailing assistant, then the user
      if (copy[copy.length - 1]?.role === 'assistant') copy.pop()
      if (copy[copy.length - 1]?.role === 'user') copy.pop()
      return copy
    })
    setTimeout(() => {
      textareaRef.current?.focus()
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 140) + 'px'
      }
    }, 0)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !streaming) {
      e.preventDefault(); sendMessage()
    }
  }

  const mdComponents: any = {
    code({ className, children }: any) {
      const lang = /language-(\w+)/.exec(className || '')?.[1]
      const code = String(children).replace(/\n$/, '')
      // New diagram format — structured JSON, no parser traps
      if (lang === 'digimon-diagram' || lang === 'flowchart' || lang === 'diagram') {
        return <DiagramBlock code={code} />
      }
      return <code className={className}>{children}</code>
    }
  }

  const renderMd = (content: string) => (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
      {content}
    </ReactMarkdown>
  )

  const isWaiting = streaming && !streamBuffer && steps.length === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="chat-header">
        <span className="chat-header-title">{chatTitle === '…' ? 'New conversation' : chatTitle}</span>
        <UsageMeter activeChatId={chatId} />
        <ModelDropdown activeModel={activeModel} onChange={onSwitchModel} />
        {streaming && <span className="status-pill">Thinking…</span>}
      </div>

      <div className="messages-area">
        {messages.map((msg, idx) => {
          const isLast = idx === messages.length - 1
          // Last user msg — either the very last, or second-last with an assistant reply after it
          const isLastUser = msg.role === 'user' && (
            isLast ||
            (idx === messages.length - 2 && messages[messages.length - 1]?.role === 'assistant')
          )
          if (msg.role === 'user') return (
            <div key={msg.id} className="message-group">
              <div className="message-user">
                {isLastUser && !streaming && (
                  <button
                    className="user-edit-btn"
                    onClick={() => handleEditLastUser(msg.content)}
                    title="Edit and resend"
                  >
                    ✎
                  </button>
                )}
                <div className="user-bubble">{msg.content}</div>
              </div>
            </div>
          )
          return (
            <div key={msg.id} className="message-group">
              <div className="message-assistant">
                <div className="assistant-meta">
                  <div className="assistant-avatar">D</div>
                  <span className="assistant-name">DigiMon</span>
                  {msg.created_at && (
                    <span className="assistant-time">{timeAgo(msg.created_at)}</span>
                  )}
                </div>
                <div className="assistant-body">{renderMd(msg.content)}</div>
                <div className="message-actions">
                  <CopyBtn text={msg.content} />
                  {isLast && (
                    <button className="action-btn" onClick={handleRetry} disabled={streaming}>
                      ↺ Retry
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {lastError && !streaming && (
          <div className="error-block">
            <span className="error-icon">⚠</span>
            <div className="error-content">
              <div className="error-message">{lastError}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button className="error-retry" onClick={handleRetry}>↺ Retry</button>
                <button
                  className="error-retry"
                  onClick={() => onSwitchModel(nextModel(activeModel))}
                  style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                >
                  Try {MODEL_LABEL[nextModel(activeModel)]}
                </button>
              </div>
            </div>
          </div>
        )}

        {streaming && (
          <div className="message-group">
            <div className="message-assistant">
              <div className="assistant-meta">
                <div className="assistant-avatar">D</div>
                <span className="assistant-name">DigiMon</span>
              </div>
              <div className="assistant-body">
                {steps.length > 0 && (
                  <div className="steps-container">
                    {steps.map((s, i) => <StepRow key={i} step={s} />)}
                  </div>
                )}
                {streamBuffer
                  ? renderMd(streamBuffer)
                  : isWaiting && (
                      <div className="typing-dots">
                        <div className="typing-dot" />
                        <div className="typing-dot" />
                        <div className="typing-dot" />
                      </div>
                    )
                }
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="input-area">
        <div className="input-container">
          <textarea
            ref={textareaRef}
            className="chat-input"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={false}
            rows={1}
            placeholder={streaming ? "DigiMon is responding… type to queue next message" : "Ask anything, or tell me to run something on your machine…"}
          />
          {streaming ? (
            <button
              className="stop-btn"
              onClick={handleStop}
              title="Stop generating"
            >
              <span className="stop-icon" />
            </button>
          ) : (
            <button className="send-btn" onClick={sendMessage} disabled={!input.trim()}>
              ↑
            </button>
          )}
        </div>
        <div className="input-footer">
          <kbd>Enter</kbd> to send
          <span style={{ margin: '0 6px', opacity: 0.5 }}>·</span>
          <kbd>Shift+Enter</kbd> for newline
          <span style={{ margin: '0 6px', opacity: 0.5 }}>·</span>
          Destructive commands always ask before running
        </div>
      </div>
    </div>
  )
}
