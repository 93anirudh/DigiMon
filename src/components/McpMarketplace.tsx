import { useState, useEffect } from 'react'
import { MCP_CATALOG, CATEGORIES, type McpCatalogEntry } from '../data/mcpCatalog'

interface EnabledMap { [id: string]: boolean }
interface TestMap    { [id: string]: { ok: boolean; toolCount?: number; error?: string } }

type GoogleStatus =
  | { connected: false }
  | { connected: true; email: string; expired: boolean }

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

function GoogleConnectPanel({
  status, loading, onConnect, onDisconnect,
}: {
  status: GoogleStatus; loading: boolean
  onConnect: () => void; onDisconnect: () => void
}) {
  if (status.connected) {
    return (
      <div className="mkt-detail-ftr" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
        <div className="google-connected-row">
          <span className="google-check">✓</span>
          <div>
            <div className="google-email">{status.email}</div>
            {status.expired && <div className="google-expired-note">Session expired — reconnect to refresh</div>}
          </div>
        </div>
        {status.expired
          ? <button className="btn-enable" disabled={loading} onClick={onConnect}>{loading ? 'Opening browser…' : '↺ Reconnect'}</button>
          : <button className="btn-disable" disabled={loading} onClick={onDisconnect}>{loading ? 'Disconnecting…' : '✕ Disconnect'}</button>
        }
      </div>
    )
  }
  return (
    <div className="mkt-detail-ftr" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
      <button className="btn-enable btn-google" disabled={loading} onClick={onConnect}>
        {loading
          ? <><span className="oauth-spinner" /> Waiting for sign-in…</>
          : <><img src="https://img.icons8.com/color/20/google-logo.png" alt="" style={{ width: 16, height: 16, marginRight: 6 }} />Sign in with Google</>
        }
      </button>
      {loading && (
        <div className="oauth-waiting-note">
          Browser opened — sign in and grant access, then come back here.
          <button className="oauth-cancel-btn" onClick={() => window.electronAPI.googleCancel()}>Cancel</button>
        </div>
      )}
    </div>
  )
}

