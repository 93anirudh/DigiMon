/**
 * Native Google Workspace tools.
 *
 * These call Google's REST APIs directly using the OAuth access token
 * we already have from googleOAuth.ts. No MCP subprocess, no npx, no
 * Python — fully owned, fully debuggable, works on any Windows machine.
 *
 * Token refresh is handled transparently by getValidAccessToken().
 */
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { getValidAccessToken, getGoogleStatus } from './googleOAuth'

// ── Tiny helper — call a Google REST endpoint with auth ──────────────
async function googleFetch(
  url: string,
  init: RequestInit = {}
): Promise<any> {
  const token = await getValidAccessToken()
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  })

  const text = await res.text()
  if (!res.ok) {
    // Surface a short readable error rather than a JSON dump
    let msg = text
    try {
      const parsed = JSON.parse(text)
      msg = parsed?.error?.message ?? parsed?.error_description ?? text
    } catch {}
    throw new Error(`Google API ${res.status}: ${msg.slice(0, 300)}`)
  }

  if (!text) return {}
  try { return JSON.parse(text) } catch { return { raw: text } }
}

// ── Gmail — search messages by query ─────────────────────────────────
const gmailSearchTool = tool(
  async ({ query, maxResults }: { query: string; maxResults?: number }) => {
    const limit = Math.min(Math.max(maxResults ?? 10, 1), 25)
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${limit}&q=${encodeURIComponent(query)}`
    const list = await googleFetch(url)
    const ids = (list.messages ?? []).map((m: any) => m.id).slice(0, limit)

    if (ids.length === 0) return 'No matching emails found.'

    // Batch-fetch headers + snippet for each
    const results = await Promise.all(
      ids.map(async (id: string) => {
        const msg = await googleFetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`
        )
        const headers = msg.payload?.headers ?? []
        const get = (name: string) => headers.find((h: any) => h.name === name)?.value ?? ''
        return {
          id,
          from:    get('From'),
          subject: get('Subject'),
          date:    get('Date'),
          snippet: msg.snippet ?? '',
        }
      })
    )

    return JSON.stringify(results, null, 2)
  },
  {
    name: 'gmail_search',
    description:
      'Search the user\'s Gmail inbox. Returns list of matching emails with sender, subject, date, and a short snippet. Use Gmail search syntax in the query (e.g. "from:client@domain.com newer_than:7d", "subject:invoice", "has:attachment is:unread").',
    schema: z.object({
      query: z.string().describe('Gmail search query (supports Gmail search operators)'),
      maxResults: z.number().optional().describe('Max emails to return (default 10, max 25)'),
    }),
  }
)

// ── Gmail — read a full message by ID ────────────────────────────────
const gmailReadTool = tool(
  async ({ messageId }: { messageId: string }) => {
    const msg = await googleFetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`
    )

    const headers = msg.payload?.headers ?? []
    const get = (name: string) => headers.find((h: any) => h.name === name)?.value ?? ''

    // Walk payload to find the plain-text body
    const body = extractGmailBody(msg.payload)

    return JSON.stringify({
      from:    get('From'),
      to:      get('To'),
      subject: get('Subject'),
      date:    get('Date'),
      body:    body.slice(0, 8000),   // cap so we don't blow token budget
      truncated: body.length > 8000,
    }, null, 2)
  },
  {
    name: 'gmail_read',
    description:
      'Read the full content of a specific email by its message ID. Use the ID returned from gmail_search. Returns sender, recipient, subject, date, and email body (trimmed to 8000 chars).',
    schema: z.object({
      messageId: z.string().describe('Gmail message ID (from gmail_search results)'),
    }),
  }
)

function extractGmailBody(payload: any): string {
  if (!payload) return ''
  // Prefer text/plain; fall back to text/html stripped
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64Url(payload.body.data)
  }
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return stripHtml(decodeBase64Url(payload.body.data))
  }
  for (const part of payload.parts ?? []) {
    const found = extractGmailBody(part)
    if (found) return found
  }
  return ''
}

function decodeBase64Url(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/')
  try { return Buffer.from(b64, 'base64').toString('utf-8') } catch { return '' }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Drive — list / search files ──────────────────────────────────────
const driveListTool = tool(
  async ({ query, maxResults }: { query?: string; maxResults?: number }) => {
    const limit = Math.min(Math.max(maxResults ?? 15, 1), 50)
    const q = query?.trim()
      ? `name contains '${query.replace(/'/g, "\\'")}' and trashed=false`
      : 'trashed=false'

    const url = `https://www.googleapis.com/drive/v3/files?pageSize=${limit}&orderBy=modifiedTime desc&q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,modifiedTime,size,owners(displayName),webViewLink)`
    const data = await googleFetch(url)

    const files = (data.files ?? []).map((f: any) => ({
      id:       f.id,
      name:     f.name,
      type:     humanMime(f.mimeType),
      modified: f.modifiedTime,
      owner:    f.owners?.[0]?.displayName ?? '',
      link:     f.webViewLink,
    }))

    return files.length > 0
      ? JSON.stringify(files, null, 2)
      : `No files found${query ? ` matching "${query}"` : ''}.`
  },
  {
    name: 'drive_list',
    description:
      'List files in the user\'s Google Drive. Optional query filters by filename (case-insensitive contains). Results sorted by most recently modified. Returns file id, name, type, modified date, owner, and link.',
    schema: z.object({
      query: z.string().optional().describe('Optional filename search term'),
      maxResults: z.number().optional().describe('Max files to return (default 15, max 50)'),
    }),
  }
)

