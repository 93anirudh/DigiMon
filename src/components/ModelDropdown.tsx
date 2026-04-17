import { useEffect, useState, useRef } from 'react'

const MODELS = [
  { id: 'gemini-3-pro',     label: 'Gemini Super', desc: 'Best quality · slower · costs more' },
  { id: 'gemini-2.5-pro',   label: 'Gemini Smart', desc: 'Balanced quality & speed' },
  { id: 'gemini-2.5-flash', label: 'Gemini Flash', desc: 'Fastest · cheapest · lower quality' },
]

export function ModelDropdown({
  activeModel,
  onChange,
}: {
  activeModel: string
  onChange: (to: string) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [open])

  const current = MODELS.find(m => m.id === activeModel) ?? MODELS[0]

  return (
    <div className="model-dropdown-wrap" ref={wrapRef}>
      <button
        className="model-dropdown-trigger"
        onClick={() => setOpen(v => !v)}
        title="Switch model"
      >
        <span className="model-dot" />
        <span>{current.label}</span>
        <span className="model-caret">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="model-dropdown-menu" onClick={e => e.stopPropagation()}>
          {MODELS.map(m => {
            const isActive = m.id === activeModel
            return (
              <button
                key={m.id}
                className={`model-dropdown-item ${isActive ? 'active' : ''}`}
                onClick={() => {
                  onChange(m.id)
                  setOpen(false)
                }}
              >
                <div className="model-dropdown-row">
                  <span className="model-dropdown-label">{m.label}</span>
                  {isActive && <span className="model-dropdown-check">✓</span>}
                </div>
                <div className="model-dropdown-desc">{m.desc}</div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
