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
    const allowedExtensions = ['.txt', '.csv', '.json', '.md', '.log', '.ts', '.js', '.py']
    if (!allowedExtensions.includes(ext)) {
      return `Error: File type "${ext}" is not allowed for reading.`
    }
    const content = fs.readFileSync(filePath, 'utf-8')
    // Limit to 10,000 chars to avoid overflowing the context window
    return content.length > 10000
      ? content.slice(0, 10000) + '\n\n[...truncated at 10,000 characters]'
      : content
  } catch (err: any) {
    return `Error reading file: ${err.message}`
  }
}

// ── DANGEROUS TOOLS (require human approval) ──────────────────────────

export function executeShell(command: string): string {
  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      timeout: 30000, // 30 second timeout
      windowsHide: true,
    })
    return output || '(command executed with no output)'
  } catch (err: any) {
    return `Error executing command: ${err.message}`
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

// Which tools require human approval before running
export const DANGEROUS_TOOLS = new Set(['execute_shell', 'write_file'])