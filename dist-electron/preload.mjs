let electron = require("electron");
//#region electron/preload.ts
electron.contextBridge.exposeInMainWorld("electronAPI", { ping: () => electron.ipcRenderer.invoke("ping") });
//#endregion
