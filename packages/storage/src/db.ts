export interface AsyncDb {
  exec(sql: string): Promise<void>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<void>;
}

export function bind(sql: string, dialect: "sqlite" | "postgres"): string {
  if (dialect === "sqlite") return sql;
  let index = 0;
  return sql.replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });
}

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  hash TEXT NOT NULL UNIQUE,
  source_ref TEXT UNIQUE,
  taken_at TEXT,
  phash TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  orientation TEXT NOT NULL DEFAULT 'square',
  dominant_h REAL NOT NULL DEFAULT 0,
  dominant_l REAL NOT NULL DEFAULT 0,
  peak_c REAL NOT NULL DEFAULT 0,
  is_monochrome INTEGER NOT NULL DEFAULT 0,
  file_path TEXT,
  thumbnail_path TEXT,
  sharpness TEXT,
  avg_luminance REAL,
  embedding TEXT,
  body TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS images_orientation_h ON images (orientation, dominant_h);
CREATE TABLE IF NOT EXISTS palettes (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lease (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  holder TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS spend (
  month TEXT PRIMARY KEY,
  input_tokens INTEGER NOT NULL,
  usd REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS tag_cache (
  hash TEXT NOT NULL,
  model_version TEXT NOT NULL,
  vocab_version TEXT NOT NULL,
  analysis TEXT NOT NULL,
  PRIMARY KEY (hash, model_version, vocab_version)
);
CREATE TABLE IF NOT EXISTS queue_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  paused INTEGER NOT NULL,
  reason TEXT
);
`;

export const IMAGE_COLUMN_ALTERS = [
  "ALTER TABLE images ADD COLUMN orientation TEXT NOT NULL DEFAULT 'square'",
  "ALTER TABLE images ADD COLUMN dominant_h REAL NOT NULL DEFAULT 0",
  "ALTER TABLE images ADD COLUMN dominant_l REAL NOT NULL DEFAULT 0",
  "ALTER TABLE images ADD COLUMN peak_c REAL NOT NULL DEFAULT 0",
  "ALTER TABLE images ADD COLUMN is_monochrome INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE images ADD COLUMN file_path TEXT",
  "ALTER TABLE images ADD COLUMN thumbnail_path TEXT",
  "ALTER TABLE images ADD COLUMN sharpness TEXT",
  "ALTER TABLE images ADD COLUMN avg_luminance REAL",
  "ALTER TABLE images ADD COLUMN embedding TEXT",
];

export const IMAGE_INDEXES = `
CREATE INDEX IF NOT EXISTS images_taken_at ON images (taken_at);
CREATE INDEX IF NOT EXISTS images_monochrome_l ON images (is_monochrome, dominant_l);
`;
