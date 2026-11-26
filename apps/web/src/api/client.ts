import type {
  Facets,
  FilterChip,
  LibraryQuery,
  LibraryRecord,
  LibrarySummary,
  Palette,
  PlatformConfig,
  Selection,
} from "@gallery/core";

export type { LibrarySummary };
export type PublicRecord = LibrarySummary;
export type DetailRecord = Omit<LibraryRecord, "embedding">;

export type QueryResponse = {
  total: number;
  matched: number;
  maxChroma: number;
  records: PublicRecord[];
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) throw new Error(await response.text());
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("application/json")) return (await response.json()) as T;
  return (await response.blob()) as T;
}

export function queryLibrary(query: LibraryQuery, signal?: AbortSignal): Promise<QueryResponse> {
  return api("/api/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(query),
    ...(signal ? { signal } : {}),
  });
}

export function getImage(id: string, signal?: AbortSignal): Promise<{ record: DetailRecord }> {
  return api(`/api/images/${encodeURIComponent(id)}`, signal ? { signal } : undefined);
}

export function emptyQuery(facets: Facets = {}, selection: Selection = { type: "all" }): LibraryQuery {
  return { selection, facets };
}

export type PlatformResponse = { platforms: PlatformConfig[] };

export function loadPlatforms(): Promise<PlatformResponse> {
  return api("/api/platforms");
}

export function estimate(count: number): Promise<{ label: string; usd: number; images: number }> {
  return api("/api/estimate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ count }) });
}

export function seedLibrary(count: number): Promise<{ seeded: number }> {
  return api("/api/dev/seed", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ count }) });
}

export function naturalLanguage(text: string): Promise<{ chips: FilterChip[] }> {
  return api("/api/nl", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
}

export function saveCuration(id: string, patch: unknown): Promise<{ record: DetailRecord }> {
  return api("/api/curation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, patch }) });
}

export function listPalettes(): Promise<{ palettes: Palette[] }> {
  return api("/api/palettes");
}

export function savePalette(palette: Palette): Promise<{ ok: boolean }> {
  return api("/api/palettes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(palette) });
}
