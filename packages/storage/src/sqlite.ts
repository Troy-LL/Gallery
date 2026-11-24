import { DatabaseSync } from "node:sqlite";
import { bind, type AsyncDb } from "./db.js";

export function openSqlite(path: string): AsyncDb {
  const db = new DatabaseSync(path);
  return {
    async exec(sql) {
      db.exec(sql);
    },
    async all(sql, params = []) {
      return db.prepare(bind(sql, "sqlite")).all(...(params as [])) as never;
    },
    async get(sql, params = []) {
      return db.prepare(bind(sql, "sqlite")).get(...(params as [])) as never;
    },
    async run(sql, params = []) {
      db.prepare(bind(sql, "sqlite")).run(...(params as []));
    },
  };
}
