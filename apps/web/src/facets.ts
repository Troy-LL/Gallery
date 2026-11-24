import type { Facets, FilterChip } from "@gallery/core";

type TagPredicate = NonNullable<Facets["tags"]>[number];

export function withTagStrictness(nextFacets: Facets, minProbability: number): Facets {
  if (!nextFacets.tags?.length) return nextFacets;
  return {
    ...nextFacets,
    tags: nextFacets.tags.map((tag) => ({ ...tag, minProbability })),
  };
}

function tagKey(tag: TagPredicate): string {
  return `${tag.questionId}:${String(tag.equals)}`;
}

export function removeChipFromFacets(
  current: Facets,
  removed: Facets,
  remainingChips: FilterChip[],
): Facets {
  const next: Facets = { ...current };

  if (removed.tags?.length) {
    const removeKeys = new Set(removed.tags.map(tagKey));
    const keepFromChips = new Set(remainingChips.flatMap((chip) => (chip.facets.tags ?? []).map(tagKey)));
    const nextTags = (next.tags ?? []).filter((tag) => {
      const key = tagKey(tag);
      if (!removeKeys.has(key)) return true;
      return keepFromChips.has(key);
    });
    if (nextTags.length > 0) next.tags = nextTags;
    else delete next.tags;
  }

  function dropRemoved<T extends string>(current: T[] | undefined, remove: T[] | undefined): T[] | undefined {
    if (!remove?.length || !current?.length) return current;
    const removeSet = new Set(remove);
    const filtered = current.filter((value) => !removeSet.has(value));
    return filtered.length ? filtered : undefined;
  }

  const orientation = dropRemoved(next.orientation, removed.orientation);
  if (orientation) next.orientation = orientation;
  else if (removed.orientation) delete next.orientation;

  const aspect_ratio = dropRemoved(next.aspect_ratio, removed.aspect_ratio);
  if (aspect_ratio) next.aspect_ratio = aspect_ratio;
  else if (removed.aspect_ratio) delete next.aspect_ratio;

  const sharpness = dropRemoved(next.sharpness, removed.sharpness);
  if (sharpness) next.sharpness = sharpness;
  else if (removed.sharpness) delete next.sharpness;

  const temperature = dropRemoved(next.temperature, removed.temperature);
  if (temperature) next.temperature = temperature;
  else if (removed.temperature) delete next.temperature;

  const status = dropRemoved(next.status, removed.status);
  if (status) next.status = status;
  else if (removed.status) delete next.status;

  const booleanKeys = ["monochrome", "favorites", "neverUsed", "needsTags"] as const;
  for (const key of booleanKeys) {
    if (removed[key] === undefined) continue;
    if (next[key] !== removed[key]) continue;
    const stillSet = remainingChips.some((chip) => chip.facets[key] === removed[key]);
    if (!stillSet) delete next[key];
  }

  if (removed.lightness && next.lightness) {
    const same =
      next.lightness.min === removed.lightness.min && next.lightness.max === removed.lightness.max;
    const stillSet = remainingChips.some((chip) => {
      const lightness = chip.facets.lightness;
      if (!lightness) return false;
      return lightness.min === removed.lightness?.min && lightness.max === removed.lightness?.max;
    });
    if (same && !stillSet) delete next.lightness;
  }

  return next;
}