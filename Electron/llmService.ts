import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import {
  HumanMessage, AIMessage, SystemMessage, ToolMessage
} from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import {
  listDirectory, readFile, executeShell, writeFile,
  DANGEROUS_TOOLS, isDestructiveShell
} from './tools'
import { requestApproval } from './approvalGate'
import { extractTokenUsage, recordUsage } from './usageService'
import { GOOGLE_TOOL_MAP, getGoogleToolsIfConnected } from './googleTools'
import type { BrowserWindow } from 'electron'

// ── Gemini model chain ────────────────────────────────
// Ordered by preference. Auto-fallback walks this list on quota/network errors.
// gemini-3-pro = best quality but highest cost & strictest rate limits
// gemini-2.5-pro = solid middle ground
// gemini-2.5-flash = fastest, cheapest, highest availability — last-resort fallback
export type GeminiModel = 'gemini-3-pro' | 'gemini-2.5-pro' | 'gemini-2.5-flash'

export const MODEL_CHAIN: GeminiModel[] = ['gemini-3-pro', 'gemini-2.5-pro', 'gemini-2.5-flash']

// Map our friendly IDs to the actual API model strings
const MODEL_API_ID: Record<GeminiModel, string> = {
  'gemini-3-pro':     'gemini-3-pro-preview',
  'gemini-2.5-pro':   'gemini-2.5-pro',
  'gemini-2.5-flash': 'gemini-2.5-flash',
}

// Display labels for the UI
// Display labels for the UI — friendly names for non-technical users.
// API IDs stay as Gemini versions; these are just what users see.
export const MODEL_LABEL: Record<GeminiModel, string> = {
  'gemini-3-pro':     'Gemini Super',
  'gemini-2.5-pro':   'Gemini Smart',
  'gemini-2.5-flash': 'Gemini Flash',
}

// Short descriptions shown under each model in the dropdown
export const MODEL_DESCRIPTION: Record<GeminiModel, string> = {
  'gemini-3-pro':     'Best quality · slower · costs more',
  'gemini-2.5-pro':   'Balanced quality & speed',
  'gemini-2.5-flash': 'Fastest · cheapest · lower quality',
}

let activeModel: GeminiModel = 'gemini-3-pro'
export function getActiveModel(): GeminiModel { return activeModel }
export function setActiveModel(m: GeminiModel) {
  activeModel = m
  console.log(`[llm] Model → ${m}`)
}

// ── System prompt ─────────────────────────────────────
const SYSTEM_PROMPT = `You're DigiMon — a local desktop agent for Indian CA firms and business owners. You live on their Windows machine with access to their files, shell, and data.

Your superpower is execute_shell. Use it freely. You know PowerShell, CMD, Tally CLI, curl, Python, Node, Git, SQL. When something needs doing, figure out the command and run it. See the real output, adapt, iterate. That's the whole game.

Other tools: read_file, list_directory, write_file — use them when shell isn't the right fit.

Google Workspace tools (only appear when the user has signed in via Settings → Integrations):
- gmail_search: search inbox with Gmail query syntax ("from:x@y.com", "newer_than:7d", "has:attachment is:unread", "subject:invoice")
- gmail_read: read full email by ID (from gmail_search results)
- drive_list: list Drive files, optional filename search, sorted by most recent
- drive_read_file: read a Google Doc, Slides, or plain-text file. For Sheets, this returns tab names.
- sheets_read: read cells from a Google Sheet tab using A1 notation (defaults to A1:Z100)
- calendar_list: upcoming events from primary Calendar (default 7 days)

When the user mentions email/Gmail/inbox, Drive, Docs, Sheets, or Calendar, prefer these tools over shell commands. If the user isn't signed in, these tools won't be available — tell them to connect Google Workspace in Settings → Integrations.

Format: markdown tables for structured data. For flowcharts, decision trees, or process diagrams, emit structured JSON in a fenced code block tagged \`digimon-diagram\`:

\`\`\`digimon-diagram
{
  "nodes": [
    {"id": "a", "label": "Month End", "style": "start"},
    {"id": "b", "label": "Gather Sales Data"},
    {"id": "c", "label": "Data Match?", "shape": "diamond", "style": "decision"},
    {"id": "d", "label": "File Return", "style": "end"}
  ],
  "edges": [
    {"from": "a", "to": "b"},
    {"from": "b", "to": "c"},
    {"from": "c", "to": "d", "label": "yes"}
  ],
  "direction": "TB"
}
\`\`\`

Diagram rules:
- ALWAYS use this JSON format for diagrams. NEVER mermaid, NEVER ASCII art.
- Node id must be a short string (e.g. "a", "step1", "check").
- Node label is the text shown on the box — plain text, punctuation fine, no escapes.
- style options: "start" (teal-filled), "end" (green), "decision" (amber diamond), or omit for default.
- shape options: "rect" (default), "rounded", "diamond", "ellipse".
- direction: "TB" (top-down, default), "LR" (left-right), "BT", "RL".
- Keep diagrams focused — 12 nodes max per diagram.

Tight, no fluff.

Domain: GST, TDS, ITR, Form 3CD, MCA, GSTR-2B, audit. Talk like a sharp junior colleague who gets it done — not a formal consultant.`

