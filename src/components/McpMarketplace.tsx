import { useState, useEffect } from 'react'
import { MCP_CATALOG, CATEGORIES, type McpCatalogEntry } from '../data/mcpCatalog'

interface EnabledMap { [id: string]: boolean }
interface TestMap { [id: string]: { ok: boolean; toolCount?: number; error?: string } }

function Logo({ entry }: { entry: McpCatalogEntry }) {
  const [failed, setFailed] = useState(false)
  if (entry.logoUrl && !failed) {
    return <img src={entry.logoUrl} alt={entry.name} className="mcp-tile-logo" onError={() => setFailed(true)} />
  }
  return <span className="mcp-tile-emoji">{entry.icon}</span>
}

function DetailLogo({ entry }: { entry: McpCatalogEntry }) {
  const [failed, setFailed] = useState(false)
  if (entry.logoUrl && !failed) {
    return <img src={entry.logoUrl} alt={entry.name} className="mkt-detail-logo" onError={() => setFailed(true)} />
  }
  return <span className="mkt-detail-emoji">{entry.icon}</span>
}

export function McpMarketplace() {
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<McpCatalogEntry | null>(null)
  const [envValues, setEnvValues] = useState<Record<string, string>>({})
  const [enabledMap, setEnabledMap] = useState<EnabledMap>({})
  const [testMap, setTestMap] = useState<TestMap>({})
  const [loading, setLoading] = useState<string | null>(null)

  useEffect(() => {
    window.electronAPI.getMcpConfig().then(config => {
      const map: EnabledMap = {}
      config?.servers?.forEach((s: any) => { map[s.id] = s.enabled })
      setEnabledMap(map)
    })
  }, [])

  const handleSelect = async (entry: McpCatalogEntry) => {
    setSelected(entry)
    const vals: Record<string, string> = {}
    for (const ev of entry.envVars) {
      const stored = await window.electronAPI.storeGetMcpEnv(entry.id, ev.key)
      if (stored) vals[ev.key] = stored
    }
    setEnvValues(vals)
  }

  const handleEnable = async () => {
    if (!selected) return
    setLoading(selected.id)
    setTestMap(p => ({ ...p, [selected.id]: undefined as any }))

    const result = await window.electronAPI.enableMcpWithEnv(selected.id, envValues, selected)
    setTestMap(p => ({ ...p, [selected.id]: result }))

    if (result.ok) {
      setEnabledMap(p => ({ ...p, [selected.id]: true }))
    }
    setLoading(null)
  }

  const handleDisable = async (id: string) => {
    setLoading(id)
    await window.electronAPI.toggleMcpServer(id, false)
    setEnabledMap(p => ({ ...p, [id]: false }))
    setTestMap(p => ({ ...p, [id]: undefined as any }))
    setLoading(null)
  }

  const filtered = MCP_CATALOG.filter(m => {
    const matchCat = category === 'all' || m.category === category
    const matchSearch = !search ||
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.description.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  const hasPanel = !!selected
  const selectedTest = selected ? testMap[selected.id] : null

  return (
    <div className="mkt-shell">
      <div className="mkt-left" style={{ width: hasPanel ? '52%' : '100%' }}>
        <div className="mkt-search">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search integrations…" />
        </div>

        <div className="mkt-cats">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              className={`cat-chip ${category === cat.id ? 'active' : ''}`}
              onClick={() => setCategory(cat.id)}
            >{cat.icon} {cat.label}</button>
          ))}
        </div>

        <div className="mkt-grid" style={{
          gridTemplateColumns: hasPanel ? '1fr' : 'repeat(auto-fill, minmax(180px, 1fr))',
        }}>
          {filtered.map(entry => {
            const isOn = enabledMap[entry.id]
            const isSel = selected?.id === entry.id
            return (
              <div
                key={entry.id}
                className={`mcp-tile ${isSel ? 'sel' : ''} ${isOn && !isSel ? 'on' : ''}`}
                onClick={() => handleSelect(entry)}
              >
                <Logo entry={entry} />
                <div style={{ minWidth: 0 }}>
                  <div className="mcp-tile-name">
                    {entry.name}
                    {isOn && <span className="active-dot" />}
                  </div>
                  <div className="mcp-tile-desc">{entry.tagline}</div>
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '28px', color: 'var(--text3)', fontSize: 13 }}>
              No integrations match "{search}"
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div className="mkt-right" style={{ width: '48%' }}>
          <div className="mkt-detail-hdr">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <DetailLogo entry={selected} />
              <div>
                <div className="mkt-detail-name">{selected.name}</div>
                <div className="mkt-detail-cat">
                  {selected.category}
                  {enabledMap[selected.id] && (
                    <span className="mkt-active-badge"> · Connected</span>
                  )}
                </div>
              </div>
            </div>
            <button className="close-btn" onClick={() => setSelected(null)}>✕</button>
          </div>

          <div className="mkt-detail-body">
            <div className="mkt-tagline">{selected.tagline}</div>

            <p className="mkt-detail-desc">{selected.description}</p>

            {/* Concrete example — the most useful thing for a non-technical user */}
            <div className="mkt-example">
              <div className="mkt-example-label">Example</div>
              <div className="mkt-example-text">{selected.example}</div>
            </div>

            {selected.warning && (
              <div className="warn-box">⚠ {selected.warning}</div>
            )}

            {/* Test result banner */}
            {selectedTest?.ok && (
              <div className="setup-result ok" style={{ marginBottom: 14 }}>
                ✓ Connected — {selectedTest.toolCount} tools available. DigiMon will use this automatically when relevant.
              </div>
            )}
            {selectedTest && !selectedTest.ok && (
              <div className="setup-result err" style={{ marginBottom: 14 }}>
                ✗ Connection failed: {selectedTest.error}
              </div>
            )}

            <div className="detail-section-title">How it works</div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 16 }}>
              Click <strong>Connect</strong> below. DigiMon installs what it needs, tests the connection,
              and then uses this tool automatically whenever you ask for something that needs it.
              You don't have to remember to turn it on again.
            </div>

            {selected.setupSteps.length > 0 && (
              <>
                <div className="detail-section-title">
                  {selected.envVars.length > 0 ? 'Setup Steps' : 'Quick Notes'}
                </div>
                <div style={{ marginBottom: 18 }}>
                  {selected.setupSteps.map((step, i) => (
                    <div key={i} className="step-item">
                      <div className="step-num">{i + 1}</div>
                      <div className="step-txt">{step}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {selected.envVars.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div className="detail-section-title">Your Credentials</div>
                {selected.envVars.map(ev => (
                  <div key={ev.key}>
                    <div className="env-label">{ev.label}</div>
                    <div className="env-hint">{ev.hint}</div>
                    <input
                      type={ev.secret ? 'password' : 'text'}
                      className="env-input"
                      value={envValues[ev.key] ?? ''}
                      onChange={e => setEnvValues(p => ({ ...p, [ev.key]: e.target.value }))}
                      placeholder={ev.key}
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="docs-link-row">
              📖 <a href={selected.docsUrl} target="_blank" rel="noreferrer">Official documentation →</a>
            </div>
          </div>

          <div className="mkt-detail-ftr">
            {enabledMap[selected.id] ? (
              <button
                className="btn-disable"
                disabled={loading === selected.id}
                onClick={() => handleDisable(selected.id)}
              >
                {loading === selected.id ? 'Disconnecting…' : '✕ Disconnect'}
              </button>
            ) : (
              <button
                className="btn-enable"
                disabled={loading === selected.id}
                onClick={handleEnable}
              >
                {loading === selected.id ? 'Connecting…' : '🔗 Connect'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
