import { app, BrowserWindow, ipcMain, session } from 'electron'
import path from 'path'
import { getDb } from './database'
import { storeGet, storeSet, storeDelete } from './store'
import {
  runAgentLoopWithFallback, formatHistory,
  getActiveModel, setActiveModel, generateChatTitle,
  humanizeError, isQuotaError,
  MODEL_CHAIN,
  abortCurrentRun, resetAbortFlag,
  type GeminiModel
} from './llmService'
import { resolveApproval } from './approvalGate'
import {
  createClient, listClients, getClient, updateClient, archiveClient, deleteClient,
  createTask, listTasksForClient, listAllTasksWithClient, getTask,
  updateTaskStatus, updateTask, deleteTask, getDashboardCounts,
} from './practiceService'
import {
  readMcpConfig, writeMcpConfig, getMcpStatus,
  loadMcpServer, disconnectAll, testMcpServer
} from './mcpManager'
import { getUsageSummary } from './usageService'
import {
  startServer as startWhatsAppServer,
  stopServer as stopWhatsAppServer,
  pollStatus as pollWhatsAppStatus,
  getStatus as getWhatsAppStatus,
  logout as logoutWhatsApp,
} from './whatsappService'
import {
  startGoogleOAuth,
  cancelGoogleOAuth,
  getGoogleStatus,
  clearGoogleTokens,
  getValidAccessToken,
} from './googleOAuth'

const MCP_CONFIG_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'mcp_config.json')
  : path.join(app.getAppPath(), 'mcp_config.json')

