import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LibraryRecord } from "@gallery/core";

export function sidecarDocument(record: LibraryRecord): { json: string; xmp: string } {
  const json = JSON.stringify(
    {
      hash: record.hash,
      status: record.status,
      rating: record.rating,
      tags: record.answers.map((answer) => ({ question_id: answer.question_id, value: answer.value })),
      dominant_hex: record.dominant_hex,
      locked_fields: record.locked_fields,
    },
    null,
    2,
  );
  const status = escapeXml(record.status);
  const rating = record.rating ?? 0;
  const xmp = `<?xml version="1.0"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description xmlns:gallery="https://gallery.local/ns/1.0/" gallery:status="${status}" gallery:rating="${rating}"/>
  </rdf:RDF>
</x:xmpmeta>
`;
  return { json, xmp };
}

const createdDirectories = new Set<string>();

export function writeSidecar(directory: string, record: LibraryRecord): void {
  if (!createdDirectories.has(directory)) {
    mkdirSync(directory, { recursive: true });
    createdDirectories.add(directory);
  }
  const doc = sidecarDocument(record);
  writeFileSync(join(directory, `${record.hash}.json`), doc.json);
  writeFileSync(join(directory, `${record.hash}.xmp`), doc.xmp);
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
}
