import { appendFileSync } from "node:fs";
import {
  analysisSchema,
  collectionSchema,
  libraryRecordSchema,
  facetMatches,
  selectionMatches,
  paletteSchema,
  postSchema,
  type Analysis,
  type Collection,
  type CurationPatch,
  type LibraryQuery,
  type LibraryRecord,
  type Palette,
  type Post,
  type SharpnessLevel,
} from "@gallery/core";
import { applyAnswerLock, applyDominantHex, mergeAnalysis, withAnalysis, analysisFromRecord } from "@gallery/core";
import { IMAGE_COLUMN_ALTERS, IMAGE_INDEXES, SCHEMA, type AsyncDb } from "./db.js";

export type UpsertResult = { status: "inserted" | "duplicate"; record: LibraryRecord };

export type QueryResult = {
  total: number;
  matched: number;
  records: LibraryRecord[];
  maxChroma: number;
};

export type MediaKeys = { hash: string; file_path: string; thumbnail_path: string };

export type DedupeInput = { id: string; phash: string; sharpness: SharpnessLevel; luminance: number };

type ImageRow = { id: string; hash: string; body: string };

const IMAGE_COLUMNS = [
  "hash",
  "source_ref",
  "taken_at",
  "phash",
  "file_size",
  "orientation",
  "dominant_h",
  "dominant_l",
  "peak_c",
  "is_monochrome",
  "file_path",
  "thumbnail_path",
  "sharpness",
  "avg_luminance",
  "embedding",
];

const INSERT_IMAGE = `INSERT INTO images (id, ${IMAGE_COLUMNS.join(", ")}, body) VALUES (${placeholders(IMAGE_COLUMNS.length + 2)})`;
const UPDATE_IMAGE = `UPDATE images SET ${IMAGE_COLUMNS.map((column) => `${column} = ?`).join(", ")}, body = ? WHERE id = ?`;
const BACKFILL_IMAGE = "UPDATE images SET file_path = ?, thumbnail_path = ?, sharpness = ?, avg_luminance = ?, embedding = ? WHERE id = ?";
const ID_PARAM_LIMIT = 500;

