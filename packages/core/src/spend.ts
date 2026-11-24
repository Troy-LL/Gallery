export function estimateSpendUsd(imageCount: number, meanTokens: number, pricePerMillion: number): number {
  return (imageCount * meanTokens * pricePerMillion) / 1_000_000;
}

export function formatSpend(imageCount: number, usd: number): string {
  const rounded = usd < 0.01 ? usd.toFixed(4) : usd.toFixed(2);
  return `${imageCount} images, about $${rounded}`;
}

export function wouldExceedCap(spentUsd: number, nextUsd: number, capUsd: number): boolean {
  return spentUsd + nextUsd > capUsd;
}

export function monthKey(now: Date): string {
  return now.toISOString().slice(0, 7);
}

export function acceptUpload(usedBytes: number, incomingBytes: number, capBytes: number): boolean {
  return usedBytes + incomingBytes <= capBytes;
}

export function workingCopyPx(usedBytes: number, capBytes: number): 2048 | 1600 {
  if (capBytes <= 0) return 1600;
  return usedBytes / capBytes >= 0.8 ? 1600 : 2048;
}

export function percentile(samples: number[], p: number): number {
  if (samples.length === 0) throw new Error("no samples");
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? sorted[sorted.length - 1] ?? 0;
}