// ── Tool definitions ──────────────────────────────────
const listDirectoryTool = tool(
  async ({ path }) => listDirectory(path),
  {
    name: 'list_directory',
    description: 'Lists all files and folders in a given directory path.',
    schema: z.object({ path: z.string().describe('Directory path to list') }),
  }
)
const readFileTool = tool(
  async ({ path }) => readFile(path),
  {
    name: 'read_file',
    description: 'Reads content of a text file (txt, csv, json, md, log, code).',
    schema: z.object({ path: z.string().describe('Full file path to read') }),
  }
)
const executeShellTool = tool(
  async ({ command }) => executeShell(command),
  {
    name: 'execute_shell',
    description: 'Executes a PowerShell or CMD command on the local Windows machine. Use freely for most tasks. Destructive commands (delete, format, install) will prompt the user for approval first.',
    schema: z.object({ command: z.string().describe('The shell command to execute') }),
  }
)
const writeFileTool = tool(
  async ({ path, content }) => writeFile(path, content),
  {
    name: 'write_file',
    description: 'Writes or overwrites a file. Always asks user for approval first.',
    schema: z.object({
      path: z.string().describe('Full file path to write to'),
      content: z.string().describe('Content to write'),
    }),
  }
)

export const ALL_TOOLS = [listDirectoryTool, readFileTool, executeShellTool, writeFileTool]
export const TOOL_MAP: Record<string, (args: any) => Promise<string>> = {
  list_directory: (a) => listDirectoryTool.invoke(a),
  read_file:      (a) => readFileTool.invoke(a),
  execute_shell:  (a) => executeShellTool.invoke(a),
  write_file:     (a) => writeFileTool.invoke(a),
}

// ── Model builder ─────────────────────────────────────
export function buildModel(
  apiKey: string,
  model: GeminiModel,
  extraTools: any[] = []
) {
  return new ChatGoogleGenerativeAI({
    apiKey,
    model: MODEL_API_ID[model],
    streaming: false,
    apiVersion: 'v1beta',
  }).bindTools([...ALL_TOOLS, ...extraTools])
}

function buildSimpleModel(apiKey: string, model: GeminiModel = 'gemini-2.5-flash') {
  return new ChatGoogleGenerativeAI({
    apiKey, model: MODEL_API_ID[model], apiVersion: 'v1beta',
  })
}

// ── History formatter ─────────────────────────────────
export function formatHistory(messages: { role: string; content: string }[]) {
  return messages.map(m => {
    if (m.role === 'user')      return new HumanMessage(m.content)
    if (m.role === 'assistant') return new AIMessage(m.content)
    return new SystemMessage(m.content)
  })
}

// Gemini + LangChain sometimes return response.content as an array of blocks
// like [{type:'text', text:'...'}, {type:'text', text:'...'}]. We need to
// concatenate the 'text' fields, not JSON.stringify the whole thing — doing
// that wraps mermaid/code blocks in JSON escaping and breaks rendering.
function extractContentText(content: any): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((block: any) => {
        if (typeof block === 'string') return block
        if (block?.type === 'text' && typeof block.text === 'string') return block.text
        if (typeof block?.text === 'string') return block.text  // fallback
        return ''
      })
      .join('')
  }
  // Last resort — shouldn't normally hit this path
  if (content?.text) return String(content.text)
  return ''
}

export function isQuotaError(err: any): boolean {
  const msg = (err?.message ?? '').toLowerCase()
  return msg.includes('429') || msg.includes('quota') || msg.includes('rate limit') ||
         msg.includes('resource_exhausted') || msg.includes('too many requests')
}

export function isAuthError(err: any): boolean {
  const msg = (err?.message ?? '').toLowerCase()
  return msg.includes('401') || msg.includes('invalid api key') ||
         msg.includes('api_key_invalid') || msg.includes('permission_denied') ||
         msg.includes('unauthenticated')
}

