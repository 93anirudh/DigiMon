export interface McpEnvVar {
  key: string
  label: string
  hint: string
  secret: boolean
}

export interface McpCatalogEntry {
  id: string
  name: string
  tagline: string
  description: string
  example: string
  category: string
  icon: string
  logoUrl?: string
  requiresAuth?: boolean            // if true — shows OAuth Connect button instead of env var form
  command: string
  args: string[]
  envVars: McpEnvVar[]
  setupSteps: string[]
  docsUrl: string
  warning?: string
}

export const MCP_CATALOG: McpCatalogEntry[] = [
  {
    id: 'google-workspace',
    name: 'Google Workspace',
    tagline: 'Gmail, Drive, Docs, Sheets, and Calendar — one click, no setup.',
    description: 'Sign in with your Google account. DigiMon can then search emails, read Drive files, edit Sheets, and check Calendar — all through your account with full privacy.',
    example: 'Try: "Find all emails from Mehta & Sons this month about GST and summarise the next steps."',
    category: 'Productivity',
    icon: '🟦',
    logoUrl: 'https://img.icons8.com/color/96/google-logo.png',
    requiresAuth: true,               // triggers Google OAuth flow in the UI
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-gdrive'],
    envVars: [],                      // no manual entry needed — OAuth handles it
    setupSteps: ['Click Connect and sign in with your Google account.'],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/gdrive',
  },
  {
    id: 'memory',
    name: 'Long-Term Memory',
    tagline: 'Remembers things you tell it to, across every chat.',
    description: 'Without this, each new chat starts blank. With this, DigiMon can remember your client list, firm name, recurring filings, preferences — anything you ask it to keep in mind. Say "remember that..." and it sticks. Say "what do you remember about X" to recall.',
    example: 'Try: "Remember that Mehta & Sons is my biggest client — they file GSTR-3B monthly and GSTR-1 quarterly, due dates are the 11th and 13th."',
    category: 'AI Enhancement',
    icon: '🧠',
    logoUrl: 'https://img.icons8.com/fluency/96/brain.png',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    envVars: [],
    setupSteps: [
      'No setup needed — just click Connect.',
      'Memory persists across all your chats, stored locally on your machine.',
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
  },
  {
    id: 'excel-csv',
    name: 'Excel & CSV',
    tagline: 'Open, read, and analyse Excel and CSV files.',
    description: 'Point DigiMon at a Tally export, a GST reconciliation sheet, or any .xlsx / .csv file. It will read the data and answer questions about it.',
    example: 'Try: "Open C:\\Users\\me\\Downloads\\tally_export.xlsx and show me the top 5 expense heads by amount."',
    category: 'Local Tools',
    icon: '📈',
    logoUrl: 'https://img.icons8.com/color/96/microsoft-excel-2019.png',
    command: 'npx',
    args: ['-y', 'excel-mcp-server'],
    envVars: [],
    setupSteps: [
      'No setup needed — just click Connect.',
    ],
    docsUrl: 'https://github.com/haris-musa/excel-mcp-server',
  },
  {
    id: 'pdf-reader',
    name: 'PDF Reader',
    tagline: 'Reads text out of any PDF on your computer.',
    description: 'Drop in an ITR PDF, a notice from the Income Tax Department, an audit report, a Form 16. DigiMon extracts the text and can answer questions about it.',
    example: 'Try: "Read C:\\Users\\me\\Downloads\\notice.pdf and tell me what action is required and the deadline."',
    category: 'Local Tools',
    icon: '📄',
    logoUrl: 'https://img.icons8.com/color/96/pdf.png',
    command: 'npx',
    args: ['-y', 'pdf-reader-mcp'],
    envVars: [],
    setupSteps: [
      'No setup needed — just click Connect.',
    ],
    docsUrl: 'https://github.com/sylphlab/pdf-reader-mcp',
  },
  {
    id: 'fetch',
    name: 'Web Reader',
    tagline: 'Lets DigiMon read any webpage you point it to.',
    description: 'Pull the latest CBIC circular, read an ICAI notification, check an MCA update, or read a client\'s website. DigiMon fetches the page and summarises it for you.',
    example: 'Try: "Read https://www.cbic.gov.in/entities/gst-notifications and tell me anything new from this month."',
    category: 'Web & Search',
    icon: '🌐',
    logoUrl: 'https://img.icons8.com/fluency/96/internet.png',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
    envVars: [],
    setupSteps: [
      'No setup needed — just click Connect.',
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch',
  },
]

export const CATEGORIES = [
  { id: 'all',            label: 'All',           icon: '✦' },
  { id: 'Productivity',   label: 'Productivity',  icon: '📋' },
  { id: 'AI Enhancement', label: 'AI Tools',      icon: '🧠' },
  { id: 'Local Tools',    label: 'Local Files',   icon: '📁' },
  { id: 'Web & Search',   label: 'Web',           icon: '🌐' },
]
