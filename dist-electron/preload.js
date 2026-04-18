let electron = require("electron");
//#region Electron/preload.ts
electron.contextBridge.exposeInMainWorld("electronAPI", {
	storeSet: (key, value) => electron.ipcRenderer.invoke("store:set", key, value),
	storeGet: (key) => electron.ipcRenderer.invoke("store:get", key),
	storeDelete: (key) => electron.ipcRenderer.invoke("store:delete", key),
	needsSetup: () => electron.ipcRenderer.invoke("app:needsSetup"),
	createChat: (title) => electron.ipcRenderer.invoke("db:createChat", title),
	getChats: () => electron.ipcRenderer.invoke("db:getChats"),
	deleteChat: (chatId) => electron.ipcRenderer.invoke("db:deleteChat", chatId),
	saveMessage: (chatId, role, content) => electron.ipcRenderer.invoke("db:saveMessage", chatId, role, content),
	getMessages: (chatId) => electron.ipcRenderer.invoke("db:getMessages", chatId),
	sendMessage: (chatId, message) => electron.ipcRenderer.invoke("chat:send", chatId, message),
	retryLast: (chatId) => electron.ipcRenderer.invoke("chat:retry", chatId),
	onChunk: (cb) => electron.ipcRenderer.on("chat:chunk", (_e, chunk) => cb(chunk)),
	onDone: (cb) => electron.ipcRenderer.on("chat:done", () => cb()),
	onError: (cb) => electron.ipcRenderer.on("chat:error", (_e, msg) => cb(msg)),
	onStep: (cb) => electron.ipcRenderer.on("chat:step", (_e, step) => cb(step)),
	onChatTitled: (cb) => electron.ipcRenderer.on("chat:titled", (_e, data) => cb(data)),
	removeListeners: () => {
		electron.ipcRenderer.removeAllListeners("chat:chunk");
		electron.ipcRenderer.removeAllListeners("chat:done");
		electron.ipcRenderer.removeAllListeners("chat:error");
		electron.ipcRenderer.removeAllListeners("chat:step");
		electron.ipcRenderer.removeAllListeners("chat:titled");
		electron.ipcRenderer.removeAllListeners("llm:model");
		electron.ipcRenderer.removeAllListeners("usage:tick");
	},
	approveToolCall: (approved) => electron.ipcRenderer.invoke("tool:approve", approved),
	onApprovalRequired: (cb) => electron.ipcRenderer.on("tool:approval-required", (_e, data) => cb(data)),
	abortChat: () => electron.ipcRenderer.invoke("chat:abort"),
	setModel: (model) => electron.ipcRenderer.invoke("llm:setModel", model),
	getModel: () => electron.ipcRenderer.invoke("llm:getModel"),
	getModelChain: () => electron.ipcRenderer.invoke("llm:getChain"),
	testApiKey: (apiKey) => electron.ipcRenderer.invoke("llm:testKey", apiKey),
	onModelChange: (cb) => electron.ipcRenderer.on("llm:model", (_e, m) => cb(m)),
	getMcpConfig: () => electron.ipcRenderer.invoke("mcp:getConfig"),
	getMcpStatus: () => electron.ipcRenderer.invoke("mcp:getStatus"),
	toggleMcpServer: (serverId, enabled) => electron.ipcRenderer.invoke("mcp:toggleServer", serverId, enabled),
	enableMcpWithEnv: (serverId, envValues, serverConfig) => electron.ipcRenderer.invoke("mcp:enableWithEnv", serverId, envValues, serverConfig),
	storeGetMcpEnv: (serverId, key) => electron.ipcRenderer.invoke("store:get", `mcp_env_${serverId}_${key}`),
	getUsageSummary: (chatId) => electron.ipcRenderer.invoke("usage:summary", chatId),
	onUsageTick: (cb) => electron.ipcRenderer.on("usage:tick", () => cb()),
	whatsappStart: () => electron.ipcRenderer.invoke("whatsapp:start"),
	whatsappStop: () => electron.ipcRenderer.invoke("whatsapp:stop"),
	whatsappStatus: () => electron.ipcRenderer.invoke("whatsapp:status"),
	whatsappStatusSync: () => electron.ipcRenderer.invoke("whatsapp:getStatusSync"),
	whatsappLogout: () => electron.ipcRenderer.invoke("whatsapp:logout")
});
//#endregion
