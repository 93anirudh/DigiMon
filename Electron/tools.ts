import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

// ── SAFE TOOLS (execute automatically) ────────────────────────────────

export function listDirectory(dirPath: string): string {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    const result = entries.map(e => ({
      name: e.name,
      type: e.isDirectory() ? 'folder' : 'file',
    }))
    return JSON.stringify(result, null, 2)
  } catch (err: any) {
    return `Error listing directory: ${err.message}`
  }
}

export function readFile(filePath: string): string {
  try {
    const ext = path.extname(filePath).toLowerCase()
    const allowedExtensions = ['.txt', '.csv', '.json', '.md', '.log', '.ts', '.js', '.py', '.sql', '.html', '.xml', '.yaml', '.yml']
    if (!allowedExtensions.includes(ext)) {
      return `Error: File type "${ext}" is not allowed for reading.`
    }
    const content = fs.readFileSync(filePath, 'utf-8')
    return content.length > 10000
      ? content.slice(0, 10000) + '\n\n[...truncated at 10,000 characters]'
      : content
  } catch (err: any) {
    return `Error reading file: ${err.message}`
  }
}

// ── Shell executor — returns FULL output including stderr on failure ──
// This lets the agent see real errors and adapt (self-correct) rather than
// fabricating success. Agent loop depends on this.
export function executeShell(command: string): string {
  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      timeout: 30000,
      windowsHide: true,
    })
    return output || '(command executed with no output)'
  } catch (err: any) {
    const stderr = err.stderr?.toString() ?? ''
    const stdout = err.stdout?.toString() ?? ''
    return `ERROR: ${err.message}${stdout ? '\nSTDOUT: ' + stdout : ''}${stderr ? '\nSTDERR: ' + stderr : ''}`
  }
}

export function writeFile(filePath: string, content: string): string {
  try {
    fs.writeFileSync(filePath, content, 'utf-8')
    return `Successfully wrote to ${filePath}`
  } catch (err: any) {
    return `Error writing file: ${err.message}`
  }
}

// ── Destructive shell command detection ───────────────
// Read-only commands (dir, ls, cat, echo, git status, python --version) run immediately.
// Destructive commands (del, rm, format, shutdown, installers) require user approval.
// The approval modal shows the exact command so the user sees what's being run.
export function isDestructiveShell(command: string): boolean {
  const cmd = command.toLowerCase().trim()
  const destructivePatterns = [
    // File deletion
    /\b(del|erase|rmdir|rd)\b/,
    /\brm\b/,
    /\bremove-item\b/,
    // Disk / system
    /\bformat\b/,
    /\bshutdown\b/,
    /\brestart-computer\b/,
    /\btaskkill\b/,
    // Registry / users
    /\breg\s+(delete|add)\b/,
    /\bnet\s+user\b.*\/delete/,
    // Database destructive
    /\bdrop\s+(table|database|schema)\b/,
    /\btruncate\s+table\b/,
    /\bdelete\s+from\b/,
    // File overwrite / move
    /\b(move|mv|ren|rename)\b/,
    />\s*["']?[a-z]:[\\/]/i,          // redirect > to a file path
    // File creation via PowerShell
    /\bnew-item\b/,
    /\bset-item\b/,
    /\binvoke-webrequest.*-outfile/,
    /\bcurl.*\s-o\s/,
    // Package installers (state-changing)
    /\bpip\s+(install|uninstall)\b/,
    /\bnpm\s+(install|uninstall|i\b)/,
    /\bchoco\s+(install|uninstall)/,
    /\bwinget\s+(install|uninstall)/,
    /\.msi\b/,
    /\.exe\s+\/install/,
    // Git destructive
    /\bgit\s+(push|reset\s+--hard|rebase|clean\s+-f)/,
  ]
  return destructivePatterns.some(p => p.test(cmd))
}

// write_file ALWAYS needs approval. execute_shell is checked per-command via isDestructiveShell.
export const DANGEROUS_TOOLS = new Set(['write_file'])
