import { useEffect, useState, useCallback } from 'react'

interface Summary {
  today: {
    total_tokens: number
    input_tokens: number
    output_tokens: number
    request_count: number
    by_model: Record<string, number>
  }
  last_hour: { total_tokens: number; request_count: number }
  chat: { total_tokens: number; message_count: number } | null
  context_tokens_in_chat: number
}

const MODEL_LABELS: Record<string, string> = {
  'gemini-3-pro':     'Gemini Super',
  'gemini-2.5-pro':   'Gemini Smart',
  'gemini-2.5-flash': 'Gemini Flash',
}

const MODEL_COLORS: Record<string, string> = {
  'gemini-3-pro':     '#8E79F7', // purple
  'gemini-2.5-pro':   '#4285F4', // google blue
  'gemini-2.5-flash': '#34A853', // green
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10_000) return (n / 1000).toFixed(1) + 'K'
  if (n < 1_000_000) return Math.round(n / 1000) + 'K'
  return (n / 1_000_000).toFixed(2) + 'M'
}

export function UsageMeter({ activeChatId }: { activeChatId: number | null }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [lastCallTokens, setLastCallTokens] = useState<number | null>(null)
  const [open, setOpen] = useState(false)

  const refresh = useCallback(async () => {
    const r = await window.electronAPI.getUsageSummary(activeChatId)
    setSummary(r.summary as Summary)
  }, [activeChatId])

  useEffect(() => {
    refresh()

    const pullLastCall = async () => {
      const r = await window.electronAPI.getUsageSummary(activeChatId)
      const s = r.summary as Summary
      setSummary(s)
      setLastCallTokens(s.context_tokens_in_chat > 0 ? s.context_tokens_in_chat : null)
      setTimeout(() => setLastCallTokens(null), 4000)
    }

    window.electronAPI.onUsageTick(() => pullLastCall())

    const iv = setInterval(refresh, 20000)
    return () => clearInterval(iv)
  }, [refresh, activeChatId])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.usage-meter-wrap')) setOpen(false)
    }
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [open])

  if (!summary) return null

  // Sort models by token usage descending, then put known models first
  const modelEntries = Object.entries(summary.today.by_model)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])

  return (
    <div className="usage-meter-wrap">
      <button
        className="usage-meter-pill"
        onClick={() => setOpen(v => !v)}
        title="Token usage — click for breakdown"
      >
        <span className="usage-dot" />
        <span className="usage-text">
          {formatTokens(summary.today.total_tokens)}
          <span className="usage-text-sub">today</span>
          {lastCallTokens !== null && (
            <span className="usage-flash">+{formatTokens(lastCallTokens)}</span>
          )}
        </span>
      </button>

      {open && (
        <div className="usage-popover" onClick={e => e.stopPropagation()}>
          <div className="usage-popover-hdr">
            Token usage
            <button className="close-btn" onClick={() => setOpen(false)}>✕</button>
          </div>

          <div className="usage-grid">
            <div className="usage-cell">
              <div className="usage-cell-label">Today</div>
              <div className="usage-cell-value">{formatTokens(summary.today.total_tokens)}</div>
              <div className="usage-cell-sub">{summary.today.request_count} requests</div>
            </div>
            <div className="usage-cell">
              <div className="usage-cell-label">Last hour</div>
              <div className="usage-cell-value">{formatTokens(summary.last_hour.total_tokens)}</div>
              <div className="usage-cell-sub">{summary.last_hour.request_count} requests</div>
            </div>
            <div className="usage-cell">
              <div className="usage-cell-label">This chat</div>
              <div className="usage-cell-value">
                {summary.chat ? formatTokens(summary.chat.total_tokens) : '—'}
              </div>
              <div className="usage-cell-sub">
                {summary.chat ? `${summary.chat.message_count} calls` : 'no chat active'}
              </div>
            </div>
            <div className="usage-cell">
              <div className="usage-cell-label">Context size</div>
              <div className="usage-cell-value">
                {formatTokens(summary.context_tokens_in_chat)}
              </div>
              <div className="usage-cell-sub">last request sent</div>
            </div>
          </div>

          {modelEntries.length > 0 && (
            <div className="usage-split">
              <div className="usage-split-label">Today by model</div>
              <div className="usage-split-bars">
                {modelEntries.map(([model, value]) => (
                  <SplitBar
                    key={model}
                    label={MODEL_LABELS[model] ?? model}
                    value={value}
                    total={summary.today.total_tokens}
                    color={MODEL_COLORS[model] ?? 'var(--accent)'}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="usage-breakdown">
            <div className="usage-breakdown-row">
              <span>Input tokens today</span>
              <span className="mono">{formatTokens(summary.today.input_tokens)}</span>
            </div>
            <div className="usage-breakdown-row">
              <span>Output tokens today</span>
              <span className="mono">{formatTokens(summary.today.output_tokens)}</span>
            </div>
          </div>

          <div className="usage-footer-note">
            Raw token counts from Google. Pricing depends on model — Flash is ~40× cheaper per output token than 3 Pro.
          </div>
        </div>
      )}
    </div>
  )
}

function SplitBar({ label, value, total, color }: {
  label: string; value: number; total: number; color: string
}) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="split-bar">
      <div className="split-bar-row">
        <span className="split-bar-label">{label}</span>
        <span className="split-bar-value">{formatTokens(value)}</span>
      </div>
      <div className="split-bar-track">
        <div className="split-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}
