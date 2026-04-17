import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import http from 'http'

// ── Constants ─────────────────────────────────────────
const API_PORT = 3017 // avoid common collisions (3000, 3001, 8080)
const API_BASE = `http://localhost:${API_PORT}/api`

// Where wweb-mcp persists the WhatsApp session (so re-auth isn't needed every launch)
const AUTH_DATA_DIR = path.join(app.getPath('userData'), 'whatsapp-session')

// File where we cache the auto-generated API key after the first spawn
const API_KEY_FILE = path.join(AUTH_DATA_DIR, 'api-key.txt')

// ── State ─────────────────────────────────────────────
let wwebProcess: ChildProcess | null = null
let apiKey: string | null = null
let serverReady = false
let lastQrDataUrl: string | null = null  // data: URL of the last QR code seen
let authStatus: 'disconnected' | 'awaiting_qr' | 'authenticated' | 'error' = 'disconnected'
let lastError: string | null = null

export interface WhatsAppStatus {
  status: 'disconnected' | 'awaiting_qr' | 'authenticated' | 'error'
  qrDataUrl: string | null
  error: string | null
  serverRunning: boolean
}

export function getStatus(): WhatsAppStatus {
  return {
    status: authStatus,
    qrDataUrl: lastQrDataUrl,
    error: lastError,
    serverRunning: !!wwebProcess && !wwebProcess.killed,
  }
}

// ── Start the wweb-mcp API server ─────────────────────
// Spawns `npx wweb-mcp --mode whatsapp-api --api-port N --auth-data-path DIR`
// Watches stdout for:
//   - "WhatsApp API key: <key>" (captures API key on first run)
//   - "QR Code:" block (captures QR for display)
//   - "Client is ready!" (marks authenticated)
export function startServer(): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    if (wwebProcess && !wwebProcess.killed) {
      console.log('[whatsapp] Server already running')
      resolve({ ok: true })
      return
    }

    // Ensure auth dir exists
    try { fs.mkdirSync(AUTH_DATA_DIR, { recursive: true }) } catch {}

    // Try to load cached API key so we can re-auth to the same server on restart
    if (fs.existsSync(API_KEY_FILE)) {
      try { apiKey = fs.readFileSync(API_KEY_FILE, 'utf-8').trim() } catch {}
    }

    console.log(`[whatsapp] Starting wweb-mcp API server on port ${API_PORT}…`)
    lastError = null
    authStatus = 'disconnected'
    lastQrDataUrl = null
    serverReady = false

    const args = [
      '-y', 'wweb-mcp',
      '--mode', 'whatsapp-api',
      '--api-port', String(API_PORT),
      '--auth-data-path', AUTH_DATA_DIR,
      '--auth-strategy', 'local',
    ]

    // On Windows npx.cmd; on mac/linux npx
    const isWin = process.platform === 'win32'
    const cmd = isWin ? 'npx.cmd' : 'npx'

    try {
      wwebProcess = spawn(cmd, args, {
        shell: isWin,
        windowsHide: true,
        env: { ...process.env },
      })
    } catch (err: any) {
      lastError = `Failed to spawn: ${err.message}`
      authStatus = 'error'
      resolve({ ok: false, error: lastError })
      return
    }

    let resolved = false
    const readyTimeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        lastError = 'Server did not become ready within 60s'
        authStatus = 'error'
        resolve({ ok: false, error: lastError })
      }
    }, 60000)

    const parseOutput = (text: string) => {
      // Log raw output for debugging
      process.stdout.write(`[wweb] ${text}`)

      // Catch auto-generated API key
      const keyMatch = text.match(/WhatsApp API key[:\s]+([a-f0-9]{32,})/i)
      if (keyMatch) {
        apiKey = keyMatch[1]
        try { fs.writeFileSync(API_KEY_FILE, apiKey) } catch {}
        console.log('[whatsapp] API key captured and cached')
      }

      // Server marks itself ready — resolve the spawn promise
      if (!serverReady && (text.includes('Server running') || text.includes('listening on'))) {
        serverReady = true
        clearTimeout(readyTimeout)
        if (!resolved) {
          resolved = true
          resolve({ ok: true })
        }
      }

      // Detect QR in the output (wweb-mcp prints it as ASCII art + data URL)
      // Easiest path: poll the API's /status endpoint once server is up
      if (text.toLowerCase().includes('scan the qr code')) {
        authStatus = 'awaiting_qr'
      }

      if (text.includes('Client is ready') || text.includes('authenticated')) {
        authStatus = 'authenticated'
        lastQrDataUrl = null
      }
    }

    wwebProcess.stdout?.on('data', (data: Buffer) => parseOutput(data.toString()))
    wwebProcess.stderr?.on('data', (data: Buffer) => parseOutput(data.toString()))

    wwebProcess.on('error', (err: any) => {
      console.error('[whatsapp] Process error:', err.message)
      lastError = err.message
      authStatus = 'error'
      if (!resolved) {
        resolved = true
        resolve({ ok: false, error: err.message })
      }
    })

    wwebProcess.on('exit', (code) => {
      console.log(`[whatsapp] Server exited with code ${code}`)
      wwebProcess = null
      serverReady = false
      if (authStatus !== 'authenticated') authStatus = 'disconnected'
    })
  })
}

