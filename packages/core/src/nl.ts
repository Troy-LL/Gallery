import type { Facets } from "./schema.js";

export type FilterChip = {
  id: string;
  label: string;
  facets: Facets;
};

const KEYWORDS: { pattern: RegExp; chip: FilterChip }[] = [
  { pattern: /\bportraits?\b/i, chip: { id: "orientation:portrait", label: "portrait", facets: { orientation: ["portrait"] } } },
  { pattern: /\blandscapes?\b/i, chip: { id: "orientation:landscape", label: "landscape", facets: { orientation: ["landscape"] } } },
  { pattern: /\bsquares?\b/i, chip: { id: "orientation:square", label: "square", facets: { orientation: ["square"] } } },
  { pattern: /\bmonochrome\b|\bblack and white\b/i, chip: { id: "monochrome", label: "monochrome", facets: { monochrome: true } } },
  { pattern: /\bwarm\b/i, chip: { id: "temperature:warm", label: "warm", facets: { temperature: ["warm"] } } },
  { pattern: /\bcool\b/i, chip: { id: "temperature:cool", label: "cool", facets: { temperature: ["cool"] } } },
  { pattern: /\bsharp\b/i, chip: { id: "sharpness:sharp", label: "sharp", facets: { sharpness: ["sharp"] } } },
  { pattern: /\bblurry\b/i, chip: { id: "sharpness:blurry", label: "blurry", facets: { sharpness: ["blurry"] } } },
  { pattern: /\bfavorites?\b/i, chip: { id: "favorites", label: "favorites", facets: { favorites: true } } },
  { pattern: /\bnever used\b/i, chip: { id: "never-used", label: "never used", facets: { neverUsed: true } } },
];

export function keywordChips(text: string): FilterChip[] {
  const chips: FilterChip[] = [];
  for (const entry of KEYWORDS) {
    if (entry.pattern.test(text)) chips.push(entry.chip);
  }
  return chips;
}

export type NlAnswer = {
  questionId: string;
  type: "noul" | "choice" | "score" | "box";
  value: string | number | boolean | null;
  probability?: number;
  confidence?: number | null;
};

const CHOICE_FACETS: Record<string, (value: string) => Facets | null> = {
  time_of_day: (value) => ({ tags: [{ questionId: "time_of_day", equals: value, minProbability: 0.6 }] }),
  setting: (value) => ({ tags: [{ questionId: "setting", equals: value, minProbability: 0.6 }] }),
  subject_type: (value) => ({ tags: [{ questionId: "subject_type", equals: value, minProbability: 0.6 }] }),
};

export function answersToChips(answers: NlAnswer[]): FilterChip[] {
  const chips: FilterChip[] = [];
  for (const answer of answers) {
    const confidence = answer.confidence ?? answer.probability ?? 0;
    if (confidence < 0.6) continue;
    if (answer.type === "choice" && typeof answer.value === "string") {
      const build = CHOICE_FACETS[answer.questionId];
      const facets = build?.(answer.value) ?? null;
      if (!facets) continue;
      chips.push({ id: `${answer.questionId}:${answer.value}`, label: `${answer.questionId} ${answer.value}`, facets });
    }
    if (answer.type === "noul" && answer.value === true && answer.questionId === "has_text") {
      chips.push({
        id: "has_text",
        label: "has text",
        facets: { tags: [{ questionId: "has_text", equals: true, minProbability: 0.6 }] },
      });
    }
  }
  return chips;
}

export function mergeFacets(chips: FilterChip[]): Facets {
  const facets: Facets = {};
  for (const chip of chips) {
    if (chip.facets.orientation) facets.orientation = [...(facets.orientation ?? []), ...chip.facets.orientation];
    if (chip.facets.temperature) facets.temperature = [...(facets.temperature ?? []), ...chip.facets.temperature];
    if (chip.facets.sharpness) facets.sharpness = [...(facets.sharpness ?? []), ...chip.facets.sharpness];
    if (chip.facets.monochrome !== undefined) facets.monochrome = chip.facets.monochrome;
    if (chip.facets.favorites) facets.favorites = true;
    if (chip.facets.neverUsed) facets.neverUsed = true;
    if (chip.facets.tags) facets.tags = [...(facets.tags ?? []), ...chip.facets.tags];
  }
  return facets;
}