// ── MCP keyword trigger map ───────────────────────────
const MCP_TRIGGER_MAP: Record<string, string> = {
  // Note: google-workspace is NOT in this map.
  // Google tools are injected into the agent loop directly via
  // googleTools.ts whenever the user is signed in. No MCP subprocess,
  // no keyword gating.

  // Excel / CSV
  'excel': 'excel-csv',
  'xlsx': 'excel-csv',
  'xls': 'excel-csv',
  'csv': 'excel-csv',
  'spreadsheet': 'excel-csv',
  'tally export': 'excel-csv',

  // PDF
  'pdf': 'pdf-reader',
  '.pdf': 'pdf-reader',

  // Web Reader
  'http://': 'fetch',
  'https://': 'fetch',
  'webpage': 'fetch',
  'website': 'fetch',
  'url': 'fetch',
  'cbic.gov.in': 'fetch',
  'mca.gov.in': 'fetch',
  'incometax.gov.in': 'fetch',

  // Memory
  'remember': 'memory',
  'recall': 'memory',
  'forget': 'memory',
  'what do you remember': 'memory',
  'do you remember': 'memory',
  'store this': 'memory',
  'note that': 'memory',
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
  // Resolve icon path — works in dev and when packaged inside asar.
  // In packaged app, process.resourcesPath points to …/resources/app.asar.unpacked
  // but build/icon.png is inside app.asar so we use __dirname relative path.
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar', 'build', 'icon.png')
    : path.join(app.getAppPath(), 'build', 'icon.png')

  const win = new BrowserWindow({
    width: 1300, height: 840, minWidth: 900, minHeight: 600,
    title: 'DigiMon',
    icon: iconPath,
    backgroundColor: '#E8E6F5',
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
          "connect-src 'self' https://generativelanguage.googleapis.com;"
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

  // Restore saved model choice if any
  const savedModel = storeGet('active_model') as GeminiModel | null
  if (savedModel && MODEL_CHAIN.includes(savedModel)) {
    setActiveModel(savedModel)
  }

  const hasKey = !!storeGet('gemini_api_key')
  console.log(`[main] Gemini key on disk: ${hasKey}`)
  if (!hasKey) {
    console.log('[main] ⚠️  No API key found — first-run setup will appear')
  }

  // ── Secure Store ──────────────────────────────────────
  ipcMain.handle('store:set', (_e, key: string, value: string) => {
    storeSet(key, value); return true
  })
  ipcMain.handle('store:get', (_e, key: string) => storeGet(key))
  ipcMain.handle('store:delete', (_e, key: string) => {
    storeDelete(key); return true
  })

  ipcMain.handle('app:needsSetup', () => !storeGet('gemini_api_key'))

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

  async function runChat(
    event: Electron.IpcMainInvokeEvent,
    chatId: number,
    userMessage: string,
    history: { role: string; content: string }[],
    saveUserMessage: boolean
  ) {
    const apiKey = storeGet('gemini_api_key')

    if (!apiKey) {
      event.sender.send('chat:error', 'No Gemini API key set. Open Settings to add one.')
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

    event.sender.send('llm:model', getActiveModel())

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
      resetAbortFlag()
      const fullResponse = await runAgentLoopWithFallback(
        apiKey, formatHistory(history), win,
        (chunk) => event.sender.send('chat:chunk', chunk),
        (step)  => {
          event.sender.send('chat:step', step)
          if (step.type === 'model_switched') {
            event.sender.send('llm:model', step.to)
          }
          if (step.type === 'usage') {
            event.sender.send('usage:tick')
          }
        },
        mcpTools,
        chatId
      )

      event.sender.send('chat:done')
      db.prepare('INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)')
        .run(chatId, 'assistant', fullResponse)

      // Title the chat if it hasn't been titled yet (title is '…' on create).
      // We look at the current title rather than msg count — safer if the user
      // retried or the count was off.
      const currentChat = db.prepare(
        'SELECT title FROM chats WHERE id = ?'
      ).get(chatId) as { title: string } | undefined

      if (currentChat && (currentChat.title === '…' || currentChat.title === '' || !currentChat.title) && saveUserMessage) {
        console.log(`[main] Generating title for chat ${chatId}…`)
        generateChatTitle(apiKey, userMessage, fullResponse)
          .then(title => {
            const clean = title.replace(/["']/g, '').trim().slice(0, 40) || 'New chat'
            db.prepare('UPDATE chats SET title = ? WHERE id = ?').run(clean, chatId)
            event.sender.send('chat:titled', { chatId, title: clean })
            console.log(`[main] Chat ${chatId} titled: "${clean}"`)
          })
          .catch(err => {
            console.warn(`[main] Title generation failed for chat ${chatId}:`, err?.message)
            // Fallback — use first 40 chars of user message
            const fallback = userMessage.slice(0, 40).trim() || 'New chat'
            db.prepare('UPDATE chats SET title = ? WHERE id = ?').run(fallback, chatId)
            event.sender.send('chat:titled', { chatId, title: fallback })
          })
      }
    } catch (err: any) {
      const model = getActiveModel()
      console.error(`[main] Chat failed | model=${model} | ${err?.message}`)

      if (isQuotaError(err)) {
        // All models in the chain hit quota — unusual. Surface as error.
        event.sender.send('chat:error',
          `All Gemini models hit rate limits. Try again in a minute. (${humanizeError(err, model)})`)
      } else {
        event.sender.send('chat:error', humanizeError(err, model))
      }
    }
  }

  ipcMain.handle('chat:send', async (event, chatId: number, userMessage: string) => {
    const history = db.prepare(
      'SELECT role, content FROM messages WHERE chat_id = ? ORDER BY created_at ASC LIMIT 20'
    ).all(chatId) as { role: string; content: string }[]
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

  ipcMain.handle('tool:approve', (_e, approved: boolean) => {
    resolveApproval(approved); return true
  })

  // ── Abort current run ────────────────────────────────
  ipcMain.handle('chat:abort', () => {
    abortCurrentRun()
    console.log('[main] User requested abort')
    return true
  })

  // ── Google OAuth ─────────────────────────────────────
  ipcMain.handle('google:status', () => {
    return getGoogleStatus()
  })

  ipcMain.handle('google:connect', async () => {
    try {
      const result = await startGoogleOAuth()
      return { ok: true, email: result.email }
    } catch (err: any) {
      console.error('[main] Google OAuth failed:', err.message)
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('google:disconnect', () => {
    clearGoogleTokens()
    console.log('[main] Google Workspace disconnected')
    return true
  })

  ipcMain.handle('google:cancel', () => {
    cancelGoogleOAuth()
    return true
  })

  // ── LLM Model selection (no more providers; just Gemini model choice) ────
  ipcMain.handle('llm:setModel', (_e, model: GeminiModel) => {
    if (!MODEL_CHAIN.includes(model)) return false
    setActiveModel(model)
    storeSet('active_model', model)
    return true
  })
  ipcMain.handle('llm:getModel', () => getActiveModel())
  ipcMain.handle('llm:getChain', () => MODEL_CHAIN)

  // Validate a Gemini API key
  ipcMain.handle('llm:testKey', async (_e, apiKey: string) => {
    try {
      console.log('[main] Testing Gemini key…')
      const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai')
      const m = new ChatGoogleGenerativeAI({
        apiKey, model: 'gemini-2.5-flash', apiVersion: 'v1beta',
      })
      await m.invoke('ping')
      console.log('[main] Gemini key: OK')
      return { ok: true }
    } catch (err: any) {
      console.log(`[main] Gemini key: FAILED — ${err?.message}`)
      return { ok: false, error: humanizeError(err, 'gemini-2.5-flash') }
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

    const result = await testMcpServer(MCP_CONFIG_PATH, serverId)
    return result
  })

  // ── Usage tracking ──────────────────────────────────
  ipcMain.handle('usage:summary', (_e, activeChatId: number | null) => {
    return { summary: getUsageSummary(activeChatId) }
  })

  // ── WhatsApp ──────────────────────────────────────────
  ipcMain.handle('whatsapp:start', async () => {
    return await startWhatsAppServer()
  })

  ipcMain.handle('whatsapp:stop', () => {
    stopWhatsAppServer()
    return true
  })

  ipcMain.handle('whatsapp:status', async () => {
    // Poll underlying server for fresh state then return
    return await pollWhatsAppStatus()
  })

  ipcMain.handle('whatsapp:getStatusSync', () => {
    return getWhatsAppStatus()
  })

  ipcMain.handle('whatsapp:logout', async () => {
    await logoutWhatsApp()
    return true
  })

  // ── CA Practice: Clients ──────────────────────────────
  ipcMain.handle('practice:createClient', (_e, input) => createClient(input))
  ipcMain.handle('practice:listClients',  (_e, includeArchived = false) => listClients(includeArchived))
  ipcMain.handle('practice:getClient',    (_e, id: number) => getClient(id))
  ipcMain.handle('practice:updateClient', (_e, id: number, patch) => updateClient(id, patch))
  ipcMain.handle('practice:archiveClient',(_e, id: number, archived: boolean) => archiveClient(id, archived))
  ipcMain.handle('practice:deleteClient', (_e, id: number) => deleteClient(id))

  // ── CA Practice: Tasks ────────────────────────────────
  ipcMain.handle('practice:createTask',         (_e, input) => createTask(input))
  ipcMain.handle('practice:listTasksForClient', (_e, clientId: number) => listTasksForClient(clientId))
  ipcMain.handle('practice:listAllTasks',       () => listAllTasksWithClient())
  ipcMain.handle('practice:getTask',            (_e, id: number) => getTask(id))
  ipcMain.handle('practice:updateTaskStatus',   (_e, id: number, status: string) => updateTaskStatus(id, status))
  ipcMain.handle('practice:updateTask',         (_e, id: number, patch) => updateTask(id, patch))
  ipcMain.handle('practice:deleteTask',         (_e, id: number) => deleteTask(id))

  // ── CA Practice: Dashboard ────────────────────────────
  ipcMain.handle('practice:dashboardCounts', () => getDashboardCounts())

  createWindow()
})

app.on('window-all-closed', () => {
  stopWhatsAppServer()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopWhatsAppServer()
})

process.on('uncaughtException', (err) => {
  console.error('[main] Uncaught exception:', err)
})
process.on('unhandledRejection', (err) => {
  console.error('[main] Unhandled rejection:', err)
})
