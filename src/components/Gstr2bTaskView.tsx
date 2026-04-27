import { useEffect, useState, useCallback } from 'react'
import type { Task } from '../types/practice'
import type { ReconciliationResult, MatchedRow, MismatchCategory } from '../types/reconciliation'
import {
  CATEGORY_LABELS, CATEGORY_DISPLAY_ORDER, CATEGORY_COLORS, formatINR,
} from '../types/reconciliation'

interface Props {
  taskId: number
  onBack: () => void
}

interface TaskFile {
  id: number
  task_id: number
  kind: string
  original_name: string
  stored_path: string
  size_bytes: number | null
  created_at: string
}

export function Gstr2bTaskView({ taskId, onBack }: Props) {
  const [task, setTask] = useState<Task | null>(null)
  const [files, setFiles] = useState<TaskFile[]>([])
  const [result, setResult] = useState<ReconciliationResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<MismatchCategory | 'all'>('all')
  const [lastRunMs, setLastRunMs] = useState<number | null>(null)
  // Cached explanations: rowIndex → { explanation, cached, cost_paise }
  const [explanations, setExplanations] = useState<Record<number, { text: string; cached: boolean; cost_paise: number }>>({})
  const [explainingIdx, setExplainingIdx] = useState<number | null>(null)

  const reload = useCallback(async () => {
    const [t, f, r] = await Promise.all([
      window.electronAPI.getTask(taskId),
      window.electronAPI.reconListFiles(taskId),
      window.electronAPI.reconGetResult(taskId),
    ])
    setTask(t || null)
    setFiles(f as TaskFile[])
    setResult(r)
    // If the result already has cached explanations, hydrate them by row index
    if (r) {
      const cache = (r as any).explanations as Record<string, string> | undefined
      if (cache) {
        const hydrated: Record<number, { text: string; cached: boolean; cost_paise: number }> = {}
        r.rows.forEach((row, idx) => {
          const inv = row.register || row.gstr2b
          const key = `${row.category}::${inv?.supplier_gstin || ''}::${inv?.invoice_number || ''}::${inv?.invoice_date || ''}`
          if (cache[key]) hydrated[idx] = { text: cache[key], cached: true, cost_paise: 0 }
        })
        setExplanations(hydrated)
      }
    }
  }, [taskId])

  useEffect(() => { reload() }, [reload])

  const handleUpload = async (kind: 'purchase_register' | 'gstr2b_json', file: File) => {
    setError(null)
    try {
      const buf = await file.arrayBuffer()
      await window.electronAPI.reconIngestBuffer(taskId, kind, buf, file.name)
      await reload()
    } catch (err: any) {
      setError(err.message || 'Upload failed')
    }
  }

  const handleDeleteFile = async (fileId: number) => {
    await window.electronAPI.reconDeleteFile(fileId)
    await reload()
  }

  const handleRun = async () => {
    setRunning(true); setError(null)
    try {
      const out = await window.electronAPI.reconRun(taskId)
      if (!out.ok) {
        setError(out.error || 'Reconciliation failed')
      } else {
        setLastRunMs(out.durationMs ?? null)
        setExplanations({})  // reset cache on re-run
        await reload()
      }
    } catch (err: any) {
      setError(err.message || 'Reconciliation failed')
    } finally {
      setRunning(false)
    }
  }

  const handleExplain = async (rowIndex: number) => {
    if (explanations[rowIndex] || explainingIdx === rowIndex) return
    setExplainingIdx(rowIndex)
    try {
      const out = await window.electronAPI.reconExplainRow(taskId, rowIndex)
      if (out.ok && out.explanation) {
        setExplanations(prev => ({
          ...prev,
          [rowIndex]: {
            text: out.explanation!,
            cached: !!out.cached,
            cost_paise: out.cost_paise || 0,
          },
        }))
      } else {
        setError(out.error || 'Failed to generate explanation')
      }
    } finally {
      setExplainingIdx(null)
    }
  }

  if (!task) {
    return <div style={{ padding: 28, color: 'var(--text2)' }}>Loading…</div>
  }

  const reg = files.find(f => f.kind === 'purchase_register')
  const twoB = files.find(f => f.kind === 'gstr2b_json')
  const canRun = !!reg && !!twoB && !running

  const filteredRows = result
    ? (filter === 'all' ? result.rows : result.rows.filter(r => r.category === filter))
    : []

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '16px 28px', borderBottom: '1px solid var(--border)' }}>
        <button onClick={onBack} style={{
          background: 'transparent', border: 'none', color: 'var(--text2)',
          cursor: 'pointer', fontSize: 13, padding: 0, marginBottom: 10,
        }}>← Back to client</button>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)' }}>
              GSTR-2B Reconciliation
            </h1>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
              Period {task.period}{task.due_date ? ` · Due ${new Date(task.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: 28 }}>
        {/* Step 1: Upload */}
        <Section number="1" title="Upload files">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FileSlot
              label="Purchase Register"
              hint="CSV or Excel from Tally, Zoho Books, Busy, or any accounting software"
              accept=".csv,.xlsx,.xls,.xlsm,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              file={reg}
              onUpload={f => handleUpload('purchase_register', f)}
              onDelete={() => reg && handleDeleteFile(reg.id)}
            />
            <FileSlot
              label="GSTR-2B JSON"
              hint="Downloaded from gst.gov.in → Returns → GSTR-2B"
              accept=".json,application/json"
              file={twoB}
              onUpload={f => handleUpload('gstr2b_json', f)}
              onDelete={() => twoB && handleDeleteFile(twoB.id)}
            />
          </div>
        </Section>

        {/* Step 2: Run */}
        <Section number="2" title="Run reconciliation">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              onClick={handleRun}
              disabled={!canRun}
              style={{
                background: canRun ? 'var(--accent)' : 'var(--surface3)',
                color: canRun ? 'white' : 'var(--text3)',
                border: 'none',
                padding: '12px 22px',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: canRun ? 'pointer' : 'not-allowed',
              }}
            >
              {running ? 'Reconciling…' : result ? 'Re-run reconciliation' : 'Run reconciliation'}
            </button>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              {!reg || !twoB
                ? 'Upload both files first'
                : 'Local processing · zero LLM tokens · ~₹0 cost'}
            </div>
          </div>
          {error && (
            <div style={{
              marginTop: 12,
              background: 'rgba(239, 68, 68, 0.1)',
              color: '#F87171',
              padding: '10px 12px',
              borderRadius: 8,
              fontSize: 13,
            }}>{error}</div>
          )}
        </Section>

        {/* Step 3: Results */}
        {result && (
          <>
            <Section number="3" title="Results">
              {/* Telemetry banner — surfaces the moat */}
              <div style={{
                background: 'rgba(34, 197, 94, 0.08)',
                border: '1px solid rgba(34, 197, 94, 0.25)',
                borderRadius: 10,
                padding: '10px 14px',
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                fontSize: 12,
                color: 'var(--text2)',
                flexWrap: 'wrap',
              }}>
                <span style={{ color: '#4ADE80', fontSize: 14 }}>✓</span>
                <span>
                  <strong style={{ color: 'var(--text)' }}>Reconciled in {lastRunMs ? `${lastRunMs}ms` : '< 1s'}</strong>
                  {' · '}
                  <span style={{ color: '#4ADE80' }}>0 LLM tokens</span>
                  {' · '}
                  <strong style={{ color: 'var(--text)' }}>₹0 cost</strong>
                </span>
                <span style={{ color: 'var(--text3)', marginLeft: 'auto' }}>
                  Click <em>Why?</em> on any flagged row for an AI explanation (~₹0.01, cached)
                </span>
              </div>

              {/* Summary cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                gap: 10,
                marginBottom: 16,
              }}>
                <SummaryCard
                  label="Books"
                  value={result.totals.register_count.toString()}
                  sub="invoices in register"
                />
                <SummaryCard
                  label="GSTR-2B"
                  value={result.totals.gstr2b_count.toString()}
                  sub="invoices on portal"
                />
                <SummaryCard
                  label="Matched"
                  value={result.totals.matched.toString()}
                  sub="all good"
                  fg="#4ADE80"
                />
                <SummaryCard
                  label="ITC at Risk"
                  value={formatINR(result.totals.itc_at_risk)}
                  sub="from unfiled invoices"
                  fg={result.totals.itc_at_risk > 0 ? '#F87171' : 'var(--text)'}
                />
                <SummaryCard
                  label="ITC Opportunity"
                  value={formatINR(result.totals.itc_opportunity)}
                  sub="not yet recorded"
                  fg={result.totals.itc_opportunity > 0 ? '#818CF8' : 'var(--text)'}
                />
                <SummaryCard
                  label="Amount Disputed"
                  value={formatINR(result.totals.amount_disputed)}
                  sub="value mismatches"
                  fg={result.totals.amount_disputed > 0 ? '#FBBF24' : 'var(--text)'}
                />
              </div>

              {/* Filter chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                <Chip
                  active={filter === 'all'}
                  onClick={() => setFilter('all')}
                  label={`All (${result.rows.length})`}
                />
                {CATEGORY_DISPLAY_ORDER.map(cat => {
                  const n = (result.totals as any)[cat] as number
                  if (!n) return null
                  return (
                    <Chip
                      key={cat}
                      active={filter === cat}
                      color={CATEGORY_COLORS[cat].dot}
                      onClick={() => setFilter(cat)}
                      label={`${CATEGORY_LABELS[cat]} (${n})`}
                    />
                  )
                })}
              </div>

              {/* Results table */}
              <ResultsTable
                rows={filteredRows}
                allRows={result.rows}
                explanations={explanations}
                explainingIdx={explainingIdx}
                onExplain={handleExplain}
              />
            </Section>
          </>
        )}

        {!result && reg && twoB && !running && (
          <div style={{
            marginTop: 24,
            padding: '40px 20px',
            textAlign: 'center',
            color: 'var(--text2)',
            fontSize: 13,
            background: 'var(--surface)',
            border: '1px dashed var(--border-md)',
            borderRadius: 10,
          }}>
            Both files ready. Click <strong style={{ color: 'var(--text)' }}>Run reconciliation</strong> above.
          </div>
        )}
      </div>
    </div>
  )
}

// ── Section wrapper ──────────────────────────────────────

function Section({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{
          width: 26, height: 26,
          borderRadius: '50%',
          background: 'var(--surface3)',
          color: 'var(--text)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 600,
        }}>{number}</div>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{title}</h2>
      </div>
      {children}
    </div>
  )
}

// ── File upload slot ─────────────────────────────────────

function FileSlot({
  label, hint, accept, file, onUpload, onDelete,
}: {
  label: string
  hint: string
  accept: string
  file: TaskFile | undefined
  onUpload: (f: File) => void
  onDelete: () => void
}) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) onUpload(f)
    e.target.value = ''
  }

  if (file) {
    return (
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderLeft: '3px solid #4ADE80',
        borderRadius: 10,
        padding: 14,
      }}>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6, fontWeight: 500 }}>
          {label}
        </div>
        <div style={{
          fontSize: 13, color: 'var(--text)', fontWeight: 500,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          ✓ {file.original_name}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
          {file.size_bytes ? `${(file.size_bytes / 1024).toFixed(1)} KB · ` : ''}
          uploaded {new Date(file.created_at).toLocaleString('en-IN')}
        </div>
        <button
          onClick={onDelete}
          style={{
            marginTop: 10,
            background: 'transparent',
            color: 'var(--text3)',
            border: '1px solid var(--border-md)',
            padding: '5px 10px',
            borderRadius: 6,
            fontSize: 11,
            cursor: 'pointer',
          }}
        >Replace</button>
      </div>
    )
  }

  return (
    <label style={{
      background: 'var(--surface)',
      border: '1px dashed var(--border-md)',
      borderRadius: 10,
      padding: 14,
      cursor: 'pointer',
      display: 'block',
    }}>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6, fontWeight: 500 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 500, marginBottom: 4 }}>
        + Choose file
      </div>
      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{hint}</div>
      <input
        type="file"
        accept={accept}
        onChange={handleChange}
        style={{ display: 'none' }}
      />
    </label>
  )
}

// ── Summary card ─────────────────────────────────────────

function SummaryCard({
  label, value, sub, fg,
}: { label: string; value: string; sub: string; fg?: string }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: 12,
    }}>
      <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color: fg || 'var(--text)' }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{sub}</div>
    </div>
  )
}

// ── Filter chip ──────────────────────────────────────────

function Chip({ active, color, label, onClick }: { active: boolean; color?: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'var(--surface3)' : 'var(--surface)',
        color: active ? 'var(--text)' : 'var(--text2)',
        border: `1px solid ${active ? 'var(--border-strong)' : 'var(--border)'}`,
        padding: '5px 12px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 500,
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 6,
      }}
    >
      {color && <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />}
      {label}
    </button>
  )
}

// ── Results table ────────────────────────────────────────

function ResultsTable({
  rows, allRows, explanations, explainingIdx, onExplain,
}: {
  rows: MatchedRow[]
  allRows: MatchedRow[]
  explanations: Record<number, { text: string; cached: boolean; cost_paise: number }>
  explainingIdx: number | null
  onExplain: (rowIndex: number) => void
}) {
  if (rows.length === 0) {
    return (
      <div style={{
        padding: '32px 20px', textAlign: 'center',
        color: 'var(--text3)', fontSize: 13,
        background: 'var(--surface)', borderRadius: 10,
        border: '1px solid var(--border)',
      }}>
        No rows in this category.
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      overflow: 'hidden',
    }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
              <Th>Status</Th>
              <Th>Supplier</Th>
              <Th>Invoice</Th>
              <Th align="right">Books ₹</Th>
              <Th align="right">2B ₹</Th>
              <Th align="right">Δ</Th>
              <Th>Reason</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              // Find the canonical index in allRows so caching is stable across filtering
              const rowIndex = allRows.indexOf(r)
              const inv = r.register || r.gstr2b
              const supplier = inv?.supplier_name || inv?.supplier_gstin
              const colors = CATEGORY_COLORS[r.category]
              const explanation = explanations[rowIndex]
              const isExplaining = explainingIdx === rowIndex
              const canExplain = r.category !== 'matched'

              return (
                <tr
                  key={rowIndex}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: rowIndex % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                  }}
                >
                  <Td>
                    <span style={{
                      background: colors.bg, color: colors.fg,
                      padding: '3px 8px', borderRadius: 6,
                      fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap',
                    }}>
                      {CATEGORY_LABELS[r.category]}
                    </span>
                  </Td>
                  <Td>
                    <div style={{ fontWeight: 500, color: 'var(--text)' }}>{supplier || '—'}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace' }}>
                      {inv?.supplier_gstin}
                    </div>
                  </Td>
                  <Td>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                      {inv?.invoice_number}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>{inv?.invoice_date}</div>
                  </Td>
                  <Td align="right">
                    {r.register ? formatINR(r.register.taxable_value) : '—'}
                  </Td>
                  <Td align="right">
                    {r.gstr2b ? formatINR(r.gstr2b.taxable_value) : '—'}
                  </Td>
                  <Td align="right">
                    {r.delta_taxable !== 0 && (
                      <span style={{ color: r.delta_taxable > 0 ? '#FBBF24' : '#818CF8' }}>
                        {r.delta_taxable > 0 ? '+' : ''}{formatINR(r.delta_taxable)}
                      </span>
                    )}
                  </Td>
                  <Td>
                    <div style={{ color: 'var(--text2)', fontSize: 11, lineHeight: 1.4, maxWidth: 360 }}>
                      {r.reason}
                    </div>

                    {/* AI Explanation block */}
                    {canExplain && (
                      <div style={{ marginTop: 8 }}>
                        {!explanation && !isExplaining && (
                          <button
                            onClick={() => onExplain(rowIndex)}
                            style={{
                              background: 'transparent',
                              border: '1px solid var(--border-md)',
                              color: 'var(--accent)',
                              padding: '3px 9px',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 500,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                            }}
                          >
                            <span style={{ fontSize: 9 }}>✨</span>
                            Why?
                          </button>
                        )}
                        {isExplaining && (
                          <div style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>
                            Asking Gemini Flash…
                          </div>
                        )}
                        {explanation && (
                          <div style={{
                            background: 'rgba(99, 102, 241, 0.08)',
                            border: '1px solid rgba(99, 102, 241, 0.25)',
                            borderRadius: 6,
                            padding: '8px 10px',
                            fontSize: 11,
                            color: 'var(--text)',
                            lineHeight: 1.5,
                            maxWidth: 360,
                          }}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              fontSize: 9,
                              color: '#A78BFA',
                              marginBottom: 4,
                              textTransform: 'uppercase',
                              letterSpacing: 0.4,
                              fontWeight: 600,
                            }}>
                              <span>✨ AI</span>
                              {explanation.cached && (
                                <span style={{ color: 'var(--text3)' }}>· cached</span>
                              )}
                              {!explanation.cached && explanation.cost_paise > 0 && (
                                <span style={{ color: 'var(--text3)' }}>
                                  · ₹{(explanation.cost_paise / 100).toFixed(2)}
                                </span>
                              )}
                            </div>
                            {explanation.text}
                          </div>
                        )}
                      </div>
                    )}
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th style={{
      padding: '10px 12px',
      textAlign: align || 'left',
      fontSize: 10,
      fontWeight: 600,
      color: 'var(--text3)',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      whiteSpace: 'nowrap',
    }}>{children}</th>
  )
}

function Td({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <td style={{
      padding: '10px 12px',
      textAlign: align || 'left',
      verticalAlign: 'top',
    }}>{children}</td>
  )
}
