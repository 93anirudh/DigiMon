export interface McpEnvVar {
  key: string
  label: string
  hint: string
  secret: boolean
}

export interface McpCatalogEntry {
  id: string
  name: string
  description: string
  category: string
  icon: string           // emoji fallback
  logoUrl?: string       // real brand logo
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
    name: 'Sequential Thinking',
    description: 'Gives the AI structured step-by-step reasoning for complex multi-step tasks like tax computations and audit planning.',
    category: 'AI Enhancement',
    icon: '🧠',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    envVars: [],
    setupSteps: [
      'No API key or configuration required.',
      'Click Enable — installs automatically via npx on first use.',
      'The AI will now use structured chain-of-thought reasoning for complex questions.',
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking',
  },
  {
    id: 'memory',
    name: 'Persistent Memory',
    description: 'Gives the AI a long-term knowledge graph so it can remember client names, preferences, and context across sessions.',
    category: 'AI Enhancement',
    icon: '💾',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    envVars: [],
    setupSteps: [
      'No API key required.',
      'Click Enable — installs automatically.',
      'The AI will now remember important facts across separate chat sessions.',
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
  },
  {
    id: 'fetch',
    name: 'Web Fetch',
    description: 'Lets the AI fetch and read any public webpage — CBIC GST circulars, MCA notifications, ICAI updates, RBI guidelines.',
    category: 'Web & Search',
    icon: '🌐',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
    envVars: [],
    setupSteps: [
      'No API key required.',
      'Click Enable — installs automatically.',
      'Try: "Fetch the latest GST circular from cbic.gov.in"',
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch',
  },
  {
    id: 'filesystem',
    name: 'Local Filesystem',
    description: 'Browse, read, and write files on your local machine. Read client folders, Excel exports, PDF documents.',
    category: 'Local Tools',
    icon: '📁',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', 'C:\\Users'],
    envVars: [],
    setupSteps: [
      'No API key required.',
      'Click Enable — installs automatically.',
      'Default access: C:\\Users. Edit mcp_config.json to change the allowed directory.',
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer Browser',
    description: 'Controls a real Chrome browser — fill GST portal forms, MCA21, income tax portal. Takes screenshots.',
    category: 'Automation',
    icon: '🤖',
    logoUrl: 'https://pptr.dev/img/puppeteer.png',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    envVars: [],
    setupSteps: [
      'Requires Google Chrome installed on this machine.',
      'No API key needed.',
      'Click Enable — Puppeteer installs automatically.',
    ],
    docsUrl: 'https://pptr.dev',
    warning: 'Requires Google Chrome installed on this machine.',
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Read and write Notion pages and databases. Client onboarding checklists, compliance calendars, document management.',
    category: 'Productivity',
    icon: '📝',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/45/Notion_app_logo.png',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-notion'],
    envVars: [
      {
        key: 'NOTION_API_KEY',
        label: 'Notion Integration Token',
        hint: 'notion.so/my-integrations → New Integration → Copy the Internal Integration Token',
        secret: true,
      },
    ],
    setupSteps: [
      'Go to notion.so/my-integrations and click "New integration".',
      'Name it "Practice OS" and select your workspace.',
      'Copy the "Internal Integration Token" and paste below.',
      'In Notion: open each page/database → Share → Invite your integration.',
      'Click Enable.',
    ],
    docsUrl: 'https://developers.notion.com/docs/getting-started',
  },
  {
    id: 'airtable',
    name: 'Airtable',
    description: 'Read and write Airtable records. Client databases, compliance trackers, billing management.',
    category: 'Productivity',
    icon: '📊',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Airtable_Logo.svg/2560px-Airtable_Logo.svg.png',
    command: 'npx',
    args: ['-y', 'airtable-mcp-server'],
    envVars: [
      {
        key: 'AIRTABLE_PERSONAL_ACCESS_TOKEN',
        label: 'Airtable Personal Access Token',
        hint: 'airtable.com/create/tokens → Create token with data.records scopes',
        secret: true,
      },
    ],
    setupSteps: [
      'Go to airtable.com/create/tokens.',
      'Click "Create new token" and add scopes: data.records:read, data.records:write, schema.bases:read.',
      'Select which bases to allow access to.',
      'Copy and paste the token below.',
    ],
    docsUrl: 'https://airtable.com/developers/web/api/introduction',
  },
  {
    id: 'google-workspace',
    name: 'Google Workspace',
    description: 'Gmail, Drive, Docs, Sheets, Calendar, Forms. The most powerful integration for CA practice management.',
    category: 'Productivity',
    icon: '📀',
    logoUrl: 'https://lh3.googleusercontent.com/JQMBtQV_0sNnAOiJXBGCFl9MnblZ58OwKkFOGE28s8FmB3Mns6FnNbFcUAp4yGwMm0XQZZ-e0tktjm2qjEXb2Pg=s120',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-gdrive'],
    envVars: [
      {
        key: 'GDRIVE_CREDENTIALS_PATH',
        label: 'Google OAuth Credentials Path',
        hint: 'Full path to credentials.json from Google Cloud Console (e.g. C:\\Users\\93ani\\credentials.json)',
        secret: false,
      },
    ],
    setupSteps: [
      'Go to console.cloud.google.com → create a new project.',
      'Enable: Gmail API, Drive API, Docs API, Sheets API, Calendar API.',
      'Go to APIs & Services → Credentials → Create OAuth 2.0 Client ID (Desktop App).',
      'Download the JSON file and save it somewhere safe.',
      'Enter the full path to that JSON file below.',
      'On first use, a browser opens asking you to log in and grant permissions.',
    ],
    docsUrl: 'https://developers.google.com/workspace',
    warning: 'Requires a Google Cloud project. All APIs used are within free quota for typical CA firm usage.',
  },
  {
    id: 'excel-csv',
    name: 'Excel & CSV',
    description: 'Open, read, and analyze .xlsx, .xls, and .csv files. Essential for Tally exports, GST data, P&L statements.',
    category: 'Local Tools',
    icon: '📈',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/Microsoft_Office_Excel_%282019%E2%80%93present%29.svg/512px-Microsoft_Office_Excel_%282019%E2%80%93present%29.svg.png',
    command: 'npx',
    args: ['-y', 'excel-mcp-server'],
    envVars: [],
    setupSteps: [
      'No API key required.',
      'Click Enable — installs automatically.',
      'Try: "Read C:\\Users\\93ani\\Documents\\tally_export.xlsx and summarize the P&L"',
    ],
    docsUrl: 'https://github.com/haris-musa/excel-mcp-server',
  },
  {
    id: 'pdf-reader',
    name: 'PDF Reader',
    description: 'Extract and analyze text from PDFs — ITR PDFs, audit reports, notices, Form 16, balance sheets.',
    category: 'Local Tools',
    icon: '📄',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/PDF_file_icon.svg/391px-PDF_file_icon.svg.png',
    command: 'npx',
    args: ['-y', 'pdf-reader-mcp'],
    envVars: [],
    setupSteps: [
      'No API key required.',
      'Click Enable — installs automatically.',
      'Try: "Read C:\\Users\\93ani\\Downloads\\notice.pdf and tell me what action is required"',
    ],
    docsUrl: 'https://github.com/sylphlab/pdf-reader-mcp',
  },
  {
    id: 'mermaid',
    name: 'Mermaid Charts',
    description: 'Server-side rendering of Mermaid diagrams. Note: basic rendering is already built into the chat. This adds PNG/SVG export.',
    category: 'Visualization',
    icon: '🔀',
    logoUrl: 'https://mermaid.js.org/img/favicon.png',
    command: 'npx',
    args: ['-y', 'mermaid-mcp-server'],
    envVars: [],
    setupSteps: [
      'No API key required.',
      'Basic Mermaid rendering is already built into Practice OS chat.',
      'This adds the ability to save diagrams as PNG/SVG files.',
      'Click Enable to activate.',
    ],
    docsUrl: 'https://mermaid.js.org',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    description: 'Send WhatsApp messages to clients for payment reminders, GST filing alerts, and document requests.',
    category: 'Communication',
    icon: '💬',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/WhatsApp.svg/512px-WhatsApp.svg.png',
    command: 'npx',
    args: ['-y', 'whatsapp-mcp'],
    envVars: [],
    setupSteps: [
      'WhatsApp MCP uses whatsapp-web.js — no API key needed.',
      'Click Enable to install.',
      'On first use, a QR code will appear in the console — scan it with your WhatsApp mobile app.',
      'Once scanned, the connection stays active.',
      'Try: "Send a WhatsApp message to +91XXXXXXXXXX reminding them about their GST filing"',
    ],
    docsUrl: 'https://github.com/pedroslopez/whatsapp-web.js',
    warning: 'Scan the QR code in the terminal window the first time you use this. Keep WhatsApp connected on your phone.',
  },
  {
    id: 'ocr',
    name: 'OCR Scanner',
    description: 'Extract text from scanned images and photo PDFs. Read handwritten documents, old paper records, photo invoices.',
    category: 'Local Tools',
    icon: '🔍',
    command: 'npx',
    args: ['-y', 'ocr-mcp-server'],
    envVars: [
      {
        key: 'OCR_API_KEY',
        label: 'OCR.space API Key',
        hint: 'Free at ocr.space/ocrapi — 25,000 requests/month on free tier',
        secret: true,
      },
    ],
    setupSteps: [
      'Go to ocr.space/ocrapi and register for a free API key.',
      'The free tier supports 25,000 requests/month — sufficient for CA practices.',
      'Paste your key below and click Enable.',
    ],
    docsUrl: 'https://ocr.space/ocrapi',
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    description: 'Query and manage PostgreSQL with natural language. For practices using custom databases for client or billing data.',
    category: 'Database',
    icon: '🐘',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Postgresql_elephant.svg/540px-Postgresql_elephant.svg.png',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    envVars: [
      {
        key: 'POSTGRES_CONNECTION_STRING',
        label: 'Connection String',
        hint: 'postgresql://username:password@localhost:5432/database_name',
        secret: true,
      },
    ],
    setupSteps: [
      'Ensure PostgreSQL is running.',
      'Enter the connection string in the format shown.',
      'Click Enable.',
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres',
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Browse repos, read code, manage issues. For practices that build automation scripts or manage code projects.',
    category: 'Development',
    icon: '🐙',
    logoUrl: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    envVars: [
      {
        key: 'GITHUB_PERSONAL_ACCESS_TOKEN',
        label: 'Personal Access Token',
        hint: 'github.com → Settings → Developer Settings → Personal access tokens → Generate (repo scope)',
        secret: true,
      },
    ],
    setupSteps: [
      'Go to github.com → Settings → Developer Settings → Personal access tokens.',
      'Generate a new token (classic) with the "repo" scope.',
      'Paste it below.',
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
  },
]

export const CATEGORIES = [
  { id: 'all',            label: 'All',           icon: '✦' },
  { id: 'AI Enhancement', label: 'AI Tools',       icon: '🧠' },
  { id: 'Local Tools',    label: 'Local Files',    icon: '📁' },
  { id: 'Productivity',   label: 'Productivity',   icon: '📋' },
  { id: 'Automation',     label: 'Automation',     icon: '🤖' },
  { id: 'Web & Search',   label: 'Web',            icon: '🌐' },
  { id: 'Communication',  label: 'Messaging',      icon: '💬' },
  { id: 'Visualization',  label: 'Charts',         icon: '📊' },
  { id: 'Database',       label: 'Database',       icon: '🗄️' },
  { id: 'Development',    label: 'Dev Tools',      icon: '🔧' },
]
