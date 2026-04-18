import { useMemo, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  type Node,
  type Edge,
  type ReactFlowProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

/**
 * DigiMon diagram schema — what we ask the LLM to return.
 *
 * This is deliberately tiny. JSON has no syntax traps like mermaid's
 * quoting/escaping — as long as it's parseable JSON, we can render it.
 */
export interface DiagramSpec {
  type: 'flowchart'
  direction?: 'TB' | 'LR' | 'BT' | 'RL'   // top-bottom (default), left-right, etc.
  nodes: Array<{
    id: string
    label: string
    shape?: 'rect' | 'rounded' | 'diamond' | 'ellipse'
    style?: 'default' | 'start' | 'end' | 'decision' | 'action'
  }>
  edges: Array<{
    from: string
    to: string
    label?: string
  }>
}

/**
 * Simple layered auto-layout:
 *  - BFS from nodes with no incoming edges to assign layer (depth)
 *  - Nodes at same depth stacked horizontally (or vertically if LR)
 *  - No ELK or Dagre dependency — keeps bundle small for phase 1
 */
function autoLayout(spec: DiagramSpec): { nodes: Node[]; edges: Edge[] } {
  const dir = spec.direction ?? 'TB'
  const isVertical = dir === 'TB' || dir === 'BT'

  // Build adjacency + in-degree
  const inDegree = new Map<string, number>()
  const adjacency = new Map<string, string[]>()
  for (const n of spec.nodes) {
    inDegree.set(n.id, 0)
    adjacency.set(n.id, [])
  }
  for (const e of spec.edges) {
    if (!inDegree.has(e.to) || !adjacency.has(e.from)) continue
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1)
    adjacency.get(e.from)!.push(e.to)
  }

  // BFS: layer = longest path from any root
  const layer = new Map<string, number>()
  const queue: string[] = []
  for (const [id, deg] of inDegree) {
    if (deg === 0) { layer.set(id, 0); queue.push(id) }
  }
  // If graph has cycles, nodes without in-degree=0 still need a layer.
  // Fallback: unplaced nodes go to layer 0.
  for (const n of spec.nodes) {
    if (!layer.has(n.id)) layer.set(n.id, 0)
  }
  while (queue.length) {
    const id = queue.shift()!
    const myLayer = layer.get(id)!
    for (const next of adjacency.get(id) ?? []) {
      const proposed = myLayer + 1
      if ((layer.get(next) ?? 0) < proposed) {
        layer.set(next, proposed)
        queue.push(next)
      }
    }
  }

  // Group nodes by layer
  const byLayer = new Map<number, string[]>()
  for (const [id, l] of layer) {
    if (!byLayer.has(l)) byLayer.set(l, [])
    byLayer.get(l)!.push(id)
  }

  // Assign x,y positions
  const NODE_W = 200
  const NODE_H = 70
  const GAP_H = 80     // horizontal gap between siblings
  const GAP_V = 90     // vertical gap between layers
  const positions = new Map<string, { x: number; y: number }>()

  for (const [l, ids] of byLayer) {
    const count = ids.length
    ids.forEach((id, idx) => {
      if (isVertical) {
        // Layers are rows stacked top-bottom, siblings spread horizontally
        const totalW = count * NODE_W + (count - 1) * GAP_H
        const x = idx * (NODE_W + GAP_H) - totalW / 2 + NODE_W / 2
        const y = l * (NODE_H + GAP_V)
        positions.set(id, { x, y: dir === 'BT' ? -y : y })
      } else {
        // Layers are columns stacked left-right, siblings spread vertically
        const totalH = count * NODE_H + (count - 1) * GAP_H
        const y = idx * (NODE_H + GAP_H) - totalH / 2 + NODE_H / 2
        const x = l * (NODE_W + GAP_V)
        positions.set(id, { x: dir === 'RL' ? -x : x, y })
      }
    })
  }

  // Build React Flow nodes
  const nodes: Node[] = spec.nodes.map(n => {
    const pos = positions.get(n.id) ?? { x: 0, y: 0 }
    return {
      id: n.id,
      position: pos,
      data: { label: n.label },
      style: nodeStyle(n.shape, n.style),
      type: 'default',
      sourcePosition: isVertical ? ('bottom' as any) : ('right' as any),
      targetPosition: isVertical ? ('top' as any) : ('left' as any),
    }
  })

  // Build edges
  const edges: Edge[] = spec.edges.map((e, i) => ({
    id: `e${i}-${e.from}-${e.to}`,
    source: e.from,
    target: e.to,
    label: e.label,
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--text3)' },
    style: { stroke: 'var(--text3)', strokeWidth: 1.5 },
    labelStyle: { fill: 'var(--text2)', fontSize: 11, fontWeight: 500 },
    labelBgStyle: { fill: 'rgba(255,255,255,0.85)' },
    labelBgPadding: [4, 2],
    labelBgBorderRadius: 4,
  }))

  return { nodes, edges }
}

