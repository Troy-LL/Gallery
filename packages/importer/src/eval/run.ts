import { readFileSync } from "node:fs";
import { vocabularyFileSchema, type VocabularyFile } from "@gallery/core";
import { analyzeImage } from "../vision/analyze.js";
import type { VisionClient } from "../vision/questions.js";
import { assertSmokeFloor, scoreGold, type GalleryEvalReport, type GoldImage, type Observation } from "./score.js";

export type GoldManifest = {
  model_version: string;
  vocab_version: string;
  images: (GoldImage & { path?: string })[];
};

export async function runSmoke(input: {
  manifest: GoldManifest;
  vocab: VocabularyFile;
  client: VisionClient;
  mock: boolean;
  readImage?: (path: string) => Promise<Uint8Array>;
  place?: (bytes: Uint8Array) => unknown;
}): Promise<GalleryEvalReport> {
  assertSmokeFloor(input.manifest.images.length, input.mock);
  if (input.vocab.version !== input.manifest.vocab_version) throw new Error("vocab_version does not match the manifest");
  const observations: Observation[] = [];
  for (const image of input.manifest.images) {
    const photo = input.readImage && image.path ? await input.readImage(image.path) : new Uint8Array([1, 2, 3, 4]);
    const started = Date.now();
    const first = await analyzeImage({
      client: input.client,
      model: input.manifest.model_version,
      vocab: input.vocab,
      photo,
      place: input.place,
    });
    const low = first.analysis.answers.some((answer) => answer.type === "choice" && (answer.confidence ?? 1) < 0.6);
    const second = low
      ? await analyzeImage({
          client: input.client,
          model: input.manifest.model_version,
          vocab: input.vocab,
          photo,
          reverseChoices: true,
          place: input.place,
        })
      : null;
    observations.push({
      id: image.id,
      answers: first.analysis.answers,
      secondPass: second?.analysis.answers ?? [],
      rawSubjectBox: first.rawSubjectBox,
      keptSubjectBox: first.analysis.subject_box,
      inputTokens: first.inputTokens,
      latencyMs: Date.now() - started,
    });
  }
  return scoreGold(input.manifest.images, observations, input.manifest.model_version, input.manifest.vocab_version);
}

export function loadManifest(path: string): GoldManifest {
  return JSON.parse(readFileSync(path, "utf8")) as GoldManifest;
}

export function loadVocab(path: string): VocabularyFile {
  return vocabularyFileSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}
