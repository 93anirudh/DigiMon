import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import fs from 'fs'
import { storeGet } from './store'

export interface McpServerConfig {
  id: string
  name: string
  description: string
  type: 'stdio'
  command: string
  args: string[]
  env?: Record<string, string>
  envKeys?: string[]
  enabled: boolean
}

export interface McpConfig {
  servers: McpServerConfig[]
}

const activeClients: Map<string, Client> = new Map()
let mcpLangchainTools: any[] = []

export function readMcpConfig(configPath: string): McpConfig {
  try {
    const raw = fs.readFileSync(configPath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return { servers: [] }
  }
}

export function writeMcpConfig(configPath: string, config: McpConfig) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

async function connectServer(server: McpServerConfig): Promise<void> {
  // google-workspace is handled natively via googleTools.ts — never spawn
  // an MCP subprocess for it. This guard stops the old gdrive MCP from
  // starting and crashing with "Credentials not found".
  if (server.id === 'google-workspace') {
    console.log('[mcp] Skipping google-workspace — handled natively, not via MCP')
    return
  }

  const client = new Client({ name: 'digimon', version: '1.0.0' })

  const secureEnv: Record<string, string> = {}
  if (server.envKeys && server.envKeys.length > 0) {
    for (const key of server.envKeys) {
      const val = storeGet(`mcp_env_${server.id}_${key}`)
      if (val) secureEnv[key] = val
    }
  }

  const transport = new StdioClientTransport({
    command: server.command,
    args: server.args,
    env: {
      ...process.env,
      ...(server.env ?? {}),
      ...secureEnv,
    } as Record<string, string>,
  })

  // Race the connect against a timeout — MCP subprocesses can hang forever
  await Promise.race([
    client.connect(transport),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Connection timed out after 15s')), 15000)
    ),
  ])

  activeClients.set(server.id, client)
  console.log(`[mcp] Connected: ${server.name}`)
}

export async function disconnectAll() {
  for (const [id, client] of activeClients) {
    try { await client.close() } catch {}
    console.log(`[mcp] Disconnected: ${id}`)
  }
  activeClients.clear()
  mcpLangchainTools = []
}

// ── Lazy-load a single MCP server ────────────────────
export async function loadMcpServer(
  configPath: string,
  serverId: string
): Promise<any[]> {
  if (activeClients.has(serverId)) {
    const cached = mcpLangchainTools.filter(t => t.name.startsWith(`${serverId}__`))
    console.log(`[mcp] Cache hit: ${serverId} (${cached.length} tools)`)
    return cached
  }

  const config = readMcpConfig(configPath)
  const server = config.servers.find(s => s.id === serverId && s.enabled)
  if (!server) {
    console.warn(`[mcp] Server "${serverId}" not found or disabled`)
    return []
  }

  await connectServer(server)

  const client = activeClients.get(serverId)
  if (!client) return []

  const newTools: any[] = []
  try {
    const { tools } = await client.listTools()
    for (const mcpTool of tools) {
      const lct = tool(
        async (args: Record<string, any>) => {
          const result = await client.callTool({ name: mcpTool.name, arguments: args })
          const text = result.content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join('\n')
          return text || JSON.stringify(result.content)
        },
        {
          name: `${serverId}__${mcpTool.name}`,
          description: `[${serverId}] ${mcpTool.description ?? mcpTool.name}`,
          schema: z.object(buildZodSchema(mcpTool.inputSchema)),
        }
      )
      newTools.push(lct)
      mcpLangchainTools.push(lct)
    }
    console.log(`[mcp] Loaded ${tools.length} tools from ${serverId}`)
  } catch (err: any) {
    console.error(`[mcp] listTools failed for ${serverId}: ${err.message}`)
  }

  return newTools
}

// ── Test connection — used by "Enable" button in marketplace ───────
// Connects, lists tools, then disconnects. Reports success/failure with detail.
export async function testMcpServer(
  configPath: string,
  serverId: string
): Promise<{ ok: boolean; toolCount?: number; error?: string }> {
  // Clear any stale connection first
  const existing = activeClients.get(serverId)
  if (existing) {
    try { await existing.close() } catch {}
    activeClients.delete(serverId)
    mcpLangchainTools = mcpLangchainTools.filter(t => !t.name.startsWith(`${serverId}__`))
  }

  const config = readMcpConfig(configPath)
  const server = config.servers.find(s => s.id === serverId)
  if (!server) return { ok: false, error: 'Server not found in config' }

  try {
    console.log(`[mcp] Testing connection to ${serverId}…`)
    await connectServer(server)
    const client = activeClients.get(serverId)!
    const { tools } = await client.listTools()
    console.log(`[mcp] ✅ ${serverId} works — ${tools.length} tools available`)

    // Disconnect after test — will lazy-reconnect when actually used in chat
    try { await client.close() } catch {}
    activeClients.delete(serverId)

    return { ok: true, toolCount: tools.length }
  } catch (err: any) {
    console.error(`[mcp] ❌ ${serverId} failed: ${err.message}`)
    // Clean up whatever half-connected
    const client = activeClients.get(serverId)
    if (client) { try { await client.close() } catch {} }
    activeClients.delete(serverId)

    // Make the error human
    let friendly = err.message
    if (friendly.includes('ENOENT')) friendly = 'Command not found. Is Node.js / npx installed?'
    if (friendly.includes('timed out')) friendly = 'Server took too long to start. Check the command and required env vars.'
    if (friendly.includes('spawn')) friendly = 'Could not start the MCP subprocess. Check the command in config.'
    return { ok: false, error: friendly }
  }
}

export function getMcpTools(): any[] { return mcpLangchainTools }

export function getMcpStatus(): { id: string; connected: boolean }[] {
  return Array.from(activeClients.keys()).map(id => ({ id, connected: true }))
}

function buildZodSchema(inputSchema: any): Record<string, any> {
  if (!inputSchema?.properties) return {}
  const shape: Record<string, any> = {}
  for (const [key, val] of Object.entries<any>(inputSchema.properties)) {
    const required = inputSchema.required?.includes(key) ?? false
    let zodType: any = z.string()
    if (val.type === 'number') zodType = z.number()
    if (val.type === 'boolean') zodType = z.boolean()
    if (val.description) zodType = zodType.describe(val.description)
    shape[key] = required ? zodType : zodType.optional()
  }
  return shape
}
