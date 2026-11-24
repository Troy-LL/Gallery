import { hexToRgb, rgbToHsl, rgbToOklab, oklabToOklch, swatchFromRgb } from "./color.js";
import type { Analysis, Answer, LibraryRecord, Swatch } from "./schema.js";

export function mergeAnalysis(previous: Analysis | null, next: Analysis): Analysis {
  if (!previous) return next;
  const locked = new Set(previous.locked_fields);
  const answers = next.answers.map((answer) => {
    if (!locked.has(answer.question_id)) return answer;
    return previous.answers.find((item) => item.question_id === answer.question_id) ?? answer;
  });
  for (const answer of previous.answers) {
    if (!locked.has(answer.question_id)) continue;
    if (answers.some((item) => item.question_id === answer.question_id)) continue;
    answers.push(answer);
  }
  return {
    ...next,
    answers,
    has_text: locked.has("has_text") ? previous.has_text : next.has_text,
    subject_box: locked.has("subject_box") ? previous.subject_box : next.subject_box,
    locked_fields: [...previous.locked_fields],
    needs_tags: next.needs_tags,
  };
}

export function applyAnswerLock(record: LibraryRecord, answer: Answer): LibraryRecord {
  const answers = record.answers.filter((item) => item.question_id !== answer.question_id);
  answers.push(answer);
  const locked = new Set(record.locked_fields);
  locked.add(answer.question_id);
  return {
    ...record,
    answers,
    locked_fields: [...locked],
    has_text: answer.question_id === "has_text" && typeof answer.value === "boolean" ? answer.value : record.has_text,
  };
}

export function applyDominantHex(record: LibraryRecord, hex: string): LibraryRecord {
  const existing = record.palette.find((swatch) => swatch.hex.toLowerCase() === hex.toLowerCase());
  const swatch = existing ?? swatchFromHex(hex, 1);
  const palette = [swatch, ...record.palette.filter((item) => item.hex.toLowerCase() !== swatch.hex.toLowerCase())];
  const weightTotal = palette.reduce((sum, item) => sum + item.weight, 0) || 1;
  const normalized: Swatch[] = palette.map((item) => ({ ...item, weight: item.weight / weightTotal }));
  const dominant = normalized[0] ?? swatch;
  const locked = new Set(record.locked_fields);
  locked.add("dominant_hex");
  return {
    ...record,
    dominant_hex: dominant.hex,
    dominant_h: dominant.h,
    dominant_s: dominant.s,
    dominant_l: dominant.l,
    dominant_oklch: dominant.oklch,
    palette: normalized,
    locked_fields: [...locked],
  };
}

function swatchFromHex(hex: string, weight: number): Swatch {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const oklch = oklabToOklch(rgbToOklab(rgb.r, rgb.g, rgb.b));
  return swatchFromRgb(rgb, weight).hex === hex.toLowerCase()
    ? { ...swatchFromRgb(rgb, weight), h: hsl.h, s: hsl.s, l: hsl.l, oklch }
    : { hex: hex.toLowerCase(), h: hsl.h, s: hsl.s, l: hsl.l, oklch, weight };
}

export function analysisFromRecord(record: LibraryRecord): Analysis | null {
  if (!record.model_version || !record.analyzed_at || !record.vocab_version) return null;
  return {
    image_id: record.id,
    model_version: record.model_version,
    analyzed_at: record.analyzed_at,
    vocab_version: record.vocab_version,
    answers: record.answers,
    has_text: record.has_text,
    subject_box: record.subject_box,
    locked_fields: record.locked_fields,
    needs_tags: record.needs_tags,
  };
}

export function withAnalysis(record: LibraryRecord, analysis: Analysis): LibraryRecord {
  return {
    ...record,
    model_version: analysis.model_version,
    analyzed_at: analysis.analyzed_at,
    vocab_version: analysis.vocab_version,
    answers: analysis.answers,
    has_text: analysis.has_text,
    subject_box: analysis.subject_box,
    locked_fields: analysis.locked_fields,
    needs_tags: analysis.needs_tags,
  };
}