export function createStore(db: AsyncDb, options: { wrongTagsPath?: string } = {}) {
  let ready: Promise<void> | null = null;
  const ensure = () => {
    ready ??= (async () => {
      await db.exec(SCHEMA);
      for (const statement of IMAGE_COLUMN_ALTERS) {
        try {
          await db.exec(statement);
        } catch {
          continue;
        }
      }
      await db.exec(IMAGE_INDEXES);
      await backfillColumns();
    })();
    return ready;
  };

  async function backfillColumns(): Promise<void> {
    const stale = await db.all<ImageRow>("SELECT id, hash, body FROM images WHERE file_path IS NULL");
    const records = stale.flatMap((row) => {
      const record = readRecord(row.body);
      return record ? [record] : [];
    });
    if (records.length === 0) return;
    await db.exec("BEGIN");
    try {
      for (const record of records) await db.run(BACKFILL_IMAGE, [...columnValues(record), record.id]);
      await db.exec("COMMIT");
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  }

  async function read(id: string): Promise<LibraryRecord | null> {
    await ensure();
    const row = await db.get<ImageRow>("SELECT id, hash, body FROM images WHERE id = ?", [id]);
    return row ? readRecord(row.body) : null;
  }

  async function write(record: LibraryRecord): Promise<void> {
    await ensure();
    const parsed = libraryRecordSchema.parse(record);
    await db.run(UPDATE_IMAGE, [...imageValues(parsed), JSON.stringify(parsed), parsed.id]);
  }

  return {
    async upsert(record: LibraryRecord): Promise<UpsertResult> {
      await ensure();
      const parsed = libraryRecordSchema.parse(record);
      const byHash = await db.get<ImageRow>("SELECT id, hash, body FROM images WHERE hash = ?", [parsed.hash]);
      const duplicate = byHash ? readRecord(byHash.body) : null;
      if (duplicate) return { status: "duplicate", record: duplicate };
      if (parsed.source_ref) {
        const byRef = await db.get<ImageRow>("SELECT id, hash, body FROM images WHERE source_ref = ?", [parsed.source_ref]);
        const refDuplicate = byRef ? readRecord(byRef.body) : null;
        if (refDuplicate) return { status: "duplicate", record: refDuplicate };
      }
      await db.run(INSERT_IMAGE, [parsed.id, ...imageValues(parsed), JSON.stringify(parsed)]);
      return { status: "inserted", record: parsed };
    },

    async get(id: string): Promise<LibraryRecord | null> {
      await ensure();
      return read(id);
    },

    async getMedia(id: string): Promise<MediaKeys | null> {
      await ensure();
      const row = await db.get<{ hash: string; file_path: string | null; thumbnail_path: string | null }>(
        "SELECT hash, file_path, thumbnail_path FROM images WHERE id = ?",
        [id],
      );
      if (!row || row.file_path === null || row.thumbnail_path === null) return null;
      return { hash: row.hash, file_path: row.file_path, thumbnail_path: row.thumbnail_path };
    },

    async listEmbeddings(): Promise<{ id: string; embedding: number[] }[]> {
      await ensure();
      const rows = await db.all<{ id: string; embedding: string }>("SELECT id, embedding FROM images WHERE embedding IS NOT NULL ORDER BY id");
      return rows.map((row) => ({ id: row.id, embedding: JSON.parse(row.embedding) as number[] }));
    },

    async listDedupeInputs(): Promise<DedupeInput[]> {
      await ensure();
      const rows = await db.all<{ id: string; phash: string; sharpness: SharpnessLevel; avg_luminance: number }>(
        "SELECT id, phash, sharpness, avg_luminance FROM images WHERE sharpness IS NOT NULL ORDER BY id",
      );
      return rows.map((row) => ({ id: row.id, phash: row.phash, sharpness: row.sharpness, luminance: Number(row.avg_luminance) }));
    },

    async getByHash(hash: string): Promise<LibraryRecord | null> {
      await ensure();
      const row = await db.get<ImageRow>("SELECT id, hash, body FROM images WHERE hash = ?", [hash]);
      return row ? readRecord(row.body) : null;
    },

    async list(): Promise<LibraryRecord[]> {
      await ensure();
      const rows = await db.all<ImageRow>("SELECT id, hash, body FROM images ORDER BY id");
      return rows.flatMap((row) => {
        const record = readRecord(row.body);
        return record ? [record] : [];
      });
    },

    async listByTakenAt(takenAt: string): Promise<LibraryRecord[]> {
      await ensure();
      const rows = await db.all<ImageRow>("SELECT id, hash, body FROM images WHERE taken_at = ?", [takenAt]);
      return rows.flatMap((row) => {
        const record = readRecord(row.body);
        return record ? [record] : [];
      });
    },

    async update(record: LibraryRecord): Promise<LibraryRecord> {
      await ensure();
      const parsed = libraryRecordSchema.parse(record);
      await write(parsed);
      return parsed;
    },

    async query(query: LibraryQuery): Promise<QueryResult> {
      await ensure();
      const totalRow = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM images");
      const peakRow = await db.get<{ peak: number }>("SELECT COALESCE(MAX(peak_c), 0) AS peak FROM images");
      const filter = candidateFilter(query);
      const rows = await db.all<ImageRow>(`SELECT id, hash, body FROM images${filter.sql} ORDER BY id`, filter.params);
      const records = rows.flatMap((row) => {
        const record = readRecord(row.body);
        return record ? [record] : [];
      });
      const peak = peakRow?.peak ?? 0;
      const matched = records.filter((record) => selectionMatches(record, query.selection, peak) && facetMatches(record, query.facets));
      return { total: Number(totalRow?.n ?? 0), matched: matched.length, records: matched, maxChroma: peak };
    },

    async updateCuration(id: string, patch: CurationPatch): Promise<LibraryRecord> {
      const current = await read(id);
      if (!current) throw new Error(`missing image ${id}`);
      let next: LibraryRecord = { ...current };
      if (patch.rating !== undefined) next = { ...next, rating: patch.rating };
      if (patch.status) next = { ...next, status: patch.status };
      if (patch.notes !== undefined) next = { ...next, notes: patch.notes };
      if (patch.source_credit !== undefined) next = { ...next, source_credit: patch.source_credit };
      if (patch.answer) next = applyAnswerLock(next, patch.answer);
      if (patch.dominant_hex) next = applyDominantHex(next, patch.dominant_hex);
      await write(next);
      return next;
    },

    async saveAnalysis(id: string, analysis: Analysis): Promise<LibraryRecord> {
      const current = await read(id);
      if (!current) throw new Error(`missing image ${id}`);
      const prior = analysisFromRecord(current) ?? {
        ...analysis,
        image_id: id,
        answers: current.answers,
        has_text: current.has_text,
        subject_box: current.subject_box,
        locked_fields: current.locked_fields,
        needs_tags: current.needs_tags,
      };
      const merged = mergeAnalysis(prior, { ...analysis, image_id: id });
      const next = withAnalysis(current, merged);
      if (current.locked_fields.includes("dominant_hex")) {
        next.dominant_hex = current.dominant_hex;
        next.dominant_h = current.dominant_h;
        next.dominant_s = current.dominant_s;
        next.dominant_l = current.dominant_l;
        next.dominant_oklch = current.dominant_oklch;
        next.palette = current.palette;
        next.locked_fields = [...new Set([...next.locked_fields, ...current.locked_fields])];
      }
      await write(libraryRecordSchema.parse(next));
      return next;
    },

    async createPalette(palette: Palette): Promise<void> {
      await ensure();
      const parsed = paletteSchema.parse(palette);
      await db.run("INSERT INTO palettes (id, body) VALUES (?, ?)", [parsed.id, JSON.stringify(parsed)]);
    },

    async listPalettes(): Promise<Palette[]> {
      await ensure();
      const rows = await db.all<{ body: string }>("SELECT body FROM palettes ORDER BY id");
      return rows.map((row) => paletteSchema.parse(JSON.parse(row.body)));
    },

    async createPost(post: Post): Promise<void> {
      await ensure();
      const parsed = postSchema.parse(post);
      await db.exec("BEGIN");
      try {
        await db.run("INSERT INTO posts (id, body) VALUES (?, ?)", [parsed.id, JSON.stringify(parsed)]);
        const uses = new Map<string, number>();
        for (const imageId of parsed.image_ids) uses.set(imageId, (uses.get(imageId) ?? 0) + 1);
        const rows =
          uses.size === 0
            ? []
            : await db.all<ImageRow>(`SELECT id, hash, body FROM images WHERE id IN (${placeholders(uses.size)})`, [...uses.keys()]);
        for (const row of rows) {
          const record = readRecord(row.body);
          if (!record) continue;
          await write({
            ...record,
            used_count: record.used_count + (uses.get(record.id) ?? 0),
            last_used_at: parsed.posted_at,
          });
        }
        await db.exec("COMMIT");
      } catch (error) {
        await db.exec("ROLLBACK");
        throw error;
      }
    },

    async listPosts(): Promise<Post[]> {
      await ensure();
      const rows = await db.all<{ body: string }>("SELECT body FROM posts ORDER BY id");
      return rows.map((row) => postSchema.parse(JSON.parse(row.body)));
    },

    async createCollection(collection: Collection): Promise<void> {
      await ensure();
      const parsed = collectionSchema.parse(collection);
      await db.run("INSERT INTO collections (id, body) VALUES (?, ?)", [parsed.id, JSON.stringify(parsed)]);
    },

    async listCollections(): Promise<Collection[]> {
      await ensure();
      const rows = await db.all<{ body: string }>("SELECT body FROM collections ORDER BY id");
      return rows.map((row) => collectionSchema.parse(JSON.parse(row.body)));
    },

    async exportJson(): Promise<{ images: LibraryRecord[]; palettes: Palette[]; posts: Post[]; collections: Collection[] }> {
      return {
        images: await this.list(),
        palettes: await this.listPalettes(),
        posts: await this.listPosts(),
        collections: await this.listCollections(),
      };
    },

    async exportCsv(): Promise<string> {
      const images = await this.list();
      const header = ["id", "hash", "dominant_hex", "status", "taken_at", "source_type", "needs_tags"];
      const lines = [header.join(",")];
      for (const image of images) {
        lines.push(
          [image.id, image.hash, image.dominant_hex, image.status, image.taken_at ?? "", image.source_type, String(image.needs_tags)]
            .map(csvCell)
            .join(","),
        );
      }
      return lines.join("\n");
    },

    async acquireLease(holder: string, now: number, ttlMs: number): Promise<boolean> {
      await ensure();
      const row = await db.get<{ holder: string; expires_at: number }>("SELECT holder, expires_at FROM lease WHERE id = 1");
      if (row && row.expires_at > now && row.holder !== holder) return false;
      if (!row) await db.run("INSERT INTO lease (id, holder, expires_at) VALUES (1, ?, ?)", [holder, now + ttlMs]);
      else await db.run("UPDATE lease SET holder = ?, expires_at = ? WHERE id = 1", [holder, now + ttlMs]);
      return true;
    },

    async releaseLease(holder: string): Promise<void> {
      await ensure();
      await db.run("DELETE FROM lease WHERE id = 1 AND holder = ?", [holder]);
    },

    async getSpend(month: string): Promise<{ input_tokens: number; usd: number }> {
      await ensure();
      const row = await db.get<{ input_tokens: number; usd: number }>("SELECT input_tokens, usd FROM spend WHERE month = ?", [month]);
      return row ?? { input_tokens: 0, usd: 0 };
    },

    async addSpend(month: string, tokens: number, usd: number): Promise<void> {
      await ensure();
      const current = await this.getSpend(month);
      await db.run(
        `INSERT INTO spend (month, input_tokens, usd) VALUES (?, ?, ?)
         ON CONFLICT(month) DO UPDATE SET input_tokens = excluded.input_tokens, usd = excluded.usd`,
        [month, current.input_tokens + tokens, current.usd + usd],
      );
    },

    async getTagCache(hash: string, model: string, vocab: string): Promise<Analysis | null> {
      await ensure();
      const row = await db.get<{ analysis: string }>(
        "SELECT analysis FROM tag_cache WHERE hash = ? AND model_version = ? AND vocab_version = ?",
        [hash, model, vocab],
      );
      return row ? analysisSchema.parse(JSON.parse(row.analysis)) : null;
    },

    async putTagCache(hash: string, model: string, vocab: string, analysis: Analysis): Promise<void> {
      await ensure();
      const parsed = analysisSchema.parse(analysis);
      await db.run(
        `INSERT INTO tag_cache (hash, model_version, vocab_version, analysis) VALUES (?, ?, ?, ?)
         ON CONFLICT(hash, model_version, vocab_version) DO UPDATE SET analysis = excluded.analysis`,
        [hash, model, vocab, JSON.stringify(parsed)],
      );
    },

    async usedBytes(): Promise<number> {
      await ensure();
      const row = await db.get<{ n: number }>("SELECT COALESCE(SUM(file_size), 0) AS n FROM images");
      return Number(row?.n ?? 0);
    },

    async setQueuePaused(paused: boolean, reason: string | null): Promise<void> {
      await ensure();
      await db.run("DELETE FROM queue_state WHERE id = 1");
      await db.run("INSERT INTO queue_state (id, paused, reason) VALUES (1, ?, ?)", [paused ? 1 : 0, reason]);
    },

    async queueState(): Promise<{ paused: boolean; reason: string | null }> {
      await ensure();
      const row = await db.get<{ paused: number; reason: string | null }>("SELECT paused, reason FROM queue_state WHERE id = 1");
      return { paused: row ? row.paused === 1 : false, reason: row?.reason ?? null };
    },

    appendWrongTag(line: unknown): void {
      if (!options.wrongTagsPath) throw new Error("wrong tag path is not configured");
      appendFileSync(options.wrongTagsPath, `${JSON.stringify(line)}\n`);
    },
  };
}

function readRecord(body: string): LibraryRecord | null {
  try {
    const value: unknown = JSON.parse(body);
    return isRecordShape(value) ? value : null;
  } catch {
    return null;
  }
}

function isRecordShape(value: unknown): value is LibraryRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" && typeof record.dominant_oklch === "object" && record.dominant_oklch !== null && Array.isArray(record.palette)
  );
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

