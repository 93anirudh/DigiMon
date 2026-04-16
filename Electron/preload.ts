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
    ipcRenderer.removeAllListeners('llm:provider')
    ipcRenderer.removeAllListeners('llm:quota-hit')
  },

  // ── Tool Approval ─────────────────────────────────────
  approveToolCall: (approved: boolean) => ipcRenderer.invoke('tool:approve', approved),
  onApprovalRequired: (cb: (data: { toolName: string; toolArgs: any }) => void) =>
    ipcRenderer.on('tool:approval-required', (_e, data) => cb(data)),

  // ── LLM Provider ──────────────────────────────────────
  setProvider: (provider: string) => ipcRenderer.invoke('llm:setProvider', provider),
  getProvider: () => ipcRenderer.invoke('llm:getProvider'),
  testApiKey: (provider: string, apiKey: string) =>
    ipcRenderer.invoke('llm:testKey', provider, apiKey),
  onProviderChange: (cb: (p: string) => void) =>
    ipcRenderer.on('llm:provider', (_e, p) => cb(p)),
  onQuotaHit: (cb: (data: { from: string; hasGrok: boolean; hasGemini: boolean; message?: string }) => void) =>
    ipcRenderer.on('llm:quota-hit', (_e, data) => cb(data)),

  // ── MCP Hub ───────────────────────────────────────────
  getMcpConfig: () => ipcRenderer.invoke('mcp:getConfig'),
  getMcpStatus: () => ipcRenderer.invoke('mcp:getStatus'),
  toggleMcpServer: (serverId: string, enabled: boolean) =>
    ipcRenderer.invoke('mcp:toggleServer', serverId, enabled),
  enableMcpWithEnv: (serverId: string, envValues: Record<string, string>, serverConfig: any) =>
    ipcRenderer.invoke('mcp:enableWithEnv', serverId, envValues, serverConfig),
  storeGetMcpEnv: (serverId: string, key: string) =>
    ipcRenderer.invoke('store:get', `mcp_env_${serverId}_${key}`),
})
