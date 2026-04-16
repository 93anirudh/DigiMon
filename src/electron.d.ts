export {}

declare global {
  interface Window {
    _pendingSuggestion?: string
    electronAPI: {
      storeSet: (key: string, value: string) => Promise<boolean>
      storeGet: (key: string) => Promise<string | null>
      storeDelete: (key: string) => Promise<boolean>

      needsSetup: () => Promise<boolean>

      createChat: (title: string) => Promise<number>
      getChats: () => Promise<any[]>
      deleteChat: (chatId: number) => Promise<boolean>
      saveMessage: (chatId: number, role: string, content: string) => Promise<number>
      getMessages: (chatId: number) => Promise<any[]>
      sendMessage: (chatId: number, message: string) => Promise<void>
      retryLast: (chatId: number) => Promise<void>

      onChunk: (cb: (chunk: string) => void) => void
      onDone: (cb: () => void) => void
      onError: (cb: (msg: string) => void) => void
      onStep: (cb: (step: { type: string; toolName?: string; toolArgs?: any; result?: string; iteration?: number; from?: string; to?: string }) => void) => void
      onChatTitled: (cb: (data: { chatId: number; title: string }) => void) => void
      removeListeners: () => void

      approveToolCall: (approved: boolean) => Promise<boolean>
      onApprovalRequired: (cb: (data: { toolName: string; toolArgs: any }) => void) => void

      setProvider: (provider: string) => Promise<boolean>
      getProvider: () => Promise<string>
      testApiKey: (provider: string, apiKey: string) => Promise<{ ok: boolean; error?: string }>
      onProviderChange: (cb: (p: string) => void) => void
      onQuotaHit: (cb: (data: { from: string; hasGrok: boolean; hasGemini: boolean; message?: string }) => void) => void

      getMcpConfig: () => Promise<any>
      getMcpStatus: () => Promise<any[]>
      toggleMcpServer: (serverId: string, enabled: boolean) => Promise<boolean>
      enableMcpWithEnv: (serverId: string, envValues: Record<string, string>, serverConfig: any) =>
        Promise<{ ok: boolean; toolCount?: number; error?: string }>
      storeGetMcpEnv: (serverId: string, key: string) => Promise<string | null>
    }
  }
}
