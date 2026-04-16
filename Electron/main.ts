import { app, BrowserWindow, ipcMain, session } from 'electron'
import path from 'path'
import { getDb } from './database'
import { storeGet, storeSet, storeDelete } from './store'
import {
  runAgentLoop, formatHistory, isQuotaError,
  getActiveProvider, setActiveProvider, generateChatTitle,
  type LlmProvider
} from './llmService'
import { resolveApproval } from './approvalGate'
import {
  readMcpConfig, writeMcpConfig, getMcpStatus,
  loadMcpServer, disconnectAll
} from './mcpManager'

const MCP_CONFIG_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'mcp_config.json')
  : path.join(app.getAppPath(), 'mcp_config.json')

// ── Keyword → MCP server ID map for lazy-loading ──────
// Add entries here as MCPs are debugged and confirmed working
const MCP_TRIGGER_MAP: Record<string, string> = {
  // 'drive':      'google-workspace',
  // 'gdrive':     'google-workspace',
  // 'google doc': 'google-workspace',
  // 'filesystem': 'filesystem',
  // 'browse':     'puppeteer',
  // 'screenshot': 'puppeteer',
}

function detectMcpServerId(userMessage: string): string | null {
  const lower = userMessage.toLowerCase()
  for (const [keyword, serverId] of Object.entries(MCP_TRIGGER_MAP)) {
    if (lower.includes(keyword)) return serverId
  }
  return null
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1300,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    title: 'DigiMon',
    backgroundColor: '#0A0A0D',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self' 'unsafe-eval'; " +
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
          "font-src 'self' https://fonts.gstatic.com; " +
          "img-src 'self' data: https:; " +
          "connect-src 'self' https://generativelanguage.googleapis.com https://api.x.ai;"
        ],
      },
    })
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(async () => {
  const db = getDb()
  console.log('✅ SQLite ready at:', app.getPath('userData'))

  // MCP disabled on startup — lazy-loaded per task via detectMcpServerId()
  // To re-enable a server: uncomment its entry in MCP_TRIGGER_MAP above,
  // verify it works with loadMcpServer(), then add it to the map.
  console.log('ℹ️  MCP auto-init skipped — lazy-load mode active')

  // ── Secure Store ──────────────────────────────────────
  ipcMain.handle('store:set', (_e, key: string, value: string) => {
    storeSet(key, value); return true
  })
  ipcMain.handle('store:get', (_e, key: string) => storeGet(key))
  ipcMain.handle('store:delete', (_e, key: string) => {
    storeDelete(key); return true
  })

  // ── Chats ─────────────────────────────────────────────
  ipcMain.handle('db:createChat', (_e, title: string) => {
    const result = db.prepare('INSERT INTO chats (title) VALUES (?)').run(title)
    return Number(result.lastInsertRowid)
  })
  ipcMain.handle('db:getChats', () =>
    db.prepare('SELECT * FROM chats ORDER BY created_at DESC').all()
  )
  ipcMain.handle('db:deleteChat', (_e, chatId: number) => {
    db.prepare('DELETE FROM chats WHERE id = ?').run(chatId)
    return true
  })
  ipcMain.handle('db:updateChatTitle', (_e, chatId: number, title: string) => {
    db.prepare('UPDATE chats SET title = ? WHERE id = ?').run(title, chatId)
    return true
  })

  // ── Messages ──────────────────────────────────────────
  ipcMain.handle('db:saveMessage', (_e, chatId: number, role: string, content: string) => {
    const result = db.prepare(
      'INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)'
    ).run(chatId, role, content)
    return Number(result.lastInsertRowid)
  })
  ipcMain.handle('db:getMessages', (_e, chatId: number) =>
    db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC').all(chatId)
  )

  // ── LLM: Send ─────────────────────────────────────────
  ipcMain.handle('chat:send', async (event, chatId: number, userMessage: string) => {
    const geminiKey = storeGet('gemini_api_key')
    const grokKey   = storeGet('grok_api_key')
    if (!geminiKey && !grokKey) {
      event.sender.send('chat:error', 'No API key found. Add one in Settings → AI Model Keys.')
      return
    }

    db.prepare('INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)')
      .run(chatId, 'user', userMessage)

    const history = db.prepare(
      'SELECT role, content FROM messages WHERE chat_id = ? ORDER BY created_at ASC LIMIT 20'
    ).all(chatId) as { role: string; content: string }[]

    const win = BrowserWindow.getFocusedWindow()!
    event.sender.send('llm:provider', getActiveProvider())

    // Lazy-load MCP tools only if the message triggers a known keyword
    let mcpTools: any[] = []
    const triggeredServerId = detectMcpServerId(userMessage)
    if (triggeredServerId) {
      try {
        console.log(`🔌 Lazy-loading MCP: ${triggeredServerId}`)
        mcpTools = await loadMcpServer(MCP_CONFIG_PATH, triggeredServerId)
        console.log(`✅ MCP loaded: ${mcpTools.length} tools from ${triggeredServerId}`)
      } catch (err: any) {
        console.warn(`⚠️  MCP lazy-load failed for ${triggeredServerId}: ${err.message}`)
        // Continue without MCP tools — don't block the message
      }
    }

    try {
      const fullResponse = await runAgentLoop(
        geminiKey, grokKey, formatHistory(history), win,
        (chunk) => event.sender.send('chat:chunk', chunk),
        (step)  => event.sender.send('chat:step', step),
        mcpTools
      )

      event.sender.send('chat:done')
      db.prepare('INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)')
        .run(chatId, 'assistant', fullResponse)

      // Auto-name on first exchange
      const msgCount = (db.prepare(
        'SELECT COUNT(*) as count FROM messages WHERE chat_id = ?'
      ).get(chatId) as { count: number }).count

      if (msgCount <= 2) {
        generateChatTitle(geminiKey, grokKey, userMessage, fullResponse)
          .then(title => {
            db.prepare('UPDATE chats SET title = ? WHERE id = ?').run(title, chatId)
            event.sender.send('chat:titled', { chatId, title })
          })
          .catch(() => {})
      }
    } catch (err: any) {
      if (isQuotaError(err)) {
        event.sender.send('llm:quota-hit', {
          from: getActiveProvider(), hasGrok: !!grokKey, hasGemini: !!geminiKey
        })
      } else {
        event.sender.send('chat:error', err.message ?? 'Unknown error')
      }
    }
  })

  // ── LLM: Retry ────────────────────────────────────────
  ipcMain.handle('chat:retry', async (event, chatId: number) => {
    const geminiKey = storeGet('gemini_api_key')
    const grokKey   = storeGet('grok_api_key')
    if (!geminiKey && !grokKey) {
      event.sender.send('chat:error', 'No API key found.'); return
    }

    const msgs = db.prepare(
      'SELECT role, content FROM messages WHERE chat_id = ? ORDER BY created_at ASC LIMIT 20'
    ).all(chatId) as { role: string; content: string }[]

    const last = msgs[msgs.length - 1]
    if (last?.role === 'assistant') {
      db.prepare(
        'DELETE FROM messages WHERE chat_id = ? AND id = (SELECT MAX(id) FROM messages WHERE chat_id = ?)'
      ).run(chatId, chatId)
      msgs.pop()
    }

    const win = BrowserWindow.getFocusedWindow()!
    event.sender.send('llm:provider', getActiveProvider())

    try {
      const fullResponse = await runAgentLoop(
        geminiKey, grokKey, formatHistory(msgs), win,
        (chunk) => event.sender.send('chat:chunk', chunk),
        (step)  => event.sender.send('chat:step', step),
        [] // retry always uses no MCP tools
      )
      event.sender.send('chat:done')
      db.prepare('INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)')
        .run(chatId, 'assistant', fullResponse)
    } catch (err: any) {
      if (isQuotaError(err)) {
        event.sender.send('llm:quota-hit', { from: getActiveProvider(), hasGrok: !!grokKey, hasGemini: !!geminiKey })
      } else {
        event.sender.send('chat:error', err.message ?? 'Unknown error')
      }
    }
  })

  // ── Tool Approval ─────────────────────────────────────
  ipcMain.handle('tool:approve', (_e, approved: boolean) => {
    resolveApproval(approved); return true
  })

  // ── LLM Provider ──────────────────────────────────────
  ipcMain.handle('llm:setProvider', (_e, provider: LlmProvider) => {
    setActiveProvider(provider); return true
  })
  ipcMain.handle('llm:getProvider', () => getActiveProvider())

  // ── MCP ───────────────────────────────────────────────
  ipcMain.handle('mcp:getConfig', () => readMcpConfig(MCP_CONFIG_PATH))
  ipcMain.handle('mcp:getStatus', () => getMcpStatus())

  ipcMain.handle('mcp:toggleServer', async (_e, serverId: string, enabled: boolean) => {
    const config = readMcpConfig(MCP_CONFIG_PATH)
    const server = config.servers.find((s: any) => s.id === serverId)
    if (server) { server.enabled = enabled; writeMcpConfig(MCP_CONFIG_PATH, config) }
    if (!enabled) {
      // Disconnect immediately if disabling
      await disconnectAll()
    }
    return true
  })

  ipcMain.handle('mcp:enableWithEnv', async (_e, serverId: string, envValues: Record<string, string>, serverConfig: any) => {
    for (const [key, value] of Object.entries(envValues)) {
      storeSet(`mcp_env_${serverId}_${key}`, value)
    }
    const config = readMcpConfig(MCP_CONFIG_PATH)
    const existing = config.servers.find((s: any) => s.id === serverId)
    if (!existing) {
      config.servers.push({
        id: serverId, name: serverConfig.name,
        description: serverConfig.description, type: 'stdio',
        command: serverConfig.command, args: serverConfig.args,
        envKeys: serverConfig.envVars.map((e: any) => e.key),
        enabled: true,
      })
    } else {
      existing.enabled = true
      existing.envKeys = serverConfig.envVars.map((e: any) => e.key)
    }
    writeMcpConfig(MCP_CONFIG_PATH, config)
    // Do NOT auto-init — will be lazy-loaded on next relevant message
    console.log(`✅ MCP config saved for: ${serverId} (will lazy-load on next use)`)
    return true
  })

  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
