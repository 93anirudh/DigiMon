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
      onStep: (cb: (step: {
        type: string; toolName?: string; toolArgs?: any; result?: string;
        iteration?: number; from?: string; to?: string; reason?: string;
        inputTokens?: number; outputTokens?: number; totalTokens?: number; durationMs?: number;
      }) => void) => void
      onChatTitled: (cb: (data: { chatId: number; title: string }) => void) => void
      removeListeners: () => void

      approveToolCall: (approved: boolean) => Promise<boolean>
      onApprovalRequired: (cb: (data: { toolName: string; toolArgs: any }) => void) => void

      abortChat: () => Promise<boolean>

      // Google OAuth
      googleStatus: () => Promise<{ connected: false } | { connected: true; email: string; expired: boolean }>
      googleConnect: () => Promise<{ ok: true; email: string } | { ok: false; error: string }>
      googleDisconnect: () => Promise<boolean>
      googleCancel: () => Promise<boolean>

      setModel: (model: string) => Promise<boolean>
      getModel: () => Promise<string>
      getModelChain: () => Promise<string[]>
      testApiKey: (apiKey: string) => Promise<{ ok: boolean; error?: string }>
      onModelChange: (cb: (m: string) => void) => void

      getMcpConfig: () => Promise<any>
      getMcpStatus: () => Promise<any[]>
      toggleMcpServer: (serverId: string, enabled: boolean) => Promise<boolean>
      enableMcpWithEnv: (serverId: string, envValues: Record<string, string>, serverConfig: any) =>
        Promise<{ ok: boolean; toolCount?: number; error?: string }>
      storeGetMcpEnv: (serverId: string, key: string) => Promise<string | null>

      getUsageSummary: (chatId: number | null) => Promise<{
        summary: {
          today: { total_tokens: number; input_tokens: number; output_tokens: number; request_count: number; by_model: Record<string, number> }
          last_hour: { total_tokens: number; request_count: number }
          chat: { total_tokens: number; message_count: number } | null
          context_tokens_in_chat: number
        }
      }>
      onUsageTick: (cb: () => void) => void

      whatsappStart: () => Promise<{ ok: boolean; error?: string }>
      whatsappStop:  () => Promise<boolean>
      whatsappStatus: () => Promise<{
        status: 'disconnected' | 'awaiting_qr' | 'authenticated' | 'error'
        qrDataUrl: string | null
        error: string | null
        serverRunning: boolean
      }>
      whatsappStatusSync: () => Promise<{
        status: 'disconnected' | 'awaiting_qr' | 'authenticated' | 'error'
        qrDataUrl: string | null
        error: string | null
        serverRunning: boolean
      }>
      whatsappLogout: () => Promise<boolean>

      // ── CA Practice: Clients & Tasks ────────────────────
      createClient:  (input: import('./types/practice').ClientInput) => Promise<number>
      listClients:   (includeArchived?: boolean) => Promise<import('./types/practice').Client[]>
      getClient:     (id: number) => Promise<import('./types/practice').Client | undefined>
      updateClient:  (id: number, patch: Partial<import('./types/practice').ClientInput>) => Promise<boolean>
      archiveClient: (id: number, archived: boolean) => Promise<boolean>
      deleteClient:  (id: number) => Promise<boolean>

      createTask:         (input: import('./types/practice').TaskInput) => Promise<number>
      listTasksForClient: (clientId: number) => Promise<import('./types/practice').Task[]>
      listAllTasks:       () => Promise<import('./types/practice').TaskWithClient[]>
      getTask:            (id: number) => Promise<import('./types/practice').Task | undefined>
      updateTaskStatus:   (id: number, status: import('./types/practice').TaskStatus) => Promise<boolean>
      updateTask:         (id: number, patch: any) => Promise<boolean>
      deleteTask:         (id: number) => Promise<boolean>

      dashboardCounts: () => Promise<{
        totalClients: number
        tasksByStatus: Record<string, number>
      }>
    }
  }
}
