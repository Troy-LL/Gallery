import { boxIou, percentile, type Answer, type SubjectBox } from "@gallery/core";

export type GoldImage = {
  id: string;
  labels: Record<string, string | boolean | number>;
  subject_box: { top: number; bottom: number; left: number; right: number } | null;
};

export type Observation = {
  id: string;
  answers: Answer[];
  secondPass: Answer[];
  rawSubjectBox: SubjectBox | null;
  keptSubjectBox: SubjectBox | null;
  inputTokens: number;
  latencyMs: number;
};

export type GalleryEvalReport = {
  n: number;
  model_version: string;
  vocab_version: string;
  "gallery_eval.tag_f1": { macro: number; per_question: Record<string, number>; thresholds: Record<string, number> };
  "gallery_eval.subject_box_iou": { mean: number; false_box_suppression_rate: number };
  "gallery_eval.order_flip_disagreement": number;
  "gallery_eval.uncertain_rate": number;
  "gallery_eval.input_tokens_mean": number;
  "gallery_eval.input_tokens_p95": number;
  "gallery_eval.latency_ms_p50": number;
  "gallery_eval.latency_ms_p95": number;
};

export function assertSmokeFloor(count: number, mock: boolean): void {
  if (!mock && count < 50) throw new Error(`smoke gate needs n >= 50, got ${count}`);
}

export function scoreGold(gold: GoldImage[], observations: Observation[], model: string, vocab: string): GalleryEvalReport {
  const byId = new Map(observations.map((item) => [item.id, item]));
  const questionIds = [...new Set(gold.flatMap((item) => Object.keys(item.labels)))];
  const perQuestion: Record<string, number> = {};
  const thresholds: Record<string, number> = {};
  for (const questionId of questionIds) {
    const pairs = gold.flatMap((item) => {
      const observed = byId.get(item.id);
      const answer = observed?.answers.find((entry) => entry.question_id === questionId);
      if (!observed || !answer || !(questionId in item.labels)) return [];
      return [{ gold: item.labels[questionId], answer }];
    });
    const best = bestF1(pairs);
    perQuestion[questionId] = best.f1;
    thresholds[questionId] = best.threshold;
  }
  const f1Values = Object.values(perQuestion);
  const macro = f1Values.length === 0 ? 0 : f1Values.reduce((sum, value) => sum + value, 0) / f1Values.length;
  const ious: number[] = [];
  let falseBoxRaw = 0;
  let falseBoxSuppressed = 0;
  for (const item of gold) {
    const observed = byId.get(item.id);
    if (!observed) continue;
    if (!item.subject_box) {
      if (observed.rawSubjectBox) {
        falseBoxRaw += 1;
        if (!observed.keptSubjectBox) falseBoxSuppressed += 1;
      }
      continue;
    }
    const goldBox = { ...item.subject_box, confidence: null };
    ious.push(observed.keptSubjectBox ? boxIou(goldBox, observed.keptSubjectBox) : 0);
  }
  let lowChoices = 0;
  let flips = 0;
  let uncertain = 0;
  let answerCount = 0;
  for (const observed of observations) {
    for (const answer of observed.answers) {
      answerCount += 1;
      if (answer.type === "noul" && (answer.probability ?? 0) >= 0.4 && (answer.probability ?? 0) <= 0.6) uncertain += 1;
      if ((answer.type === "choice" || answer.type === "score") && (answer.confidence ?? 1) < 0.6) uncertain += 1;
      if (answer.type !== "choice" || (answer.confidence ?? 1) >= 0.6) continue;
      lowChoices += 1;
      const second = observed.secondPass.find((item) => item.question_id === answer.question_id);
      if (second && second.value !== answer.value) flips += 1;
    }
  }
  const tokens = observations.map((item) => item.inputTokens);
  const latency = observations.map((item) => item.latencyMs);
  return {
    n: gold.length,
    model_version: model,
    vocab_version: vocab,
    "gallery_eval.tag_f1": { macro, per_question: perQuestion, thresholds },
    "gallery_eval.subject_box_iou": {
      mean: ious.length === 0 ? 0 : ious.reduce((sum, value) => sum + value, 0) / ious.length,
      false_box_suppression_rate: falseBoxRaw === 0 ? 1 : falseBoxSuppressed / falseBoxRaw,
    },
    "gallery_eval.order_flip_disagreement": lowChoices === 0 ? 0 : flips / lowChoices,
    "gallery_eval.uncertain_rate": answerCount === 0 ? 0 : uncertain / answerCount,
    "gallery_eval.input_tokens_mean": tokens.length === 0 ? 0 : tokens.reduce((sum, value) => sum + value, 0) / tokens.length,
    "gallery_eval.input_tokens_p95": tokens.length === 0 ? 0 : percentile(tokens, 95),
    "gallery_eval.latency_ms_p50": latency.length === 0 ? 0 : percentile(latency, 50),
    "gallery_eval.latency_ms_p95": latency.length === 0 ? 0 : percentile(latency, 95),
  };
}

function bestF1(pairs: { gold: string | boolean | number | undefined; answer: Answer }[]): { f1: number; threshold: number } {
  if (pairs.length === 0) return { f1: 0, threshold: 0.5 };
  let best = { f1: 0, threshold: 0.5 };
  for (let step = 1; step <= 19; step += 1) {
    const threshold = step / 20;
    const f1 = f1At(pairs, threshold);
    if (f1 >= best.f1) best = { f1, threshold };
  }
  return best;
}

function f1At(pairs: { gold: string | boolean | number | undefined; answer: Answer }[], threshold: number): number {
  const first = pairs[0]?.answer;
  if (!first) return 0;
  if (first.type === "noul" || typeof pairs[0]?.gold === "boolean") {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (const pair of pairs) {
      const predicted = (pair.answer.probability ?? 0) >= threshold;
      const gold = pair.gold === true;
      if (predicted && gold) tp += 1;
      else if (predicted && !gold) fp += 1;
      else if (!predicted && gold) fn += 1;
    }
    if (tp + fp + fn === 0) return 1;
    if (tp === 0) return 0;
    return (2 * tp) / (2 * tp + fp + fn);
  }
  const labels = [...new Set(pairs.map((pair) => String(pair.gold)))];
  const scores = labels.map((label) => {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (const pair of pairs) {
      const confidence = pair.answer.confidence ?? pair.answer.probability ?? 0;
      const predicted = confidence >= threshold && String(pair.answer.value) === label;
      const gold = String(pair.gold) === label;
      if (predicted && gold) tp += 1;
      else if (predicted && !gold) fp += 1;
      else if (!predicted && gold) fn += 1;
    }
    if (tp + fp + fn === 0) return 1;
    if (tp === 0) return 0;
    return (2 * tp) / (2 * tp + fp + fn);
  });
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}
