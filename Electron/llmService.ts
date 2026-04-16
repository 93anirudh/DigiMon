import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatOpenAI } from '@langchain/openai'
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
import type { BrowserWindow } from 'electron'

// ── Active provider state ─────────────────────────────
export type LlmProvider = 'gemini' | 'grok'
let activeProvider: LlmProvider = 'gemini'
export function getActiveProvider(): LlmProvider { return activeProvider }
export function setActiveProvider(p: LlmProvider) {
  activeProvider = p
  console.log(`[llm] Provider → ${p}`)
}

// ── System prompt ─────────────────────────────────────
const SYSTEM_PROMPT = `You're DigiMon — a local desktop agent for Indian CA firms and business owners. You live on their Windows machine with access to their files, shell, and data.

Your superpower is execute_shell. Use it freely. You know PowerShell, CMD, Tally CLI, curl, Python, Node, Git, SQL. When something needs doing, figure out the command and run it. See the real output, adapt, iterate. That's the whole game.

Other tools: read_file, list_directory, write_file — use them when shell isn't the right fit.

Format: markdown tables for structured data. Mermaid code blocks for flows and diagrams. Tight, no fluff.

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

// ── Model builders ────────────────────────────────────
function buildGeminiModel(apiKey: string, extraTools: any[] = []) {
  return new ChatGoogleGenerativeAI({
    apiKey, model: 'gemini-2.5-flash',
    streaming: false, apiVersion: 'v1beta',
  }).bindTools([...ALL_TOOLS, ...extraTools])
}

function buildGrokModel(apiKey: string, extraTools: any[] = []) {
  return new ChatOpenAI({
    apiKey, modelName: 'grok-3-fast',
    configuration: { baseURL: 'https://api.x.ai/v1' },
    streaming: false,
  }).bindTools([...ALL_TOOLS, ...extraTools])
}

export function buildModel(
  geminiKey: string | null,
  grokKey: string | null,
  extraTools: any[] = []
) {
  if (activeProvider === 'grok' && grokKey) return buildGrokModel(grokKey, extraTools)
  if (geminiKey) return buildGeminiModel(geminiKey, extraTools)
  throw new Error('No API key available for the active provider.')
}

function buildSimpleModel(geminiKey: string | null, grokKey: string | null) {
  if (activeProvider === 'grok' && grokKey) {
    return new ChatOpenAI({ apiKey: grokKey, modelName: 'grok-3-fast',
      configuration: { baseURL: 'https://api.x.ai/v1' } })
  }
  if (geminiKey) {
    return new ChatGoogleGenerativeAI({
      apiKey: geminiKey, model: 'gemini-2.5-flash', apiVersion: 'v1beta',
    })
  }
  throw new Error('No API key available.')
}

// ── History formatter ─────────────────────────────────
export function formatHistory(messages: { role: string; content: string }[]) {
  return messages.map(m => {
    if (m.role === 'user')      return new HumanMessage(m.content)
    if (m.role === 'assistant') return new AIMessage(m.content)
    return new SystemMessage(m.content)
  })
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

// Turn any error into a clean human message
export function humanizeError(err: any, provider: LlmProvider): string {
  if (isQuotaError(err))   return `${provider === 'gemini' ? 'Gemini' : 'Grok'} hit its rate limit.`
  if (isAuthError(err))    return `${provider === 'gemini' ? 'Gemini' : 'Grok'} API key is invalid. Check it in Settings.`
  if (isNetworkError(err)) return `Network issue — can't reach the ${provider === 'gemini' ? 'Gemini' : 'Grok'} API. Check your connection.`
  const msg = err?.message ?? 'Unknown error'
  return msg.length > 160 ? msg.slice(0, 160) + '…' : msg
}

export async function generateChatTitle(
  geminiKey: string | null, grokKey: string | null,
  userMsg: string, assistantMsg: string
): Promise<string> {
  const model = buildSimpleModel(geminiKey, grokKey)
  const prompt = `Generate a concise 4-word title for this conversation.
Reply with ONLY the title. No quotes, no punctuation, no explanation.
User: ${userMsg.slice(0, 150)}
Assistant: ${assistantMsg.slice(0, 150)}`
  const response = await (model as any).invoke(prompt)
  const text = typeof response.content === 'string' ? response.content : 'Untitled Chat'
  return text.trim().slice(0, 40)
}

// ── Step event type ────────────────────────────────────
export interface StepEvent {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'done' | 'provider_switched'
  toolName?: string
  toolArgs?: any
  result?: string
  iteration?: number
  from?: LlmProvider
  to?: LlmProvider
}

// ── Invoke with timeout — never hang forever ──────────
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
  geminiKey: string | null,
  grokKey: string | null,
  messages: any[],
  win: BrowserWindow,
  onChunk: (text: string) => void,
  onStep: (step: StepEvent) => void,
  mcpTools: any[] = []
): Promise<string> {
  console.log(`[agent] Starting loop | provider=${activeProvider} | messages=${messages.length} | mcpTools=${mcpTools.length}`)

  const model = buildModel(geminiKey, grokKey, mcpTools)
  const currentMessages = [new SystemMessage(SYSTEM_PROMPT), ...messages]

  const dynamicToolMap: Record<string, (args: any) => Promise<string>> = { ...TOOL_MAP }
  for (const mcpTool of mcpTools) {
    dynamicToolMap[mcpTool.name] = (args: any) => mcpTool.invoke(args)
  }

  for (let i = 0; i < 5; i++) {
    onStep({ type: 'thinking', iteration: i + 1 })
    console.log(`[agent] Iteration ${i + 1}: invoking model…`)

    const response = await invokeWithTimeout(model, currentMessages)
    currentMessages.push(response)

    const toolCalls = response.tool_calls ?? []
    console.log(`[agent] Response received | tool_calls=${toolCalls.length}`)

    if (toolCalls.length === 0) {
      const finalText = typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content)
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
        console.log(`[agent] Awaiting approval for: ${toolName}`)
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

// ── Auto-fallback wrapper ──────────────────────────────
// If the active provider errors (quota/network), automatically switch to the
// other provider and retry once. Emits a provider_switched step so the UI can
// show a subtle toast.
export async function runAgentLoopWithFallback(
  geminiKey: string | null,
  grokKey: string | null,
  messages: any[],
  win: BrowserWindow,
  onChunk: (text: string) => void,
  onStep: (step: StepEvent) => void,
  mcpTools: any[] = []
): Promise<string> {
  try {
    return await runAgentLoop(geminiKey, grokKey, messages, win, onChunk, onStep, mcpTools)
  } catch (err: any) {
    const from = getActiveProvider()
    const hasOther = from === 'gemini' ? !!grokKey : !!geminiKey
    const recoverable = isQuotaError(err) || isNetworkError(err)

    if (hasOther && recoverable) {
      const to: LlmProvider = from === 'gemini' ? 'grok' : 'gemini'
      console.log(`[agent] ${from} failed (${humanizeError(err, from)}) — auto-switching to ${to}`)
      setActiveProvider(to)
      onStep({ type: 'provider_switched', from, to })
      try {
        return await runAgentLoop(geminiKey, grokKey, messages, win, onChunk, onStep, mcpTools)
      } catch (retryErr: any) {
        // Both failed — restore original, bubble up
        setActiveProvider(from)
        throw retryErr
      }
    }

    throw err
  }
}
