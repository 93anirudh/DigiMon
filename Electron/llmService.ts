import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatOpenAI } from '@langchain/openai'
import {
  HumanMessage, AIMessage, SystemMessage, ToolMessage
} from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { listDirectory, readFile, executeShell, writeFile, DANGEROUS_TOOLS } from './tools'
import { requestApproval } from './approvalGate'
import { getMcpTools } from './mcpManager'
import type { BrowserWindow } from 'electron'

// ── Active provider state ─────────────────────────────
export type LlmProvider = 'gemini' | 'grok'
let activeProvider: LlmProvider = 'gemini'
export function getActiveProvider(): LlmProvider { return activeProvider }
export function setActiveProvider(p: LlmProvider) { activeProvider = p }

// ── System prompt ─────────────────────────────────────
const SYSTEM_PROMPT = `You are Practice OS, an expert AI assistant built for Indian Chartered Accountant (CA) firms and financial professionals.

RESPONSE FORMATTING — follow these rules on every response:
- TABLES: Use markdown tables for any comparison, list with attributes, financial data, or structured information. Never use bullet lists when a table would be cleaner.
- MERMAID DIAGRAMS: Whenever explaining a process, workflow, relationship, or sequence — always generate a Mermaid diagram using a proper fenced code block like this:
\`\`\`mermaid
graph TD
  A --> B
\`\`\`
  Use: flowchart TD or LR for processes, sequenceDiagram for step sequences, pie for distributions, gantt for timelines, erDiagram for data models.
- STRUCTURE: Use ## and ### headers to organize longer responses.
- EMPHASIS: Bold (**text**) key numbers, deadlines, and section names.
- CODE: Always tag code blocks with the language name (python, sql, bash, etc.)

Domain: GST, TDS, ITR, Form 3CD tax audit, MCA filings, GSTR-2B reconciliation, Indian income tax law. Be concise, accurate, and always prefer visual structure over plain text.`

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
    description: 'Reads content of a text file (txt, csv, json, md, log).',
    schema: z.object({ path: z.string().describe('Full file path to read') }),
  }
)
const executeShellTool = tool(
  async ({ command }) => executeShell(command),
  {
    name: 'execute_shell',
    description: 'Executes a PowerShell or CMD command on the local Windows machine.',
    schema: z.object({ command: z.string().describe('Shell command to execute') }),
  }
)
const writeFileTool = tool(
  async ({ path, content }) => writeFile(path, content),
  {
    name: 'write_file',
    description: 'Writes or overwrites a file with given content.',
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

// ── Model builders ─────────────────────────────────────
function buildGeminiModel(apiKey: string) {
  const model = new ChatGoogleGenerativeAI({
    apiKey, model: 'gemini-2.5-flash',
    streaming: false, apiVersion: 'v1beta',
  })
  return model.bindTools([...ALL_TOOLS, ...getMcpTools()])
}

function buildGrokModel(apiKey: string) {
  const model = new ChatOpenAI({
    apiKey, modelName: 'grok-3-fast',
    configuration: { baseURL: 'https://api.x.ai/v1' },
    streaming: false,
  })
  return model.bindTools([...ALL_TOOLS, ...getMcpTools()])
}

export function buildModel(geminiKey: string | null, grokKey: string | null) {
  if (activeProvider === 'grok' && grokKey) return buildGrokModel(grokKey)
  if (geminiKey) return buildGeminiModel(geminiKey)
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

// ── History formatter ──────────────────────────────────
export function formatHistory(messages: { role: string; content: string }[]) {
  return messages.map(m => {
    if (m.role === 'user')      return new HumanMessage(m.content)
    if (m.role === 'assistant') return new AIMessage(m.content)
    return new SystemMessage(m.content)
  })
}

export function isQuotaError(err: any): boolean {
  const msg = (err?.message ?? '').toLowerCase()
  return msg.includes('429') || msg.includes('quota') || msg.includes('rate limit')
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
  type: 'thinking' | 'tool_call' | 'tool_result' | 'done'
  toolName?: string
  toolArgs?: any
  result?: string
  iteration?: number
}

// ── The Agent Loop ─────────────────────────────────────
export async function runAgentLoop(
  geminiKey: string | null,
  grokKey: string | null,
  messages: any[],
  win: BrowserWindow,
  onChunk: (text: string) => void,
  onStep: (step: StepEvent) => void
): Promise<string> {
  const model = buildModel(geminiKey, grokKey)
  const currentMessages = [new SystemMessage(SYSTEM_PROMPT), ...messages]

  const dynamicToolMap: Record<string, (args: any) => Promise<string>> = { ...TOOL_MAP }
  for (const mcpTool of getMcpTools()) {
    dynamicToolMap[mcpTool.name] = (args: any) => mcpTool.invoke(args)
  }

  for (let i = 0; i < 5; i++) {
    onStep({ type: 'thinking', iteration: i + 1 })

    const response = await model.invoke(currentMessages)
    currentMessages.push(response)

    const toolCalls = response.tool_calls ?? []

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

      let toolResult: string
      if (DANGEROUS_TOOLS.has(toolName)) {
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
