export interface McpEnvVar {
  key: string
  label: string
  hint: string
  secret: boolean
}

export interface McpCatalogEntry {
  id: string
  name: string
  tagline: string         // 1-line plain-English value prop
  description: string     // what it does, for non-technical users
  example: string         // concrete example of what to ask
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
    id: 'sequential-thinking',
    name: 'Step-by-Step Thinking',
    tagline: 'Helps the AI break big problems into smaller steps.',
    description: 'Turns on a structured reasoning mode. Useful for tax computations, audit planning, and any question where the answer has multiple moving parts.',
    example: 'Try: "Walk me step by step through computing capital gains for a listed share sold in March 2025."',
    category: 'AI Enhancement',
    icon: '🧠',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    envVars: [],
    setupSteps: [
      'No setup needed — just click Enable.',
      'Installs automatically the first time DigiMon uses it.',
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking',
  },
  {
    id: 'memory',
    name: 'Long-Term Memory',
    tagline: 'Remembers things across different chats.',
    description: 'Without this, each new chat is a blank slate. With this, DigiMon can remember your client list, your preferred formatting, your firm\'s name, recurring clients — anything you tell it to keep in mind.',
    example: 'Try: "Remember that Mehta & Sons is my biggest client, GST returns due on the 11th each month."',
    category: 'AI Enhancement',
    icon: '💾',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    envVars: [],
    setupSteps: [
      'No setup needed — just click Enable.',
      'DigiMon will quietly store facts you ask it to remember.',
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
  },
  {
    id: 'fetch',
    name: 'Web Reader',
    tagline: 'Lets DigiMon read any webpage you point it to.',
    description: 'Pull the latest CBIC circular, read an ICAI notification, check an MCA update, or read a client\'s website. DigiMon fetches the page and summarises it for you.',
    example: 'Try: "Read https://www.cbic.gov.in/entities/gst-notifications and tell me anything new from this month."',
    category: 'Web & Search',
    icon: '🌐',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
    envVars: [],
    setupSteps: [
      'No setup needed — just click Enable.',
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch',
  },
  {
    id: 'puppeteer',
    name: 'Auto-Browser',
    tagline: 'DigiMon can open a real Chrome window and fill forms for you.',
    description: 'Useful for GST portal logins, downloading GSTR-2B, taking screenshots of filed returns, or any website task you\'d normally do by hand. DigiMon drives Chrome while you watch.',
    example: 'Try: "Open the GST portal, log in with my credentials, and download GSTR-2B for March 2025."',
    category: 'Automation',
    icon: '🤖',
    logoUrl: 'https://pptr.dev/img/puppeteer.png',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    envVars: [],
    setupSteps: [
      'You need Google Chrome installed on this machine.',
      'Click Enable — the browser automation library installs automatically.',
    ],
    docsUrl: 'https://pptr.dev',
    warning: 'Needs Google Chrome installed. DigiMon will always ask before doing anything destructive.',
  },
  {
    id: 'notion',
    name: 'Notion',
    tagline: 'Read and write your Notion pages and databases.',
    description: 'If you use Notion for client tracking, compliance calendars, or internal SOPs, DigiMon can read from and add to your pages directly.',
    example: 'Try: "Add a new row to my Compliance Tracker database: Sharma & Co, GSTR-3B, due 20th April, status pending."',
    category: 'Productivity',
    icon: '📝',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/45/Notion_app_logo.png',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-notion'],
    envVars: [
      {
        key: 'NOTION_API_KEY',
        label: 'Notion Integration Token',
        hint: 'notion.so/my-integrations → New Integration → copy the token',
        secret: true,
      },
    ],
    setupSteps: [
      'Go to notion.so/my-integrations → click "New integration" → name it DigiMon.',
      'Copy the "Internal Integration Token" and paste it below.',
      'In Notion: open each page/database you want DigiMon to access → Share → Invite your integration.',
      'Click Enable.',
    ],
    docsUrl: 'https://developers.notion.com/docs/getting-started',
  },
  {
    id: 'google-workspace',
    name: 'Google Workspace',
    tagline: 'Gmail, Drive, Docs, Sheets, and Calendar in one connection.',
    description: 'The most useful integration for a CA firm. Search emails, read Drive files, edit a shared Sheet, schedule client calls — DigiMon can touch all of it.',
    example: 'Try: "Find all emails from Mehta & Sons this month about GST, and draft a reply summarising the next steps."',
    category: 'Productivity',
    icon: '📀',
    logoUrl: 'https://lh3.googleusercontent.com/JQMBtQV_0sNnAOiJXBGCFl9MnblZ58OwKkFOGE28s8FmB3Mns6FnNbFcUAp4yGwMm0XQZZ-e0tktjm2qjEXb2Pg=s120',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-gdrive'],
    envVars: [
      {
        key: 'GDRIVE_CREDENTIALS_PATH',
        label: 'Google OAuth Credentials File Path',
        hint: 'Full path to the credentials.json you download from Google Cloud',
        secret: false,
      },
    ],
    setupSteps: [
      'Go to console.cloud.google.com → create a new project (any name works).',
      'Enable these APIs: Gmail, Drive, Docs, Sheets, Calendar.',
      'APIs & Services → Credentials → Create OAuth 2.0 Client ID (pick "Desktop App").',
      'Download the JSON file Google gives you. Save it somewhere you can find.',
      'Paste the full path to that JSON file below.',
      'On first use a browser opens asking you to log in — that\'s normal.',
    ],
    docsUrl: 'https://developers.google.com/workspace',
    warning: 'Needs a Google Cloud project. All Google APIs stay within their free quota for normal CA-firm use.',
  },
  {
    id: 'excel-csv',
    name: 'Excel & CSV',
    tagline: 'Open, read, and analyse Excel and CSV files.',
    description: 'Point DigiMon at a Tally export, a GST reconciliation sheet, or any .xlsx/.csv file. It will read the data and answer questions about it.',
    example: 'Try: "Open C:\\Users\\me\\Downloads\\tally_export.xlsx and show me the top 5 expense heads by amount."',
    category: 'Local Tools',
    icon: '📈',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/Microsoft_Office_Excel_%282019%E2%80%93present%29.svg/512px-Microsoft_Office_Excel_%282019%E2%80%93present%29.svg.png',
    command: 'npx',
    args: ['-y', 'excel-mcp-server'],
    envVars: [],
    setupSteps: [
      'No setup needed — just click Enable.',
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
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/PDF_file_icon.svg/391px-PDF_file_icon.svg.png',
    command: 'npx',
    args: ['-y', 'pdf-reader-mcp'],
    envVars: [],
    setupSteps: [
      'No setup needed — just click Enable.',
    ],
    docsUrl: 'https://github.com/sylphlab/pdf-reader-mcp',
  },
  {
    id: 'ocr',
    name: 'OCR Scanner',
    tagline: 'Reads text out of scanned images and photo-PDFs.',
    description: 'For scanned invoices, handwritten ledger photos, old paper notices that were scanned to PDF. If the document is a picture rather than real text, this turns it into text DigiMon can read.',
    example: 'Try: "Extract the text from this scanned invoice and give me the total amount and GSTIN."',
    category: 'Local Tools',
    icon: '🔍',
    command: 'npx',
    args: ['-y', 'ocr-mcp-server'],
    envVars: [
      {
        key: 'OCR_API_KEY',
        label: 'OCR.space API Key',
        hint: 'Free at ocr.space/ocrapi — 25,000 scans/month on free tier, enough for most firms',
        secret: true,
      },
    ],
    setupSteps: [
      'Go to ocr.space/ocrapi and sign up for a free key.',
      'Paste the key below and click Enable.',
    ],
    docsUrl: 'https://ocr.space/ocrapi',
  },
  {
    id: 'mermaid',
    name: 'Diagram Export',
    tagline: 'Save flowcharts and diagrams DigiMon draws as PNG or SVG files.',
    description: 'DigiMon already draws diagrams directly in chat for you. This integration adds the ability to export them as image files you can drop into a Word doc or email.',
    example: 'Try: "Draw a flowchart of the GSTR-3B filing process, then save it as a PNG on my desktop."',
    category: 'Visualization',
    icon: '🔀',
    logoUrl: 'https://mermaid.js.org/img/favicon.png',
    command: 'npx',
    args: ['-y', 'mermaid-mcp-server'],
    envVars: [],
    setupSteps: [
      'No setup needed — just click Enable.',
      'Basic diagram rendering already works in chat without this. This just adds file export.',
    ],
    docsUrl: 'https://mermaid.js.org',
  },
]

export const CATEGORIES = [
  { id: 'all',            label: 'All',            icon: '✦' },
  { id: 'AI Enhancement', label: 'AI Tools',       icon: '🧠' },
  { id: 'Local Tools',    label: 'Local Files',    icon: '📁' },
  { id: 'Productivity',   label: 'Productivity',   icon: '📋' },
  { id: 'Automation',     label: 'Automation',     icon: '🤖' },
  { id: 'Web & Search',   label: 'Web',            icon: '🌐' },
  { id: 'Visualization',  label: 'Charts',         icon: '📊' },
]
