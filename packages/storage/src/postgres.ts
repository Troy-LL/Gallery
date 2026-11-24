import { bind, type AsyncDb } from "./db.js";

type Row = Record<string, unknown>;

export function createPostgresDb(query: (sql: string, params: unknown[]) => Promise<Row[]>): AsyncDb {
  return {
    async exec(sql) {
      const statements = sql
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean);
      for (const statement of statements) await query(statement, []);
    },
    async all(sql, params = []) {
      return (await query(bind(sql, "postgres"), params)) as never;
    },
    async get(sql, params = []) {
      const rows = await query(bind(sql, "postgres"), params);
      return rows[0] as never;
    },
    async run(sql, params = []) {
      await query(bind(sql, "postgres"), params);
    },
  };
}
