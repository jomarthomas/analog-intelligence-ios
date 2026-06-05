/**
 * src/storage/db.ts
 *
 * expo-sqlite schema + lightweight migration runner for Analog Intelligence.
 *
 * Schema:
 *   schema_version(1 row)  — tracks current DB version for migrations
 *   sessions               — ScanSession rows
 *   images                 — ScannedImage rows (metadata only; files on disk)
 *
 * All image file data lives in expo-file-system (see imageRepository.ts).
 * The DB stores only URIs and JSON-encoded blobs for columns that don't need
 * querying (captureMetadata, processParams, exposureMetrics, exportHistory).
 *
 * Migration strategy: linear version bump; each migration is a SQL string
 * applied once. Safe to call openDatabase() multiple times — the connection
 * is memoised.
 */

import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DB_NAME = 'analog_intelligence.db';

/**
 * Current schema version. Bump this when adding a new migration to
 * MIGRATIONS below.
 */
const CURRENT_VERSION = 1;

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

/**
 * Each entry runs once, in order, when the DB is behind CURRENT_VERSION.
 * Index 0 = migration to version 1, index 1 = migration to version 2, etc.
 *
 * IMPORTANT: migrations must be append-only. Never edit an existing entry.
 */
const MIGRATIONS: string[] = [
  // --- v1: initial schema ---
  `
  CREATE TABLE IF NOT EXISTS schema_version (
    id      INTEGER PRIMARY KEY CHECK (id = 1),
    version INTEGER NOT NULL DEFAULT 0
  );

  INSERT OR IGNORE INTO schema_version (id, version) VALUES (1, 0);

  CREATE TABLE IF NOT EXISTS sessions (
    id            TEXT PRIMARY KEY NOT NULL,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    name          TEXT NOT NULL,
    notes         TEXT,
    film_type     TEXT,
    film_brand    TEXT,
    film_speed    INTEGER,
    session_state TEXT NOT NULL DEFAULT 'active',
    image_ids     TEXT NOT NULL DEFAULT '[]'
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_updated_at
    ON sessions (updated_at DESC);

  CREATE INDEX IF NOT EXISTS idx_sessions_state
    ON sessions (session_state);

  CREATE TABLE IF NOT EXISTS images (
    id                  TEXT PRIMARY KEY NOT NULL,
    session_id          TEXT NOT NULL,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    original_uri        TEXT NOT NULL,
    processed_uri       TEXT,
    thumbnail_uri       TEXT,
    is_processed        INTEGER NOT NULL DEFAULT 0,
    is_raw              INTEGER NOT NULL DEFAULT 0,
    was_pro_at_capture  INTEGER NOT NULL DEFAULT 0,
    capture_metadata    TEXT NOT NULL DEFAULT '{}',
    process_params      TEXT,
    exposure_metrics    TEXT,
    export_history      TEXT NOT NULL DEFAULT '[]',
    FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_images_session_id
    ON images (session_id);

  CREATE INDEX IF NOT EXISTS idx_images_created_at
    ON images (created_at DESC);
  `,
];

// ---------------------------------------------------------------------------
// Connection singleton
// ---------------------------------------------------------------------------

let _db: SQLiteDatabase | null = null;

/**
 * Open (or return the cached) database connection, running any pending
 * migrations on first open.
 *
 * @throws if the database cannot be opened or a migration fails.
 */
export async function openDatabase(): Promise<SQLiteDatabase> {
  if (_db !== null) return _db;

  const db = await openDatabaseAsync(DB_NAME, {
    enableChangeListener: false,
  });

  await runMigrations(db);

  _db = db;
  return db;
}

/**
 * Close the database connection. Clears the singleton so openDatabase() will
 * re-open on next call. Mainly for testing / factory-reset flows.
 */
export async function closeDatabase(): Promise<void> {
  if (_db === null) return;
  await _db.closeAsync();
  _db = null;
}

// ---------------------------------------------------------------------------
// Migration runner
// ---------------------------------------------------------------------------

async function runMigrations(db: SQLiteDatabase): Promise<void> {
  // Ensure the schema_version table exists first so we can read the version.
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id      INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO schema_version (id, version) VALUES (1, 0);
  `);

  const row = await db.getFirstAsync<{ version: number }>(
    'SELECT version FROM schema_version WHERE id = 1',
  );
  const currentVersion = row?.version ?? 0;

  if (currentVersion >= CURRENT_VERSION) return;

  // Run migrations from currentVersion up to CURRENT_VERSION (inclusive).
  for (let v = currentVersion; v < CURRENT_VERSION; v++) {
    const sql = MIGRATIONS[v];
    if (!sql) continue;
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(sql);
      await txn.runAsync(
        'UPDATE schema_version SET version = ? WHERE id = 1',
        [v + 1],
      );
    });
  }
}

// ---------------------------------------------------------------------------
// Row types returned by SQLite (snake_case from DB → used internally)
// ---------------------------------------------------------------------------

/**
 * Raw row from the `sessions` table.
 * Consumers should call rowToSession() to get a typed ScanSession.
 */
export interface SessionRow {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  notes: string | null;
  film_type: string | null;
  film_brand: string | null;
  film_speed: number | null;
  session_state: string;
  image_ids: string; // JSON-encoded string[]
}

/**
 * Raw row from the `images` table.
 * Consumers should call rowToImage() to get a typed ScannedImage.
 */
export interface ImageRow {
  id: string;
  session_id: string;
  created_at: string;
  updated_at: string;
  original_uri: string;
  processed_uri: string | null;
  thumbnail_uri: string | null;
  is_processed: number; // 0 | 1
  is_raw: number;
  was_pro_at_capture: number;
  capture_metadata: string; // JSON
  process_params: string | null; // JSON
  exposure_metrics: string | null; // JSON
  export_history: string; // JSON
}
