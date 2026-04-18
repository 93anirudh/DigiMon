import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Secure Store ──────────────────────────────────────
  storeSet: (key: string, value: string) => ipcRenderer.invoke('store:set', key, value),
  storeGet: (key: string) => ipcRenderer.invoke('store:get', key),
  storeDelete: (key: string) => ipcRenderer.invoke('store:delete', key),

  // ── App ──────────────────────────────────────────────
  needsSetup: () => ipcRenderer.invoke('app:needsSetup'),

  // ── Chats ─────────────────────────────────────────────
  createChat: (title: string) => ipcRenderer.invoke('db:createChat', title),
  getChats: () => ipcRenderer.invoke('db:getChats'),
  deleteChat: (chatId: number) => ipcRenderer.invoke('db:deleteChat', chatId),

  // ── Messages ──────────────────────────────────────────
  saveMessage: (chatId: number, role: string, content: string) =>
    ipcRenderer.invoke('db:saveMessage', chatId, role, content),
  getMessages: (chatId: number) => ipcRenderer.invoke('db:getMessages', chatId),

  // ── LLM Chat ──────────────────────────────────────────
  sendMessage: (chatId: number, message: string) =>
    ipcRenderer.invoke('chat:send', chatId, message),
  retryLast: (chatId: number) =>
    ipcRenderer.invoke('chat:retry', chatId),

  onChunk: (cb: (chunk: string) => void) =>
    ipcRenderer.on('chat:chunk', (_e, chunk) => cb(chunk)),
  onDone: (cb: () => void) =>
    ipcRenderer.on('chat:done', () => cb()),
  onError: (cb: (msg: string) => void) =>
    ipcRenderer.on('chat:error', (_e, msg) => cb(msg)),
  onStep: (cb: (step: any) => void) =>
    ipcRenderer.on('chat:step', (_e, step) => cb(step)),
  onChatTitled: (cb: (data: { chatId: number; title: string }) => void) =>
    ipcRenderer.on('chat:titled', (_e, data) => cb(data)),

  removeListeners: () => {
    ipcRenderer.removeAllListeners('chat:chunk')
    ipcRenderer.removeAllListeners('chat:done')
    ipcRenderer.removeAllListeners('chat:error')
    ipcRenderer.removeAllListeners('chat:step')
    ipcRenderer.removeAllListeners('chat:titled')
    ipcRenderer.removeAllListeners('llm:model')
    ipcRenderer.removeAllListeners('usage:tick')
  },

  // ── Tool Approval ─────────────────────────────────────
  approveToolCall: (approved: boolean) => ipcRenderer.invoke('tool:approve', approved),
  onApprovalRequired: (cb: (data: { toolName: string; toolArgs: any }) => void) =>
    ipcRenderer.on('tool:approval-required', (_e, data) => cb(data)),

  // ── Abort run ────────────────────────────────────────
  abortChat: () => ipcRenderer.invoke('chat:abort'),

  // ── LLM Model ─────────────────────────────────────────
  setModel: (model: string) => ipcRenderer.invoke('llm:setModel', model),
  getModel: () => ipcRenderer.invoke('llm:getModel'),
  getModelChain: () => ipcRenderer.invoke('llm:getChain'),
  testApiKey: (apiKey: string) => ipcRenderer.invoke('llm:testKey', apiKey),
  onModelChange: (cb: (m: string) => void) =>
    ipcRenderer.on('llm:model', (_e, m) => cb(m)),

  // ── MCP Hub ───────────────────────────────────────────
  getMcpConfig: () => ipcRenderer.invoke('mcp:getConfig'),
  getMcpStatus: () => ipcRenderer.invoke('mcp:getStatus'),
  toggleMcpServer: (serverId: string, enabled: boolean) =>
    ipcRenderer.invoke('mcp:toggleServer', serverId, enabled),
  enableMcpWithEnv: (serverId: string, envValues: Record<string, string>, serverConfig: any) =>
    ipcRenderer.invoke('mcp:enableWithEnv', serverId, envValues, serverConfig),
  storeGetMcpEnv: (serverId: string, key: string) =>
    ipcRenderer.invoke('store:get', `mcp_env_${serverId}_${key}`),

  // ── Usage ────────────────────────────────────────────
  getUsageSummary: (chatId: number | null) =>
    ipcRenderer.invoke('usage:summary', chatId),
  onUsageTick: (cb: () => void) =>
    ipcRenderer.on('usage:tick', () => cb()),

  // ── WhatsApp ─────────────────────────────────────────
  whatsappStart:    () => ipcRenderer.invoke('whatsapp:start'),
  whatsappStop:     () => ipcRenderer.invoke('whatsapp:stop'),
  whatsappStatus:   () => ipcRenderer.invoke('whatsapp:status'),
  whatsappStatusSync: () => ipcRenderer.invoke('whatsapp:getStatusSync'),
  whatsappLogout:   () => ipcRenderer.invoke('whatsapp:logout'),
})