// ── Stop the server ───────────────────────────────────
export function stopServer(): void {
  if (wwebProcess && !wwebProcess.killed) {
    console.log('[whatsapp] Stopping server…')
    try {
      wwebProcess.kill()
    } catch (err: any) {
      console.warn('[whatsapp] Kill error:', err.message)
    }
    wwebProcess = null
    serverReady = false
    authStatus = 'disconnected'
    lastQrDataUrl = null
  }
}

// ── Talk to the HTTP API ──────────────────────────────
function apiRequest(method: string, pathname: string, body?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : undefined
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (apiKey) headers['x-api-key'] = apiKey
    if (bodyStr) headers['Content-Length'] = String(Buffer.byteLength(bodyStr))

    const req = http.request({
      host: 'localhost',
      port: API_PORT,
      path: `/api${pathname}`,
      method,
      headers,
      timeout: 10000,
    }, (res) => {
      let chunks = ''
      res.on('data', (c: Buffer) => { chunks += c.toString() })
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${chunks.slice(0, 200)}`))
          return
        }
        try { resolve(chunks ? JSON.parse(chunks) : {}) }
        catch { resolve({ raw: chunks }) }
      })
    })

    req.on('error', reject)
    req.on('timeout', () => { req.destroy(new Error('Request timed out')) })
    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

// ── Poll the server for QR + auth status ─────────────
// Called by the UI every ~2s while the QR modal is open.
// Returns the freshest info known to this process.
export async function pollStatus(): Promise<WhatsAppStatus> {
  if (!serverReady) return getStatus()

  // Try to fetch current QR and auth status from the API
  try {
    const [qrRes, statusRes] = await Promise.allSettled([
      apiRequest('GET', '/qr'),
      apiRequest('GET', '/status'),
    ])

    if (statusRes.status === 'fulfilled') {
      const s = statusRes.value
      if (s?.status === 'authenticated' || s?.authenticated === true) {
        authStatus = 'authenticated'
        lastQrDataUrl = null
      } else if (s?.status === 'qr' || s?.qr || authStatus === 'awaiting_qr') {
        authStatus = 'awaiting_qr'
      }
    }

    if (qrRes.status === 'fulfilled' && authStatus !== 'authenticated') {
      const q = qrRes.value
      // wweb-mcp returns either {qr: "..."} (raw string) or {qrCode: "data:..."} (data URL)
      const qr = q?.qrCode ?? q?.qr_code ?? q?.qr
      if (qr) {
        lastQrDataUrl = typeof qr === 'string' && qr.startsWith('data:')
          ? qr
          : `data:image/png;base64,${Buffer.from(qr).toString('base64')}` // best effort
        authStatus = 'awaiting_qr'
      }
    }
  } catch (err: any) {
    // Not an error — the server just might not have these endpoints yet
    console.log('[whatsapp] Poll: server not fully ready yet')
  }

  return getStatus()
}

// ── Send a message (used by the MCP adapter) ─────────
export async function sendMessage(to: string, text: string): Promise<any> {
  if (authStatus !== 'authenticated') {
    throw new Error('WhatsApp is not authenticated. Open Settings → Integrations → WhatsApp to scan the QR.')
  }
  return apiRequest('POST', '/send', { to, message: text })
}

// ── Logout (forget the session — user will need to scan QR again) ──
export async function logout(): Promise<void> {
  stopServer()
  try {
    if (fs.existsSync(AUTH_DATA_DIR)) {
      fs.rmSync(AUTH_DATA_DIR, { recursive: true, force: true })
    }
  } catch (err: any) {
    console.warn('[whatsapp] Logout cleanup error:', err.message)
  }
  apiKey = null
  lastQrDataUrl = null
  authStatus = 'disconnected'
}
