export type HarmonyKind = "analogous" | "complementary" | "triadic";

export function harmonyHues(hue: number, kind: HarmonyKind): number[] {
  const h = ((hue % 360) + 360) % 360;
  switch (kind) {
    case "analogous":
      return [h, (h + 30) % 360, (h + 330) % 360];
    case "complementary":
      return [h, (h + 180) % 360];
    case "triadic":
      return [h, (h + 120) % 360, (h + 240) % 360];
    default: {
      const unreachable: never = kind;
      throw new Error(unreachable);
    }
  }
}

export function hueDelta(left: number, right: number): number {
  const delta = Math.abs(left - right) % 360;
  return delta > 180 ? 360 - delta : delta;
}

export function matchHarmony(rows: { id: string; hue: number }[], sourceId: string, hue: number, kind: HarmonyKind, tolerance = 12): string[] {
  const targets = harmonyHues(hue, kind);
  return rows
    .filter((row) => row.id !== sourceId && targets.some((target) => hueDelta(row.hue, target) <= tolerance))
    .map((row) => row.id);
}
