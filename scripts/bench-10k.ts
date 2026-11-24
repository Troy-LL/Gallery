import { knn, matchLibrary, percentile, syntheticRecord } from "@gallery/core";

const records = Array.from({ length: 10_000 }, (_, index) =>
  syntheticRecord(index, { embedding: Array.from({ length: 32 }, (_, dim) => ((index + 1) * (dim + 1) % 17) / 17 - 0.5) }),
);
const query = {
  selection: { type: "wedge" as const, startHue: 350, endHue: 20 },
  facets: { orientation: ["portrait" as const] },
};
for (let index = 0; index < 5; index += 1) matchLibrary(records, query);
const filterSamples: number[] = [];
for (let index = 0; index < 20; index += 1) {
  const started = performance.now();
  matchLibrary(records, query);
  filterSamples.push(performance.now() - started);
}
const rows = records.flatMap((record) => (record.embedding ? [{ id: record.id, embedding: record.embedding }] : []));
const probe = rows[0]?.embedding ?? [];
for (let index = 0; index < 3; index += 1) knn(probe, rows, 12);
const knnSamples: number[] = [];
for (let index = 0; index < 20; index += 1) {
  const started = performance.now();
  knn(probe, rows, 12);
  knnSamples.push(performance.now() - started);
}
const filterP95 = percentile(filterSamples, 95);
const knnP95 = percentile(knnSamples, 95);
const heap = process.memoryUsage().heapUsed;
console.log(JSON.stringify({ filterP95, knnP95, heap }));
if (filterP95 > 100 || knnP95 > 40 || heap > 512 * 1024 * 1024) {
  console.error("10k budget missed");
  process.exitCode = 1;
}
