import { hammingHex, type LibraryRecord } from "@gallery/core";
import type { LibraryStore } from "@gallery/storage";

export type CommitAction = "inserted" | "duplicate" | "upgraded" | "attached";

export async function commitRecord(store: LibraryStore, incoming: LibraryRecord): Promise<{ action: CommitAction; record: LibraryRecord }> {
  const byHash = await store.getByHash(incoming.hash);
  if (byHash) {
    if (incoming.source_ref && !byHash.source_ref) {
      return { action: "attached", record: await store.update({ ...byHash, source_ref: incoming.source_ref }) };
    }
    return { action: "duplicate", record: byHash };
  }
  if (incoming.taken_at) {
    const peers = await store.listByTakenAt(incoming.taken_at);
    const peer = peers.find((item) => hammingHex(item.phash, incoming.phash) <= 6);
    if (peer) {
      if (incoming.file_size > peer.file_size) {
        const keepColor = peer.locked_fields.includes("dominant_hex");
        const upgraded: LibraryRecord = {
          ...incoming,
          id: peer.id,
          rating: peer.rating,
          status: peer.status,
          notes: peer.notes,
          source_credit: peer.source_credit,
          used_count: peer.used_count,
          last_used_at: peer.last_used_at,
          locked_fields: peer.locked_fields,
          answers: peer.answers,
          has_text: peer.has_text,
          subject_box: peer.subject_box,
          model_version: peer.model_version,
          analyzed_at: peer.analyzed_at,
          vocab_version: peer.vocab_version,
          needs_tags: peer.needs_tags,
          source_ref: incoming.source_ref ?? peer.source_ref,
          ...(keepColor
            ? {
                dominant_hex: peer.dominant_hex,
                dominant_h: peer.dominant_h,
                dominant_s: peer.dominant_s,
                dominant_l: peer.dominant_l,
                dominant_oklch: peer.dominant_oklch,
                palette: peer.palette,
              }
            : {}),
        };
        return { action: "upgraded", record: await store.update(upgraded) };
      }
      if (incoming.source_ref && !peer.source_ref) {
        return { action: "attached", record: await store.update({ ...peer, source_ref: incoming.source_ref }) };
      }
      return { action: "duplicate", record: peer };
    }
  }
  const inserted = await store.upsert(incoming);
  return { action: inserted.status === "inserted" ? "inserted" : "duplicate", record: inserted.record };
}