function nodeStyle(shape?: string, style?: string): React.CSSProperties {
  // Base look — matches Aetheris glass aesthetic
  const base: React.CSSProperties = {
    background: 'rgba(255,255,255,0.9)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255,255,255,0.9)',
    borderRadius: 12,
    padding: '10px 14px',
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--text)',
    boxShadow: '0 2px 8px rgba(60,60,100,0.08)',
    width: 200,
    minHeight: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    lineHeight: 1.35,
  }

  if (shape === 'diamond' || style === 'decision') {
    return {
      ...base,
      background: 'rgba(245, 158, 11, 0.12)',
      borderColor: 'rgba(245, 158, 11, 0.35)',
      color: '#92400E',
    }
  }

  if (style === 'start') {
    return {
      ...base,
      background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
      borderColor: 'var(--accent)',
      color: 'white',
      fontWeight: 600,
    }
  }

  if (style === 'end') {
    return {
      ...base,
      background: 'rgba(16, 185, 129, 0.15)',
      borderColor: 'rgba(16, 185, 129, 0.4)',
      color: '#065F46',
      fontWeight: 600,
    }
  }

  if (shape === 'ellipse') {
    return { ...base, borderRadius: 999 }
  }

  return base
}

// ── The public component ─────────────────────────────
interface Props {
  spec: DiagramSpec
}

export function DiagramRenderer({ spec }: Props) {
  const { nodes, edges } = useMemo(() => autoLayout(spec), [spec])

  // Figure out roughly how tall the diagram needs to be
  const height = useMemo(() => {
    const maxY = Math.max(...nodes.map(n => n.position.y), 0)
    const minY = Math.min(...nodes.map(n => n.position.y), 0)
    return Math.max(260, maxY - minY + 160)
  }, [nodes])

  const onInit: ReactFlowProps['onInit'] = useCallback((instance) => {
    // Fit view with a bit of padding after initial render
    setTimeout(() => instance.fitView({ padding: 0.1, duration: 0 }), 0)
  }, [])

  return (
    <div className="diagram-wrap" style={{ height }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        onInit={onInit}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={false}
        panOnScroll={false}
        minZoom={0.3}
        maxZoom={1.5}
      >
        <Background color="rgba(60,60,100,0.08)" gap={20} size={1} />
        <Controls
          showInteractive={false}
          position="bottom-right"
          style={{ background: 'rgba(255,255,255,0.9)', borderRadius: 8, border: '1px solid var(--border)' }}
        />
      </ReactFlow>
    </div>
  )
}

// ── Error state when JSON is malformed ────────────────
export function DiagramError({ raw, error }: { raw: string; error: string }) {
  return (
    <div className="diagram-error">
      <div className="diagram-error-title">⚠ Couldn't draw diagram</div>
      <div className="diagram-error-msg">{error}</div>
      <details className="diagram-error-source">
        <summary>Show source</summary>
        <pre>{raw || '(empty)'}</pre>
      </details>
    </div>
  )
}

// ── Parse helper — extracts + validates DiagramSpec from JSON ──
export function parseDiagramSpec(raw: string): { ok: true; spec: DiagramSpec } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(raw.trim())
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: 'Expected a JSON object' }
    }
    if (!Array.isArray(parsed.nodes) || parsed.nodes.length === 0) {
      return { ok: false, error: 'Missing or empty "nodes" array' }
    }
    if (!Array.isArray(parsed.edges)) {
      return { ok: false, error: 'Missing "edges" array' }
    }
    // Validate every node has id + label
    for (const n of parsed.nodes) {
      if (!n || typeof n.id !== 'string' || typeof n.label !== 'string') {
        return { ok: false, error: 'Every node needs id and label strings' }
      }
    }
    for (const e of parsed.edges) {
      if (!e || typeof e.from !== 'string' || typeof e.to !== 'string') {
        return { ok: false, error: 'Every edge needs from and to strings' }
      }
    }
    return { ok: true, spec: { type: 'flowchart', ...parsed } }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Invalid JSON' }
  }
}
