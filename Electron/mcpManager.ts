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
// All registered MCP langchain tools across all connected servers
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
  try {
    const client = new Client({ name: 'digimon', version: '1.0.0' })

    // Pull stored env vars (API keys etc.) from secure store
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

    await client.connect(transport)
    activeClients.set(server.id, client)
    console.log(`✅ MCP connected: ${server.name}`)
  } catch (err: any) {
    console.error(`❌ MCP failed: ${server.name} — ${err.message}`)
    throw err
  }
}

export async function disconnectAll() {
  for (const [id, client] of activeClients) {
    try { await client.close() } catch {}
    console.log(`🔌 MCP disconnected: ${id}`)
  }
  activeClients.clear()
  mcpLangchainTools = []
}

// ── Lazy-load a single MCP server on demand ────────────
// Returns the LangChain tools registered from that server.
// If already connected, returns cached tools immediately (no re-init).
export async function loadMcpServer(
  configPath: string,
  serverId: string
): Promise<any[]> {
  // Return cached tools if this server is already connected
  if (activeClients.has(serverId)) {
    const cached = mcpLangchainTools.filter(t => t.name.startsWith(`${serverId}__`))
    console.log(`⚡ MCP cache hit: ${serverId} (${cached.length} tools)`)
    return cached
  }

  const config = readMcpConfig(configPath)
  const server = config.servers.find(s => s.id === serverId && s.enabled)
  if (!server) {
    console.warn(`⚠️  MCP server "${serverId}" not found or not enabled in config`)
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
    console.log(`🔧 Lazy-loaded ${tools.length} tools from: ${serverId}`)
  } catch (err: any) {
    console.error(`Failed to list tools from ${serverId}: ${err.message}`)
  }

  return newTools
}

// getMcpTools() kept for compatibility but now only returns already-loaded tools
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
