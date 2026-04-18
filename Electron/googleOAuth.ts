import http from 'http'
import { URL } from 'url'
import { shell } from 'electron'
import { storeGet, storeSet, storeDelete } from './store'
import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  GOOGLE_SCOPES,
} from './googleConfig'

// ── Store keys ────────────────────────────────────────
const KEY_ACCESS  = 'google_access_token'
const KEY_REFRESH = 'google_refresh_token'
const KEY_EXPIRY  = 'google_token_expiry'   // Unix ms
const KEY_EMAIL   = 'google_user_email'

// ── Status types ──────────────────────────────────────
export type GoogleAuthStatus =
  | { connected: false }
  | { connected: true; email: string; expired: boolean }

// ── Token helpers ─────────────────────────────────────
export function getGoogleTokens(): {
  accessToken: string | null
  refreshToken: string | null
  expiry: number | null
} {
  return {
    accessToken:  storeGet(KEY_ACCESS),
    refreshToken: storeGet(KEY_REFRESH),
    expiry:       storeGet(KEY_EXPIRY) ? Number(storeGet(KEY_EXPIRY)) : null,
  }
}

export function getGoogleStatus(): GoogleAuthStatus {
  const { accessToken, expiry } = getGoogleTokens()
  const email = storeGet(KEY_EMAIL)
  if (!accessToken || !email) return { connected: false }
  const expired = expiry ? Date.now() > expiry - 60_000 : false
  return { connected: true, email, expired }
}

export function clearGoogleTokens() {
  storeDelete(KEY_ACCESS)
  storeDelete(KEY_REFRESH)
  storeDelete(KEY_EXPIRY)
  storeDelete(KEY_EMAIL)
}

// ── Token refresh ─────────────────────────────────────
export async function refreshAccessToken(): Promise<string> {
  const { refreshToken } = getGoogleTokens()
  if (!refreshToken) throw new Error('No refresh token — user must reconnect')

  const body = new URLSearchParams({
    client_id:     GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type:    'refresh_token',
  })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  const json = await res.json() as any
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description ?? json.error ?? 'Token refresh failed')
  }

  const expiry = Date.now() + (json.expires_in ?? 3600) * 1000
  storeSet(KEY_ACCESS, json.access_token)
  storeSet(KEY_EXPIRY, String(expiry))

  console.log('[google-oauth] Access token refreshed')
  return json.access_token
}

// ── Get a valid access token (refresh if needed) ──────
export async function getValidAccessToken(): Promise<string> {
  const { accessToken, expiry } = getGoogleTokens()
  if (accessToken && expiry && Date.now() < expiry - 60_000) {
    return accessToken
  }
  return refreshAccessToken()
}

// ── Full OAuth flow ───────────────────────────────────
let activeServer: http.Server | null = null

export async function startGoogleOAuth(): Promise<{ email: string }> {
  // Only one flow at a time
  if (activeServer) {
    activeServer.close()
    activeServer = null
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('OAuth timed out — no response within 5 minutes'))
    }, 5 * 60 * 1000)

    function cleanup() {
      clearTimeout(timeout)
      if (activeServer) { activeServer.close(); activeServer = null }
    }

    // ── 1. Spin up local callback server ──────────────
    activeServer = http.createServer(async (req, res) => {
      if (!req.url?.startsWith('/oauth/callback')) {
        res.writeHead(404); res.end(); return
      }

      const params = new URL(req.url, GOOGLE_REDIRECT_URI).searchParams
      const code  = params.get('code')
      const error = params.get('error')

      if (error || !code) {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(html('❌ Authorization denied', 'You can close this tab and try again.'))
        cleanup()
        reject(new Error(error ?? 'No code returned'))
        return
      }

      try {
        // ── 2. Exchange code for tokens ─────────────
        const body = new URLSearchParams({
          code,
          client_id:     GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri:  GOOGLE_REDIRECT_URI,
          grant_type:    'authorization_code',
        })

        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        })

        const tokens = await tokenRes.json() as any
        if (!tokenRes.ok || !tokens.access_token) {
          throw new Error(tokens.error_description ?? 'Token exchange failed')
        }

        // ── 3. Fetch user email ───────────────────
        const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        })
        const profile = await profileRes.json() as any

        // ── 4. Persist tokens ─────────────────────
        const expiry = Date.now() + (tokens.expires_in ?? 3600) * 1000
        storeSet(KEY_ACCESS,  tokens.access_token)
        storeSet(KEY_EXPIRY,  String(expiry))
        storeSet(KEY_EMAIL,   profile.email ?? 'unknown@gmail.com')
        if (tokens.refresh_token) storeSet(KEY_REFRESH, tokens.refresh_token)

        console.log(`[google-oauth] Connected as ${profile.email}`)

        // ── 5. Success page in browser ────────────
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(html(
          '✅ Connected to Google Workspace',
          `Signed in as <strong>${profile.email}</strong>.<br>You can close this tab and go back to DigiMon.`
        ))

        cleanup()
        resolve({ email: profile.email })
      } catch (err: any) {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(html('❌ Connection failed', err.message))
        cleanup()
        reject(err)
      }
    })

    const port = 42813
    activeServer.listen(port, '127.0.0.1', () => {
      // ── 6. Open browser to Google's consent screen ─
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      authUrl.searchParams.set('client_id',     GOOGLE_CLIENT_ID)
      authUrl.searchParams.set('redirect_uri',  GOOGLE_REDIRECT_URI)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('scope',         GOOGLE_SCOPES)
      authUrl.searchParams.set('access_type',   'offline')      // needed for refresh token
      authUrl.searchParams.set('prompt',        'consent')      // force refresh token issue
      shell.openExternal(authUrl.toString())
      console.log('[google-oauth] Browser opened for consent')
    })

    activeServer.on('error', (err) => {
      cleanup()
      reject(new Error(`OAuth server error: ${err.message}`))
    })
  })
}

export function cancelGoogleOAuth() {
  if (activeServer) {
    activeServer.close()
    activeServer = null
    console.log('[google-oauth] Flow cancelled')
  }
}

// ── Minimal success/error HTML page ──────────────────
function html(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${title}</title>
<style>
  body { font-family: -apple-system, sans-serif; display: flex; align-items: center;
         justify-content: center; height: 100vh; margin: 0; background: #f0f4ff; }
  .card { background: white; border-radius: 16px; padding: 40px 48px; text-align: center;
          box-shadow: 0 4px 24px rgba(0,0,0,0.1); max-width: 400px; }
  h1 { font-size: 22px; margin-bottom: 12px; }
  p  { color: #555; line-height: 1.6; }
</style></head><body>
<div class="card"><h1>${title}</h1><p>${body}</p></div>
</body></html>`
}
