import { getDb } from './database'

// ── Known provider limits (reference data only for now) ──────
// Not used in the UI this session — limit-% tracking is deferred.
// Keeping this here so a future UI can read it without a rewrite.
export const LIMITS = {
  gemini: {
    free: {
      daily_tokens: 1_000_000,   // 1M tokens/day for Gemini 2.5 Flash free tier
      rpm: 15,                   // 15 requests per minute
    },
    paid: {
      daily_tokens: null,        // effectively unlimited within budget
      rpm: 1000,
    },
  },
  grok: {
    // xAI has no published free tier
    paid: {
      daily_tokens: null,
      rpm: 60,
    },
  },
}

export interface UsageEvent {
  chatId: number | null
  messageId: number | null
  provider: 'gemini' | 'grok'
  model?: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  durationMs?: number
}

export function recordUsage(ev: UsageEvent) {
  const db = getDb()
  db.prepare(`
    INSERT INTO usage_events
      (chat_id, message_id, provider, model, input_tokens, output_tokens, total_tokens, duration_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    ev.chatId, ev.messageId, ev.provider, ev.model ?? null,
    ev.inputTokens, ev.outputTokens, ev.totalTokens, ev.durationMs ?? null
  )

  // Also update the message row if linked — lets the chat UI show per-msg tokens
  if (ev.messageId) {
    db.prepare(`
      UPDATE messages
      SET input_tokens = ?, output_tokens = ?, provider = ?
      WHERE id = ?
    `).run(ev.inputTokens, ev.outputTokens, ev.provider, ev.messageId)
  }
}

// ── Extract token counts from a LangChain / raw model response ──────
// Works with both ChatGoogleGenerativeAI and ChatOpenAI response shapes.
export function extractTokenUsage(response: any): {
  inputTokens: number; outputTokens: number; totalTokens: number
} {
  // LangChain standard shape
  const md = response?.usage_metadata
  if (md) {
    return {
      inputTokens: md.input_tokens ?? 0,
      outputTokens: md.output_tokens ?? 0,
      totalTokens: md.total_tokens ?? (md.input_tokens ?? 0) + (md.output_tokens ?? 0),
    }
  }

  // Gemini raw shape
  const gm = response?.response_metadata?.usage_metadata ?? response?.responseMetadata?.usageMetadata
  if (gm) {
    return {
      inputTokens: gm.prompt_token_count ?? gm.promptTokenCount ?? 0,
      outputTokens: gm.candidates_token_count ?? gm.candidatesTokenCount ?? 0,
      totalTokens: gm.total_token_count ?? gm.totalTokenCount ?? 0,
    }
  }

  // OpenAI / Grok raw shape
  const oa = response?.response_metadata?.tokenUsage ?? response?.response_metadata?.token_usage
  if (oa) {
    return {
      inputTokens: oa.promptTokens ?? oa.prompt_tokens ?? 0,
      outputTokens: oa.completionTokens ?? oa.completion_tokens ?? 0,
      totalTokens: oa.totalTokens ?? oa.total_tokens ?? 0,
    }
  }

  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
}

// ── Aggregates for the UI ────────────────────────────────────────────
export interface UsageSummary {
  today: {
    total_tokens: number
    input_tokens: number
    output_tokens: number
    request_count: number
    // Tokens grouped by the specific Gemini model used
    by_model: Record<string, number>
  }
  last_hour: {
    total_tokens: number
    request_count: number
  }
  chat: {
    total_tokens: number          // tokens for currently-active chat
    message_count: number
  } | null
  // Rough estimate of cumulative context size for active chat
  // (sum of input_tokens of all assistant responses ≈ context sent to model)
  context_tokens_in_chat: number
}

export function getUsageSummary(activeChatId: number | null): UsageSummary {
  const db = getDb()

  // Today — UTC-safe start-of-day
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayISO = todayStart.toISOString().replace('T', ' ').slice(0, 19)

  const today = db.prepare(`
    SELECT
      COALESCE(SUM(total_tokens), 0)   AS total_tokens,
      COALESCE(SUM(input_tokens), 0)   AS input_tokens,
      COALESCE(SUM(output_tokens), 0)  AS output_tokens,
      COUNT(*) AS request_count
    FROM usage_events
    WHERE created_at >= ?
  `).get(todayISO) as any

  // Per-model breakdown for today
  const byModelRows = db.prepare(`
    SELECT COALESCE(model, 'unknown') AS model, COALESCE(SUM(total_tokens), 0) AS tokens
    FROM usage_events WHERE created_at >= ?
    GROUP BY model
  `).all(todayISO) as Array<{ model: string; tokens: number }>

  const by_model: Record<string, number> = {}
  for (const r of byModelRows) {
    by_model[r.model] = r.tokens
  }

  // Last hour
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19)
  const lastHour = db.prepare(`
    SELECT COALESCE(SUM(total_tokens), 0) AS total_tokens, COUNT(*) AS request_count
    FROM usage_events WHERE created_at >= ?
  `).get(hourAgo) as any

  // Per-chat
  let chat: UsageSummary['chat'] = null
  let contextTokens = 0
  if (activeChatId) {
    const chatRow = db.prepare(`
      SELECT COALESCE(SUM(total_tokens), 0) AS total_tokens, COUNT(*) AS msg_count
      FROM usage_events WHERE chat_id = ?
    `).get(activeChatId) as any
    chat = { total_tokens: chatRow.total_tokens, message_count: chatRow.msg_count }

    // context_tokens = max(input_tokens) of most recent call in this chat
    // (that's what was actually sent to the model last — best proxy for current context size)
    const lastInput = db.prepare(`
      SELECT input_tokens FROM usage_events
      WHERE chat_id = ? ORDER BY created_at DESC LIMIT 1
    `).get(activeChatId) as any
    contextTokens = lastInput?.input_tokens ?? 0
  }

  return {
    today: {
      total_tokens: today.total_tokens,
      input_tokens: today.input_tokens,
      output_tokens: today.output_tokens,
      request_count: today.request_count,
      by_model,
    },
    last_hour: {
      total_tokens: lastHour.total_tokens,
      request_count: lastHour.request_count,
    },
    chat,
    context_tokens_in_chat: contextTokens,
  }
}

// ── Format big numbers nicely for the UI ──
export function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10_000) return (n / 1000).toFixed(1) + 'K'
  if (n < 1_000_000) return Math.round(n / 1000) + 'K'
  return (n / 1_000_000).toFixed(2) + 'M'
}