export function isNetworkError(err: any): boolean {
  const msg = (err?.message ?? '').toLowerCase()
  return msg.includes('enotfound') || msg.includes('econnrefused') ||
         msg.includes('network') || msg.includes('timeout') ||
         msg.includes('etimedout') || msg.includes('fetch failed')
}

export function isServerError(err: any): boolean {
  const msg = (err?.message ?? '').toLowerCase()
  return msg.includes('500') || msg.includes('503') || msg.includes('unavailable') ||
         msg.includes('internal error') || msg.includes('overloaded')
}

export function humanizeError(err: any, model: GeminiModel): string {
  const label = MODEL_LABEL[model]
  if (isQuotaError(err))   return `${label} hit its rate limit.`
  if (isAuthError(err))    return `Your Gemini API key is invalid. Check it in Settings.`
  if (isNetworkError(err)) return `Can't reach the Gemini API. Check your connection.`
  if (isServerError(err))  return `${label} is temporarily unavailable.`
  const msg = err?.message ?? 'Unknown error'
  return msg.length > 160 ? msg.slice(0, 160) + '…' : msg
}

export async function generateChatTitle(
  apiKey: string,
  userMsg: string, assistantMsg: string
): Promise<string> {
  // Always use Flash for titles — cheapest, fastest, and quality doesn't matter for 4 words
  const model = buildSimpleModel(apiKey, 'gemini-2.5-flash')
  const prompt = `Generate a concise 4-word title for this conversation.
Reply with ONLY the title. No quotes, no punctuation, no explanation.
User: ${userMsg.slice(0, 150)}
Assistant: ${assistantMsg.slice(0, 150)}`
  const response = await (model as any).invoke(prompt)
  const text = extractContentText(response.content) || 'Untitled Chat'
  return text.trim().slice(0, 40)
}

// ── Step event ─────────────────────────────────────────
export interface StepEvent {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'done' | 'model_switched' | 'usage'
  toolName?: string
  toolArgs?: any
  result?: string
  iteration?: number
  from?: GeminiModel
  to?: GeminiModel
  reason?: string
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  durationMs?: number
}

// ── Abort support ──────────────────────────────────────
// A single module-level flag that the agent loop checks between iterations.
// main.ts flips this via abortCurrentRun() when the user hits Stop.
let abortFlag = false
export function abortCurrentRun() { abortFlag = true }
export function resetAbortFlag() { abortFlag = false }
export function isAborted() { return abortFlag }

