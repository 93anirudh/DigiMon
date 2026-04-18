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
    tagline: 'Gmail, Drive, Docs, Sheets, and Calendar — all in one connection.',
    description: 'The most useful integration for a CA firm. Search emails, read Drive files, edit a shared Sheet, schedule client calls — DigiMon can touch all of it through your Google account.',
    example: 'Try: "Find all emails from Mehta & Sons this month about GST, and draft a reply summarising the next steps."',
    category: 'Productivity',
    icon: '📀',
    logoUrl: 'https://img.icons8.com/color/96/google-logo.png',
    command: 'uvx',
    args: ['workspace-mcp'],
    envVars: [
      {
        key: 'GOOGLE_OAUTH_CLIENT_ID',
        label: 'Google OAuth Client ID',
        hint: 'From Google Cloud Console → Credentials → OAuth 2.0 Client ID',
        secret: false,
      },
      {
        key: 'GOOGLE_OAUTH_CLIENT_SECRET',
        label: 'Google OAuth Client Secret',
        hint: 'From the same OAuth 2.0 Client ID page',
        secret: true,
      },
    ],
    setupSteps: [
      'Go to console.cloud.google.com → create a new project (any name works).',
      'Enable these APIs: Gmail, Drive, Docs, Sheets, Calendar.',
      'APIs & Services → Credentials → Create OAuth 2.0 Client ID ("Desktop App").',
      'Copy the Client ID and Client Secret into the fields below.',
      'On first use a browser opens asking you to sign in — that\'s normal.',
    ],
    docsUrl: 'https://github.com/taylorwilsdon/google_workspace_mcp',
    warning: 'Requires a Google Cloud project. All Google APIs stay within their free quota for normal CA-firm use.',
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
  { id: 'all',            label: 'All',            icon: '✦' },
  { id: 'Productivity',   label: 'Productivity',   icon: '📋' },
  { id: 'Local Tools',    label: 'Local Files',    icon: '📁' },
  { id: 'Web & Search',   label: 'Web',            icon: '🌐' },
]
