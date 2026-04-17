import { app, BrowserWindow, ipcMain, session } from 'electron'
import path from 'path'
import { getDb } from './database'
import { storeGet, storeSet, storeDelete } from './store'
import {
  runAgentLoopWithFallback, formatHistory,
  getActiveProvider, setActiveProvider, generateChatTitle,
  humanizeError, isQuotaError,
  type LlmProvider
} from './llmService'
import { resolveApproval } from './approvalGate'
import {
  readMcpConfig, writeMcpConfig, getMcpStatus,
  loadMcpServer, disconnectAll, testMcpServer
} from './mcpManager'
import { getUsageSummary } from './usageService'

const MCP_CONFIG_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'mcp_config.json')
  : path.join(app.getAppPath(), 'mcp_config.json')

// ── Keyword → MCP server ID map for lazy-loading ──────
// When a user's message contains any of these keywords AND the MCP is enabled
// in settings, that MCP is spun up for this one message. Add more keywords as
// you discover patterns users actually type.
const MCP_TRIGGER_MAP: Record<string, string> = {
  // filesystem MCP
  'file': 'filesystem',
  'folder': 'filesystem',
  'directory': 'filesystem',
  // google workspace
  'gmail': 'google-workspace',
  'google drive': 'google-workspace',
  'gdrive': 'google-workspace',
  'google doc': 'google-workspace',
  'google sheet': 'google-workspace',
  // browser automation
  'browser': 'puppeteer',
  'screenshot': 'puppeteer',
  'navigate to': 'puppeteer',
  'website': 'puppeteer',
  // notion
  'notion': 'notion',
  // airtable
  'airtable': 'airtable',
  // whatsapp
  'whatsapp': 'whatsapp',
  // pdf
  'pdf': 'pdf-reader',
  // excel
  'excel': 'excel-csv',
  'xlsx': 'excel-csv',
  'spreadsheet': 'excel-csv',
  // ocr
  'ocr': 'ocr',
  'scanned': 'ocr',
  // github
  'github': 'github',
  // postgres
  'postgresql': 'postgres',
  'postgres': 'postgres',
}

function detectMcpServerId(userMessage: string): string | null {
  const lower = userMessage.toLowerCase()
  const config = readMcpConfig(MCP_CONFIG_PATH)
  const enabledIds = new Set(config.servers.filter(s => s.enabled).map(s => s.id))

  for (const [keyword, serverId] of Object.entries(MCP_TRIGGER_MAP)) {
    if (lower.includes(keyword) && enabledIds.has(serverId)) return serverId
  }
  return null
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1300, height: 840, minWidth: 900, minHeight: 600,
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

  // Catch uncaught Electron main process errors
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[main] Render process crashed:', details)
  })
}