async function invokeWithTimeout(model: any, messages: any[], timeoutMs = 45000): Promise<any> {
  return Promise.race([
    model.invoke(messages),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Model invoke timed out after ${timeoutMs / 1000}s`)), timeoutMs)
    ),
  ])
}

// ── The Agent Loop ─────────────────────────────────────
export async function runAgentLoop(
  apiKey: string,
  messages: any[],
  win: BrowserWindow,
  onChunk: (text: string) => void,
  onStep: (step: StepEvent) => void,
  mcpTools: any[] = [],
  chatId: number | null = null,
  modelOverride?: GeminiModel
): Promise<string> {
  const usingModel = modelOverride ?? activeModel

  // Pull in Google Workspace tools if the user is signed in.
  // Zero cost when not connected — getGoogleToolsIfConnected returns [].
  const googleTools = getGoogleToolsIfConnected()

  const allExtraTools = [...mcpTools, ...googleTools]

  console.log(`[agent] Starting loop | model=${usingModel} | messages=${messages.length} | mcpTools=${mcpTools.length} | googleTools=${googleTools.length} | chatId=${chatId}`)

  const model = buildModel(apiKey, usingModel, allExtraTools)
  const currentMessages = [new SystemMessage(SYSTEM_PROMPT), ...messages]

  const dynamicToolMap: Record<string, (args: any) => Promise<string>> = { ...TOOL_MAP, ...GOOGLE_TOOL_MAP }
  for (const mcpTool of mcpTools) {
    dynamicToolMap[mcpTool.name] = (args: any) => mcpTool.invoke(args)
  }

  for (let i = 0; i < 5; i++) {
    // Abort check at start of each iteration
    if (isAborted()) {
      console.log('[agent] Aborted by user before iteration', i + 1)
      const partialText = currentMessages
        .filter((m: any) => m._getType?.() === 'ai')
        .map((m: any) => typeof m.content === 'string' ? m.content : '')
        .filter(Boolean)
        .pop() ?? ''
      onStep({ type: 'done' })
      onChunk(partialText || '_[Stopped]_')
      return partialText || '_[Stopped]_'
    }

    onStep({ type: 'thinking', iteration: i + 1 })
    console.log(`[agent] Iteration ${i + 1}: invoking ${usingModel}…`)

    const invokeStart = Date.now()
    const response = await invokeWithTimeout(model, currentMessages)
    const invokeMs = Date.now() - invokeStart
    currentMessages.push(response)

    // Abort check immediately after model returns — don't start tool calls
    if (isAborted()) {
      console.log('[agent] Aborted by user after model response')
      const text = extractContentText(response.content)
      onStep({ type: 'done' })
      onChunk(text || '_[Stopped]_')
      return text || '_[Stopped]_'
    }

    const usage = extractTokenUsage(response)
    console.log(`[agent] Iter ${i + 1} done in ${invokeMs}ms | tokens in=${usage.inputTokens} out=${usage.outputTokens} total=${usage.totalTokens}`)
    recordUsage({
      chatId,
      messageId: null,
      provider: 'gemini',
      model: usingModel,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      durationMs: invokeMs,
    })
    onStep({
      type: 'usage',
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      durationMs: invokeMs,
    })

    const toolCalls = response.tool_calls ?? []
    console.log(`[agent] Response received | tool_calls=${toolCalls.length}`)

    if (toolCalls.length === 0) {
      const finalText = extractContentText(response.content)
      onStep({ type: 'done' })
      onChunk(finalText)
      return finalText
    }

    for (const tc of toolCalls) {
      const toolName = tc.name
      const toolArgs = tc.args

      onStep({ type: 'tool_call', toolName, toolArgs })
      console.log(`[agent] Tool call: ${toolName}`, toolArgs)

      const needsApproval =
        DANGEROUS_TOOLS.has(toolName) ||
        (toolName === 'execute_shell' && isDestructiveShell(toolArgs.command))

      let toolResult: string
      if (needsApproval) {
        const approved = await requestApproval(win, toolName, toolArgs)
        toolResult = approved
          ? (await dynamicToolMap[toolName]?.(toolArgs)) ?? 'Tool not found'
          : `Tool "${toolName}" was rejected by the user.`
      } else {
        toolResult = (await dynamicToolMap[toolName]?.(toolArgs)) ?? 'Tool not found'
      }

      onStep({ type: 'tool_result', toolName, result: toolResult.slice(0, 200) })
      currentMessages.push(
        new ToolMessage({ content: toolResult, tool_call_id: tc.id ?? toolName })
      )
    }
  }

  return 'Maximum tool iterations reached.'
}

// ── Fallback wrapper — walks MODEL_CHAIN on quota/network/server errors ─────
export async function runAgentLoopWithFallback(
  apiKey: string,
  messages: any[],
  win: BrowserWindow,
  onChunk: (text: string) => void,
  onStep: (step: StepEvent) => void,
  mcpTools: any[] = [],
  chatId: number | null = null
): Promise<string> {
  // Start from the user's currently-selected model and walk down the chain
  const startIndex = MODEL_CHAIN.indexOf(activeModel)
  const chain = startIndex >= 0 ? MODEL_CHAIN.slice(startIndex) : MODEL_CHAIN
  const originalActive = activeModel

  let lastErr: any = null

  for (let i = 0; i < chain.length; i++) {
    const model = chain[i]
    try {
      if (i > 0) {
        const from = chain[i - 1]
        const reason = isQuotaError(lastErr) ? 'rate limit'
                      : isNetworkError(lastErr) ? 'network issue'
                      : isServerError(lastErr) ? 'server unavailable'
                      : 'error'
        console.log(`[agent] Falling back ${from} → ${model} (${reason})`)
        setActiveModel(model)
        onStep({ type: 'model_switched', from, to: model, reason })
      }
      return await runAgentLoop(apiKey, messages, win, onChunk, onStep, mcpTools, chatId, model)
    } catch (err: any) {
      lastErr = err
      const recoverable = isQuotaError(err) || isNetworkError(err) || isServerError(err)
      if (!recoverable || i === chain.length - 1) {
        // Restore the user's original model choice before throwing
        setActiveModel(originalActive)
        throw err
      }
      // else: loop continues to next model in chain
    }
  }

  // Shouldn't reach here, but just in case
  setActiveModel(originalActive)
  throw lastErr
}
