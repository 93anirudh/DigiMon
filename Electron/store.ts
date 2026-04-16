import path from 'path'
import fs from 'fs'
import { app } from 'electron'

// Simple JSON-based key-value store in the user's app data folder
const STORE_PATH = path.join(app.getPath('userData'), 'secure-store.json')

function readStore(): Record<string, string> {
  if (!fs.existsSync(STORE_PATH)) return {}
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'))
  } catch {
    return {}
  }
}

function writeStore(data: Record<string, string>) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export function storeSet(key: string, value: string) {
  const data = readStore()
  data[key] = value
  writeStore(data)
}

export function storeGet(key: string): string | null {
  return readStore()[key] ?? null
}

export function storeDelete(key: string) {
  const data = readStore()
  delete data[key]
  writeStore(data)
}