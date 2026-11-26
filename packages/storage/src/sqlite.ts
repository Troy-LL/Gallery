import { DatabaseSync, type StatementSync } from "node:sqlite";
import { bind, type AsyncDb } from "./db.js";

const STATEMENT_CACHE_LIMIT = 256;

export function openSqlite(path: string): AsyncDb {
  const db = new DatabaseSync(path);
  if (path !== ":memory:") db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA cache_size = -64000; PRAGMA temp_store = MEMORY; PRAGMA mmap_size = 268435456;");
  const statements = new Map<string, StatementSync>();
  const prepare = (sql: string) => {
    let statement = statements.get(sql);
    if (!statement) {
      if (statements.size >= STATEMENT_CACHE_LIMIT) statements.delete(statements.keys().next().value as string);
      statement = db.prepare(bind(sql, "sqlite"));
      statements.set(sql, statement);
    }
    return statement;
  };
  return {
    async exec(sql) {
      db.exec(sql);
    },
    async all(sql, params = []) {
      return prepare(sql).all(...(params as [])) as never;
    },
    async get(sql, params = []) {
      return prepare(sql).get(...(params as [])) as never;
    },
    async run(sql, params = []) {
      prepare(sql).run(...(params as []));
    },
  };
}