export function McpMarketplace() {
  const [category,     setCategory]     = useState('all')
  const [search,       setSearch]       = useState('')
  const [selected,     setSelected]     = useState<McpCatalogEntry | null>(null)
  const [envValues,    setEnvValues]    = useState<Record<string, string>>({})
  const [enabledMap,   setEnabledMap]   = useState<EnabledMap>({})
  const [testMap,      setTestMap]      = useState<TestMap>({})
  const [loading,      setLoading]      = useState<string | null>(null)
  const [googleStatus, setGoogleStatus] = useState<GoogleStatus>({ connected: false })

  useEffect(() => {
    window.electronAPI.getMcpConfig().then((config: any) => {
      const map: EnabledMap = {}
      config?.servers?.forEach((s: any) => { map[s.id] = s.enabled })
      setEnabledMap(map)
    })
    window.electronAPI.googleStatus().then(setGoogleStatus)
  }, [])

  useEffect(() => {
    setEnabledMap(p => ({ ...p, 'google-workspace': googleStatus.connected }))
  }, [googleStatus])

  const handleSelect = async (entry: McpCatalogEntry) => {
    setSelected(entry)
    setEnvValues({})
    if (!entry.requiresAuth && entry.envVars.length > 0) {
      const vals: Record<string, string> = {}
      for (const ev of entry.envVars) {
        const stored = await window.electronAPI.storeGetMcpEnv(entry.id, ev.key)
        if (stored) vals[ev.key] = stored
      }
      setEnvValues(vals)
    }
  }

  const handleEnable = async () => {
    if (!selected || selected.requiresAuth) return
    setLoading(selected.id)
    setTestMap(p => ({ ...p, [selected.id]: undefined as any }))
    const result = await window.electronAPI.enableMcpWithEnv(selected.id, envValues, selected)
    setTestMap(p => ({ ...p, [selected.id]: result }))
    if (result.ok) setEnabledMap(p => ({ ...p, [selected.id]: true }))
    setLoading(null)
  }

  const handleDisable = async (id: string) => {
    setLoading(id)
    await window.electronAPI.toggleMcpServer(id, false)
    setEnabledMap(p => ({ ...p, [id]: false }))
    setTestMap(p => ({ ...p, [id]: undefined as any }))
    setLoading(null)
  }

  const handleGoogleConnect = async () => {
    setLoading('google-workspace')
    const result = await window.electronAPI.googleConnect()
    if (result.ok) {
      setGoogleStatus({ connected: true, email: result.email, expired: false })
      // No MCP registration — google-workspace is handled natively in
      // googleTools.ts. Tools auto-appear in the agent loop.
    } else {
      setTestMap(p => ({ ...p, 'google-workspace': { ok: false, error: result.error } }))
    }
    setLoading(null)
  }

  const handleGoogleDisconnect = async () => {
    setLoading('google-workspace')
    await window.electronAPI.googleDisconnect()
    setGoogleStatus({ connected: false })
    setLoading(null)
  }

  const filtered = MCP_CATALOG.filter(m => {
    const matchCat    = category === 'all' || m.category === category
    const matchSearch = !search ||
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.description.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  const hasPanel     = !!selected
  const selectedTest = selected ? testMap[selected.id] : null
  const isGoogle     = selected?.id === 'google-workspace'

  return (
    <div className="mkt-shell">
      <div className="mkt-left" style={{ width: hasPanel ? '52%' : '100%' }}>
        <div className="mkt-search">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search integrations…" />
        </div>
        <div className="mkt-cats">
          {CATEGORIES.map(cat => (
            <button key={cat.id} className={`cat-chip ${category === cat.id ? 'active' : ''}`} onClick={() => setCategory(cat.id)}>
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>
        <div className="mkt-grid" style={{ gridTemplateColumns: hasPanel ? '1fr' : 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          {filtered.map(entry => {
            const isOn  = enabledMap[entry.id]
            const isSel = selected?.id === entry.id
            return (
              <div key={entry.id} className={`mcp-tile ${isSel ? 'sel' : ''} ${isOn && !isSel ? 'on' : ''}`} onClick={() => handleSelect(entry)}>
                <Logo entry={entry} />
                <div style={{ minWidth: 0 }}>
                  <div className="mcp-tile-name">{entry.name}{isOn && <span className="active-dot" />}</div>
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
                  {enabledMap[selected.id] && <span className="mkt-active-badge"> · Connected</span>}
                </div>
              </div>
            </div>
            <button className="close-btn" onClick={() => setSelected(null)}>✕</button>
          </div>

          <div className="mkt-detail-body">
            <div className="mkt-tagline">{selected.tagline}</div>
            <p className="mkt-detail-desc">{selected.description}</p>
            <div className="mkt-example">
              <div className="mkt-example-label">Example</div>
              <div className="mkt-example-text">{selected.example}</div>
            </div>
            {selected.warning && <div className="warn-box">⚠ {selected.warning}</div>}

            {selectedTest && !selectedTest.ok && (
              <div className="setup-result err" style={{ marginBottom: 14 }}>✗ {selectedTest.error}</div>
            )}
            {!isGoogle && selectedTest?.ok && (
              <div className="setup-result ok" style={{ marginBottom: 14 }}>
                ✓ Connected — {selectedTest.toolCount} tools available.
              </div>
            )}

            <div className="detail-section-title">How it works</div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 16 }}>
              {isGoogle
                ? "Click \"Sign in with Google\" below. A browser window opens — sign in and grant access. DigiMon will use your Gmail, Drive, Docs, Sheets and Calendar automatically when relevant."
                : <span>Click <strong>Connect</strong>. DigiMon installs what it needs, tests the connection, and uses the tool automatically when relevant.</span>
              }
            </div>

            {selected.setupSteps.length > 0 && !isGoogle && (
              <>
                <div className="detail-section-title">{selected.envVars.length > 0 ? 'Setup Steps' : 'Quick Notes'}</div>
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

            {!isGoogle && selected.envVars.length > 0 && (
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

          {isGoogle ? (
            <GoogleConnectPanel
              status={googleStatus}
              loading={loading === 'google-workspace'}
              onConnect={handleGoogleConnect}
              onDisconnect={handleGoogleDisconnect}
            />
          ) : enabledMap[selected.id] ? (
            <div className="mkt-detail-ftr">
              <button className="btn-disable" disabled={loading === selected.id} onClick={() => handleDisable(selected.id)}>
                {loading === selected.id ? 'Disconnecting…' : '✕ Disconnect'}
              </button>
            </div>
          ) : (
            <div className="mkt-detail-ftr">
              <button className="btn-enable" disabled={loading === selected.id} onClick={handleEnable}>
                {loading === selected.id ? 'Connecting…' : '🔗 Connect'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
