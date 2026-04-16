import { BrowserWindow } from 'electron'

// Holds the resolve function of the currently pending approval
let pendingApproval: ((approved: boolean) => void) | null = null

// Called by the agent loop: sends approval request to React and waits
export function requestApproval(
  win: BrowserWindow,
  toolName: string,
  toolArgs: Record<string, any>
): Promise<boolean> {
  return new Promise((resolve) => {
    pendingApproval = resolve
    // Tell React to show the approval modal
    win.webContents.send('tool:approval-required', { toolName, toolArgs })
  })
}

// Called by IPC handler when user clicks Approve or Reject in the UI
export function resolveApproval(approved: boolean) {
  if (pendingApproval) {
    pendingApproval(approved)
    pendingApproval = null
  }
}