app.whenReady().then(async () => {
  getDb()
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  DigiMon starting up')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`[main] userData: ${app.getPath('userData')}`)
  console.log(`[main] MCP auto-init: DISABLED (lazy-load mode)`)

  const hasGemini = !!storeGet('gemini_api_key')
  const hasGrok   = !!storeGet('grok_api_key')
  console.log(`[main] Keys on disk: gemini=${hasGemini} grok=${hasGrok}`)
  if (!hasGemini && !hasGrok) {
    console.log('[main] ⚠️  No API keys found — first-run setup will appear')
  }

  // ── Secure Store ──────────────────────────────────────
  ipcMain.handle('store:set', (_e, key: string, value: string) => {
    storeSet(key, value); return true
  })
  ipcMain.handle('store:get', (_e, key: string) => storeGet(key))
  ipcMain.handle('store:delete', (_e, key: string) => {
    storeDelete(key); return true
  })

  // Check if first-run setup is needed
  ipcMain.handle('app:needsSetup', () => {
    return !storeGet('gemini_api_key') && !storeGet('grok_api_key')
  })

  // ── Chats ─────────────────────────────────────────────
  const db = getDb()
  ipcMain.handle('db:createChat', (_e, title: string) => {
    const result = db.prepare('INSERT INTO chats (title) VALUES (?)').run(title)
    return Number(result.lastInsertRowid)
  })
  ipcMain.handle('db:getChats', () =>
    db.prepare('SELECT * FROM chats ORDER BY created_at DESC').all()
  )
  ipcMain.handle('db:deleteChat', (_e, chatId: number) => {
    db.prepare('DELETE FROM chats WHERE id = ?').run(chatId); return true
  })
  ipcMain.handle('db:updateChatTitle', (_e, chatId: number, title: string) => {
    db.prepare('UPDATE chats SET title = ? WHERE id = ?').run(title, chatId); return true
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

  // ── Shared: send a message through the agent ──────────
  async function runChat(
    event: Electron.IpcMainInvokeEvent,
    chatId: number,
    userMessage: string,
    history: { role: string; content: string }[],
    saveUserMessage: boolean
  ) {
    const geminiKey = storeGet('gemini_api_key')
    const grokKey   = storeGet('grok_api_key')

    if (!geminiKey && !grokKey) {
      event.sender.send('chat:error', 'No API key set. Open Settings and add one to begin.')
      return
    }

    if (saveUserMessage) {
      db.prepare('INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)')
        .run(chatId, 'user', userMessage)
    }

    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    if (!win) {
      event.sender.send('chat:error', 'Internal: no window found.')
      return
    }

    event.sender.send('llm:provider', getActiveProvider())

    // Lazy-load MCP tools only if a known keyword is in the message
    let mcpTools: any[] = []
    const triggeredServerId = detectMcpServerId(userMessage)
    if (triggeredServerId) {
      try {
        console.log(`[main] Lazy-loading MCP: ${triggeredServerId}`)
        mcpTools = await loadMcpServer(MCP_CONFIG_PATH, triggeredServerId)
      } catch (err: any) {
        console.warn(`[main] MCP lazy-load failed: ${err.message}`)
      }
    }

    try {
      const fullResponse = await runAgentLoopWithFallback(
        geminiKey, grokKey, formatHistory(history), win,
        (chunk) => event.sender.send('chat:chunk', chunk),
        (step)  => {
          event.sender.send('chat:step', step)
          if (step.type === 'provider_switched') {
            event.sender.send('llm:provider', step.to)
          }
          if (step.type === 'usage') {
            // push live usage updates so the header meter refreshes after every call
            event.sender.send('usage:tick')
          }
        },
        mcpTools,
        chatId
      )

      event.sender.send('chat:done')
      db.prepare('INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)')
        .run(chatId, 'assistant', fullResponse)

      const msgCount = (db.prepare(
        'SELECT COUNT(*) as count FROM messages WHERE chat_id = ?'
      ).get(chatId) as { count: number }).count

      if (msgCount <= 2 && saveUserMessage) {
        generateChatTitle(geminiKey, grokKey, userMessage, fullResponse)
          .then(title => {
            db.prepare('UPDATE chats SET title = ? WHERE id = ?').run(title, chatId)
            event.sender.send('chat:titled', { chatId, title })
          })
          .catch(() => {})
      }
    } catch (err: any) {
      const from = getActiveProvider()
      console.error(`[main] Chat failed | provider=${from} | ${err?.message}`)

      if (isQuotaError(err)) {
        event.sender.send('llm:quota-hit', {
          from, hasGrok: !!grokKey, hasGemini: !!geminiKey,
          message: humanizeError(err, from),
        })
      } else {
        event.sender.send('chat:error', humanizeError(err, from))
      }
    }
  }

  ipcMain.handle('chat:send', async (event, chatId: number, userMessage: string) => {
    const history = db.prepare(
      'SELECT role, content FROM messages WHERE chat_id = ? ORDER BY created_at ASC LIMIT 20'
    ).all(chatId) as { role: string; content: string }[]
    // history currently excludes the new message; runChat will save it
    await runChat(event, chatId, userMessage, [...history, { role: 'user', content: userMessage }], true)
  })

  ipcMain.handle('chat:retry', async (event, chatId: number) => {
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

    const lastUser = [...msgs].reverse().find(m => m.role === 'user')
    await runChat(event, chatId, lastUser?.content ?? '', msgs, false)
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

  // Validate an API key by making a cheap test call. Returns {ok, error?}
  ipcMain.handle('llm:testKey', async (_e, provider: LlmProvider, apiKey: string) => {
    try {
      console.log(`[main] Testing ${provider} key…`)
      if (provider === 'gemini') {
        const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai')
        const m = new ChatGoogleGenerativeAI({ apiKey, model: 'gemini-2.5-flash', apiVersion: 'v1beta' })
        await m.invoke('ping')
      } else {
        const { ChatOpenAI } = await import('@langchain/openai')
        const m = new ChatOpenAI({
          apiKey, modelName: 'grok-3-fast',
          configuration: { baseURL: 'https://api.x.ai/v1' },
        })
        await m.invoke('ping')
      }
      console.log(`[main] ${provider} key: OK`)
      return { ok: true }
    } catch (err: any) {
      console.log(`[main] ${provider} key: FAILED — ${err?.message}`)
      return { ok: false, error: humanizeError(err, provider) }
    }
  })

  // ── MCP ───────────────────────────────────────────────
  ipcMain.handle('mcp:getConfig', () => readMcpConfig(MCP_CONFIG_PATH))
  ipcMain.handle('mcp:getStatus', () => getMcpStatus())

  ipcMain.handle('mcp:toggleServer', async (_e, serverId: string, enabled: boolean) => {
    const config = readMcpConfig(MCP_CONFIG_PATH)
    const server = config.servers.find((s: any) => s.id === serverId)
    if (server) { server.enabled = enabled; writeMcpConfig(MCP_CONFIG_PATH, config) }
    if (!enabled) await disconnectAll()
    return true
  })

  // Save MCP config AND test-connect to verify it actually works.
  // Returns { ok, toolCount?, error? } so the UI can show ✓ or ✗.
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

    // Actually test the connection so the user knows it works
    const result = await testMcpServer(MCP_CONFIG_PATH, serverId)
    return result
  })

  // ── Usage tracking ──────────────────────────────────
  ipcMain.handle('usage:summary', (_e, activeChatId: number | null) => {
    return { summary: getUsageSummary(activeChatId) }
  })

  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

process.on('uncaughtException', (err) => {
  console.error('[main] Uncaught exception:', err)
})
process.on('unhandledRejection', (err) => {
  console.error('[main] Unhandled rejection:', err)
})