function columnValues(record: LibraryRecord): unknown[] {
  return [
    record.file_path,
    record.thumbnail_path,
    record.sharpness,
    record.avg_luminance,
    record.embedding ? JSON.stringify(record.embedding) : null,
  ];
}

function imageValues(record: LibraryRecord): unknown[] {
  const peak = Math.max(record.dominant_oklch.C, ...record.palette.map((swatch) => swatch.oklch.C));
  return [
    record.hash,
    record.source_ref,
    record.taken_at,
    record.phash,
    record.file_size,
    record.orientation,
    record.dominant_oklch.h,
    record.dominant_oklch.L,
    Number.isFinite(peak) ? peak : 0,
    record.is_monochrome ? 1 : 0,
    ...columnValues(record),
  ];
}

function candidateFilter(query: LibraryQuery): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (query.facets.orientation?.length) {
    clauses.push(`orientation IN (${query.facets.orientation.map(() => "?").join(", ")})`);
    params.push(...query.facets.orientation);
  }
  if (query.facets.monochrome !== undefined) {
    clauses.push("is_monochrome = ?");
    params.push(query.facets.monochrome ? 1 : 0);
  }
  if (query.facets.lightness) {
    clauses.push("dominant_l >= ? AND dominant_l <= ?");
    params.push(query.facets.lightness.min, query.facets.lightness.max);
  }
  if (query.selection.type === "ids") {
    if (query.selection.ids.length === 0) clauses.push("0 = 1");
    else if (query.selection.ids.length <= ID_PARAM_LIMIT) {
      clauses.push(`id IN (${placeholders(query.selection.ids.length)})`);
      params.push(...query.selection.ids);
    }
  }
  if (query.selection.type === "wedge") {
    const from = ((query.selection.startHue % 360) + 360) % 360;
    const to = ((query.selection.endHue % 360) + 360) % 360;
    if (from <= to) {
      clauses.push("dominant_h >= ? AND dominant_h <= ?");
      params.push(from, to);
    } else {
      clauses.push("(dominant_h >= ? OR dominant_h <= ?)");
      params.push(from, to);
    }
  }
  return { sql: clauses.length === 0 ? "" : ` WHERE ${clauses.join(" AND ")}`, params };
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export type LibraryStore = ReturnType<typeof createStore>;
