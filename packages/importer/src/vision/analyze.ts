import { assertPinnedModel, type Analysis, type VocabularyFile } from "@gallery/core";
import { buildQuestions, keptSubjectBox, mapAnswers, type RawVisionAnswer, type VisionClient } from "./questions.js";

export type AnalyzeRequest = {
  client: VisionClient;
  model: string;
  vocab: VocabularyFile;
  photo: Uint8Array;
  examples?: Uint8Array[];
  reverseChoices?: boolean;
  threshold?: number;
  place?: (bytes: Uint8Array) => unknown;
};

export async function analyzeImage(input: AnalyzeRequest): Promise<{
  analysis: Omit<Analysis, "image_id" | "locked_fields">;
  inputTokens: number;
  rawSubjectBox: Analysis["subject_box"];
  state: { photo: unknown; examples: unknown[] };
}> {
  const model = assertPinnedModel(input.model);
  const place = input.place ?? ((bytes: Uint8Array) => bytes);
  const examples = (input.examples ?? []).slice(0, 5).map((item) => place(item));
  const state = { photo: place(input.photo), examples };
  const questions = buildQuestions(input.vocab, input.reverseChoices ?? false);
  const result = await input.client.systemOne({ state, questions, model });
  if (result.model.endsWith("-latest")) throw new Error("response model is not pinned");
  const threshold = input.threshold ?? 0.5;
  const hasText = result.answers.has_text?.type === "noul" ? result.answers.has_text.noul >= 0.5 : false;
  return {
    state,
    inputTokens: result.usage.input_tokens ?? 0,
    rawSubjectBox: rawBox(result.answers.subject_box),
    analysis: {
      model_version: model,
      analyzed_at: new Date().toISOString(),
      vocab_version: input.vocab.version,
      answers: mapAnswers(result.answers),
      has_text: hasText,
      subject_box: keptSubjectBox(result.answers, threshold),
      needs_tags: false,
    },
  };
}

function rawBox(answer: RawVisionAnswer | undefined): Analysis["subject_box"] {
  if (!answer || answer.type !== "box") return null;
  return { ...answer.box, confidence: answer.confidence };
}