// ── Drive — read a file's contents (Docs, Sheets, plain text) ───────
const driveReadTool = tool(
  async ({ fileId }: { fileId: string }) => {
    // Get metadata first so we know the type
    const meta = await googleFetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType`
    )

    const mimeType = meta.mimeType as string
    let text = ''

    if (mimeType === 'application/vnd.google-apps.document') {
      // Export Doc as plain text
      text = await googleFetchText(
        `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`
      )
    } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      // Use Sheets API for a Sheet — more readable than raw CSV export
      const sheet = await googleFetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${fileId}?includeGridData=false`
      )
      const tabNames = (sheet.sheets ?? []).map((s: any) => s.properties?.title).filter(Boolean)
      return JSON.stringify({
        name: meta.name,
        type: 'Google Sheet',
        tabs: tabNames,
        hint: `Use sheets_read with one of the tab names to read actual cell data.`,
      }, null, 2)
    } else if (mimeType?.startsWith('text/') || mimeType === 'application/json') {
      // Plain text / JSON — download directly
      text = await googleFetchText(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
      )
    } else if (mimeType === 'application/vnd.google-apps.presentation') {
      text = await googleFetchText(
        `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`
      )
    } else {
      return `File "${meta.name}" is of type "${mimeType}" and can't be read as text. It might be a PDF, image, or binary file.`
    }

    return JSON.stringify({
      name: meta.name,
      type: humanMime(mimeType),
      content: text.slice(0, 10000),
      truncated: text.length > 10000,
    }, null, 2)
  },
  {
    name: 'drive_read_file',
    description:
      'Read the contents of a Google Drive file (Google Doc, Sheet, Slide, or plain text). Use the file ID from drive_list. For Sheets this returns the list of tabs — call sheets_read next to get actual cell data.',
    schema: z.object({
      fileId: z.string().describe('Google Drive file ID (from drive_list)'),
    }),
  }
)

// Sheets API requires the raw response for export endpoints
async function googleFetchText(url: string): Promise<string> {
  const token = await getValidAccessToken()
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Google API ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.text()
}

