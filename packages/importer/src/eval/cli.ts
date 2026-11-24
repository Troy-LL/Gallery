import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createTypeSafeVision, photoAsset } from "../vision/typesafe.js";
import type { VisionClient, VisionResult } from "../vision/questions.js";
import { loadManifest, loadVocab, runSmoke } from "./run.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] !== "smoke") {
    console.error("usage: gallery-eval smoke --manifest <file> [--mock]");
    process.exitCode = 1;
    return;
  }
  const manifestFlag = argv.indexOf("--manifest");
  const manifestPath = manifestFlag >= 0 ? argv[manifestFlag + 1] : undefined;
  if (!manifestPath) throw new Error("missing --manifest");
  const mock = argv.includes("--mock");
  const manifest = loadManifest(resolve(manifestPath));
  const vocab = loadVocab(resolve(root, "prompts/v1/vocabulary.json"));
  const client = mock ? mockClient(manifest) : liveClient(manifest.model_version);
  const report = await runSmoke({ manifest, vocab, client, mock, place: mock ? undefined : photoAsset });
  const serialized = JSON.stringify(report, null, 2);
  if (serialized.includes("TYPESAFE") || serialized.includes("base64")) throw new Error("eval report leaked a secret");
  const outDir = resolve(root, "evals");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const outPath = resolve(outDir, `${stamp}-${manifest.model_version}-${manifest.vocab_version}.json`);
  writeFileSync(outPath, serialized);
  console.log(outPath);
}

function liveClient(model: string): VisionClient {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) throw new Error("TYPESAFE_API_KEY is not set");
  return createTypeSafeVision({ apiKey, model });
}

function mockClient(manifest: ReturnType<typeof loadManifest>): VisionClient {
  return {
    async systemOne(): Promise<VisionResult> {
      const answers: VisionResult["answers"] = {};
      const labels = manifest.images[0]?.labels ?? {};
      for (const [key, value] of Object.entries(labels)) {
        if (typeof value === "boolean") answers[key] = { type: "noul", noul: value ? 0.9 : 0.1 };
        else if (typeof value === "number") answers[key] = { type: "score", score: value, confidence: 0.9 };
        else answers[key] = { type: "choice", choice: value, confidence: 0.9, probabilities: { [value]: 0.9 } };
      }
      answers.subject_visible = { type: "noul", noul: manifest.images[0]?.subject_box ? 0.9 : 0.1 };
      if (manifest.images[0]?.subject_box) {
        answers.subject_box = { type: "box", box: manifest.images[0].subject_box, confidence: 0.8 };
      }
      return { model: manifest.model_version, answers, usage: { input_tokens: 100, output_tokens: 10 } };
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
