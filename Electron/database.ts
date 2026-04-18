import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'

// Renamed productName=DigiMon means userData moved from %APPDATA%/practice-os
// to %APPDATA%/DigiMon. On first launch after the rename, copy the old db
// over so users don't lose their chats.
const DB_FILENAME = 'practice-os.db'  // keep filename for compatibility
const DB_PATH = path.join(app.getPath('userData'), DB_FILENAME)

function migrateLegacyDb() {
  if (fs.existsSync(DB_PATH)) return // new path already has data
  try {
    const parent = path.dirname(app.getPath('userData'))
    const legacyPath = path.join(parent, 'practice-os', DB_FILENAME)
    if (fs.existsSync(legacyPath)) {
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
      fs.copyFileSync(legacyPath, DB_PATH)
      console.log(`[db] Migrated chats from ${legacyPath} → ${DB_PATH}`)
    }
  } catch (err: any) {
    console.warn('[db] Legacy migration failed (non-fatal):', err.message)
  }
}

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) {
    migrateLegacyDb()
    db = new Database(DB_PATH)
    initSchema()
    runMigrations()
  }
  return db
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT 'New Chat',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER,
      message_id INTEGER,
      provider TEXT NOT NULL CHECK(provider IN ('gemini', 'grok')),
      model TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE SET NULL,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_usage_chat ON usage_events(chat_id);
    CREATE INDEX IF NOT EXISTS idx_usage_provider ON usage_events(provider);
  `)
}

// Light migration runner — for future schema changes without data loss
function runMigrations() {
  // Ensure token columns exist on messages too (for per-message display)
  const cols = db.prepare("PRAGMA table_info(messages)").all() as Array<{name: string}>
  const colNames = new Set(cols.map(c => c.name))

  if (!colNames.has('input_tokens')) {
    db.exec(`ALTER TABLE messages ADD COLUMN input_tokens INTEGER`)
  }
  if (!colNames.has('output_tokens')) {
    db.exec(`ALTER TABLE messages ADD COLUMN output_tokens INTEGER`)
  }
  if (!colNames.has('provider')) {
    db.exec(`ALTER TABLE messages ADD COLUMN provider TEXT`)
  }
}
