import path from 'path'
import fs from 'fs'
import { app } from 'electron'

// Simple JSON-based key-value store in the user's app data folder
const STORE_PATH = path.join(app.getPath('userData'), 'secure-store.json')

let migrated = false
function migrateLegacy() {
  if (migrated) return
  migrated = true
  try {
    if (fs.existsSync(STORE_PATH)) return // already have data at new path
    const parent = path.dirname(app.getPath('userData'))
    const legacyPath = path.join(parent, 'practice-os', 'secure-store.json')
    if (fs.existsSync(legacyPath)) {
      fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true })
      fs.copyFileSync(legacyPath, STORE_PATH)
      console.log(`[store] Migrated secure-store from legacy path`)
    }
  } catch (err: any) {
    console.warn('[store] Legacy migration failed (non-fatal):', err.message)
  }
}

function readStore(): Record<string, string> {
  migrateLegacy()
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