// ── Sheets — read cells from a tab ──────────────────────────────────
const sheetsReadTool = tool(
  async ({ fileId, tab, range }: { fileId: string; tab?: string; range?: string }) => {
    const a1 = tab
      ? (range ? `${tab}!${range}` : `${tab}`)
      : (range ?? 'A1:Z100')

    const data = await googleFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${fileId}/values/${encodeURIComponent(a1)}`
    )

    const values = data.values ?? []
    if (values.length === 0) return `No data in ${a1}.`

    // Format as a simple markdown table (model handles this nicely)
    const [header, ...rows] = values
    if (rows.length === 0) return JSON.stringify({ range: a1, rows: [header] }, null, 2)

    return JSON.stringify({
      range: a1,
      rowCount: rows.length,
      header,
      rows: rows.slice(0, 100),  // cap at 100 rows per call
      truncated: rows.length > 100,
    }, null, 2)
  },
  {
    name: 'sheets_read',
    description:
      'Read cells from a Google Sheet. Provide the file ID (from drive_list), an optional tab name, and an optional A1-notation range. Default range is A1:Z100. Returns up to 100 rows; for larger data call multiple times with different ranges.',
    schema: z.object({
      fileId: z.string().describe('Google Sheet file ID'),
      tab:    z.string().optional().describe('Tab/worksheet name (e.g. "Sheet1")'),
      range:  z.string().optional().describe('A1 range (e.g. "A1:D50"). Defaults to A1:Z100.'),
    }),
  }
)

// ── Calendar — list upcoming events ─────────────────────────────────
const calendarListTool = tool(
  async ({ days, maxResults }: { days?: number; maxResults?: number }) => {
    const daysAhead = Math.min(Math.max(days ?? 7, 1), 90)
    const limit = Math.min(Math.max(maxResults ?? 15, 1), 50)

    const now = new Date()
    const end = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000)

    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?`
      + `timeMin=${encodeURIComponent(now.toISOString())}`
      + `&timeMax=${encodeURIComponent(end.toISOString())}`
      + `&maxResults=${limit}`
      + `&orderBy=startTime&singleEvents=true`

    const data = await googleFetch(url)

    const events = (data.items ?? []).map((e: any) => ({
      title:    e.summary ?? '(no title)',
      start:    e.start?.dateTime ?? e.start?.date,
      end:      e.end?.dateTime   ?? e.end?.date,
      location: e.location ?? '',
      attendees: (e.attendees ?? []).map((a: any) => a.email).slice(0, 10),
      link:     e.htmlLink,
    }))

    return events.length > 0
      ? JSON.stringify(events, null, 2)
      : `No events in the next ${daysAhead} days.`
  },
  {
    name: 'calendar_list',
    description:
      'List upcoming events from the user\'s primary Google Calendar. Defaults to next 7 days. Returns title, start/end, location, attendees, and link for each event.',
    schema: z.object({
      days:       z.number().optional().describe('Days ahead to look (default 7, max 90)'),
      maxResults: z.number().optional().describe('Max events (default 15, max 50)'),
    }),
  }
)

// ── Helpers ─────────────────────────────────────────────────────────
function humanMime(mimeType: string): string {
  const map: Record<string, string> = {
    'application/vnd.google-apps.document':     'Google Doc',
    'application/vnd.google-apps.spreadsheet':  'Google Sheet',
    'application/vnd.google-apps.presentation': 'Google Slides',
    'application/vnd.google-apps.folder':       'Folder',
    'application/pdf':                          'PDF',
    'text/plain':                               'Text',
    'text/csv':                                 'CSV',
    'image/png':                                'PNG image',
    'image/jpeg':                               'JPEG image',
  }
  return map[mimeType] ?? mimeType
}

// ── Public API ──────────────────────────────────────────────────────
export const GOOGLE_TOOLS = [
  gmailSearchTool,
  gmailReadTool,
  driveListTool,
  driveReadTool,
  sheetsReadTool,
  calendarListTool,
]

export const GOOGLE_TOOL_MAP: Record<string, (args: any) => Promise<string>> = {
  gmail_search:    (a) => gmailSearchTool.invoke(a),
  gmail_read:      (a) => gmailReadTool.invoke(a),
  drive_list:      (a) => driveListTool.invoke(a),
  drive_read_file: (a) => driveReadTool.invoke(a),
  sheets_read:     (a) => sheetsReadTool.invoke(a),
  calendar_list:   (a) => calendarListTool.invoke(a),
}

/**
 * Returns Google tools IF the user is currently signed in.
 * Returns [] if not connected — agent loop won't see them.
 */
export function getGoogleToolsIfConnected(): any[] {
  const status = getGoogleStatus()
  return status.connected ? GOOGLE_TOOLS : []
}
