import { estimateSpendUsd, monthKey, wouldExceedCap, type Answer, type Settings, type VocabularyFile } from "@gallery/core";
import type { LibraryStore } from "@gallery/storage";
import { analyzeImage } from "../vision/analyze.js";
import type { VisionClient } from "../vision/questions.js";
import { withStatusRetry } from "./retry.js";

export type QueueItem = {
  imageId: string;
  hash: string;
  photo: Uint8Array;
  privacy: boolean;
};

export type QueueSummary = {
  tagged: number;
  cached: number;
  failed: number;
  skipped: number;
  paused: boolean;
};

export async function runTagQueue(
  items: QueueItem[],
  deps: {
    store: LibraryStore;
    client: VisionClient;
    settings: Settings;
    vocab: VocabularyFile;
    now: Date;
    sleep: (ms: number) => Promise<void>;
    place?: (bytes: Uint8Array) => unknown;
    writeSidecar?: (imageId: string) => Promise<void>;
    concurrency?: number;
  },
): Promise<QueueSummary> {
  const concurrency = deps.concurrency ?? 1;
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("concurrency must be a positive integer");
  const summary: QueueSummary = { tagged: 0, cached: 0, failed: 0, skipped: 0, paused: false };
  const month = monthKey(deps.now);
  const estimateUsd = estimateSpendUsd(1, deps.settings.mean_input_tokens, deps.settings.price_per_million_input_tokens);
  const holds = new Set<{ usd: number }>();
  let stopped = false;
  let gate: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(task: () => Promise<T>): Promise<T> => {
    const run = gate.then(task);
    gate = run.catch(() => undefined);
    return run;
  };
  const reserve = (hold: { usd: number }, usd: number): Promise<boolean> =>
    exclusive(async () => {
      const spent = await deps.store.getSpend(month);
      let heldUsd = 0;
      for (const other of holds) heldUsd += other.usd;
      if (wouldExceedCap(spent.usd + heldUsd, usd, deps.settings.monthly_cap_usd)) return false;
      hold.usd += usd;
      holds.add(hold);
      return true;
    });
  const pause = async (): Promise<void> => {
    stopped = true;
    summary.paused = true;
    await deps.store.setQueuePaused(true, "monthly cap");
  };

  const tagOne = async (item: QueueItem): Promise<void> => {
    if (item.privacy) {
      summary.skipped += 1;
      return;
    }
    const cached = await deps.store.getTagCache(item.hash, deps.settings.model_version, deps.settings.vocab_version);
    if (cached) {
      await deps.store.saveAnalysis(item.imageId, { ...cached, image_id: item.imageId });
      summary.cached += 1;
      return;
    }
    const hold = { usd: 0 };
    if (!(await reserve(hold, estimateUsd))) {
      await pause();
      return;
    }
    try {
      const first = await withStatusRetry(
        () =>
          analyzeImage({
            client: deps.client,
            model: deps.settings.model_version,
            vocab: deps.vocab,
            photo: item.photo,
            threshold: deps.settings.subject_visible_threshold,
            place: deps.place,
          }),
        { retries: 4, baseMs: 20, sleep: deps.sleep },
      );
      let answers = first.analysis.answers;
      let tokens = first.inputTokens;
      hold.usd = estimateSpendUsd(1, tokens, deps.settings.price_per_million_input_tokens);
      let capped = false;
      const low = answers.filter((answer) => answer.type === "choice" && (answer.confidence ?? 1) < 0.6);
      if (low.length > 0) {
        if (!(await reserve(hold, estimateUsd))) {
          capped = true;
          await pause();
        } else {
          const second = await analyzeImage({
            client: deps.client,
            model: deps.settings.model_version,
            vocab: deps.vocab,
            photo: item.photo,
            reverseChoices: true,
            threshold: deps.settings.subject_visible_threshold,
            place: deps.place,
          });
          answers = preferAgreed(answers, second.analysis.answers);
          tokens += second.inputTokens;
        }
      }
      const analysis = {
        ...first.analysis,
        image_id: item.imageId,
        answers,
        locked_fields: [],
      };
      await deps.store.saveAnalysis(item.imageId, analysis);
      await deps.store.putTagCache(item.hash, deps.settings.model_version, deps.settings.vocab_version, analysis);
      const usd = estimateSpendUsd(1, tokens, deps.settings.price_per_million_input_tokens);
      await exclusive(async () => {
        await deps.store.addSpend(month, tokens, usd);
        holds.delete(hold);
      });
      if (capped) return;
      if (deps.writeSidecar) await deps.writeSidecar(item.imageId);
      summary.tagged += 1;
    } catch {
      holds.delete(hold);
      const current = await deps.store.get(item.imageId);
      if (current) await deps.store.update({ ...current, needs_tags: true });
      summary.failed += 1;
    }
  };

  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (!stopped && cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      if (item) await tagOne(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, worker));
  const spent = await deps.store.getSpend(month);
  if (spent.usd >= deps.settings.monthly_cap_usd) {
    summary.paused = true;
    await deps.store.setQueuePaused(true, "monthly cap");
  } else if (!summary.paused) {
    await deps.store.setQueuePaused(false, null);
  }
  return summary;
}

function preferAgreed(first: Answer[], second: Answer[]): Answer[] {
  return first.map((answer) => {
    if (answer.type !== "choice") return answer;
    const other = second.find((item) => item.question_id === answer.question_id);
    if (!other || other.type !== "choice") return answer;
    if (other.value === answer.value) return answer;
    const firstConfidence = answer.confidence ?? 0;
    const secondConfidence = other.confidence ?? 0;
    return secondConfidence > firstConfidence ? other : answer;
  });
}
