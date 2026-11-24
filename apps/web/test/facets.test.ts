import { describe, expect, it } from "vitest";
import type { FilterChip } from "@gallery/core";
import { removeChipFromFacets, withTagStrictness } from "../src/facets";

describe("facet helpers", () => {
  it("keeps facet toggles when an NL chip is removed", () => {
    const facets = { orientation: ["portrait" as const], temperature: ["warm" as const] };
    const chip = {
      id: "temperature:warm",
      label: "warm",
      facets: { temperature: ["warm" as const] },
    } satisfies FilterChip;
    const next = removeChipFromFacets(facets, chip.facets, []);
    expect(next.orientation).toEqual(["portrait"]);
    expect(next.temperature).toBeUndefined();
  });

  it("writes tags minProbability when strictness changes", () => {
    const chip = {
      id: "has_text",
      label: "has text",
      facets: {
        tags: [{ questionId: "has_text", equals: true, minProbability: 0.5 }],
      },
    } satisfies FilterChip;
    const updated = withTagStrictness(chip.facets, 0.85);
    expect(updated.tags?.[0]?.minProbability).toBe(0.85);
  });
});