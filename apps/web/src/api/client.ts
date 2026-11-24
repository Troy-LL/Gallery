import type { Facets, FilterChip, LibraryQuery, LibraryRecord, PlatformConfig, Selection } from "@gallery/core";

export type PublicRecord = Omit<LibraryRecord, "embedding">;

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

export function queryLibrary(query: LibraryQuery): Promise<QueryResponse> {
  return api("/api/query", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(query) });
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

export function saveCuration(id: string, patch: unknown): Promise<{ record: PublicRecord }> {
  return api("/api/curation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, patch }) });
}
