import { assertPinnedModel, type Answer, type SubjectBox, type VocabularyFile } from "@gallery/core";

export type VisionQuestion = {
  type: "noul" | "choice" | "score" | "box";
  instructions: string;
  criteria?: Record<string, string> | string[];
};

export type RawVisionAnswer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: "score"; score: number; confidence: number; probabilities?: Record<string, number> }
  | { type: "box"; box: { top: number; bottom: number; left: number; right: number }; confidence: number | null };

export type VisionResult = {
  model: string;
  answers: Record<string, RawVisionAnswer>;
  usage: { input_tokens: number | null; output_tokens: number | null };
};

export interface VisionClient {
  systemOne(request: { state: unknown; questions: Record<string, VisionQuestion>; model: string }): Promise<VisionResult>;
}

export function buildQuestions(vocab: VocabularyFile, reverseChoices: boolean): Record<string, VisionQuestion> {
  const questions: Record<string, VisionQuestion> = {};
  for (const question of vocab.questions) {
    if (question.example_image_ids.length > 5) throw new Error(`too many examples for ${question.id}`);
    if (question.kind === "yesno") {
      questions[question.id] = { type: "noul", instructions: question.definition };
      continue;
    }
    if (question.kind === "choice") {
      const options = [...(question.options ?? [])];
      if (reverseChoices) options.reverse();
      const criteria: Record<string, string> = {};
      for (const option of options) criteria[option.label] = option.description;
      questions[question.id] = { type: "choice", instructions: question.definition, criteria };
      continue;
    }
    if (question.kind === "score") {
      questions[question.id] = { type: "score", instructions: question.definition, criteria: question.rubric ?? [] };
      continue;
    }
    const unreachable: never = question.kind;
    throw new Error(unreachable);
  }
  questions.subject_box = { type: "box", instructions: "The main subject, if one is visible." };
  return questions;
}

export function mapAnswers(raw: Record<string, RawVisionAnswer>): Answer[] {
  return Object.entries(raw)
    .filter(([id]) => id !== "subject_box")
    .map(([id, answer]) => {
      switch (answer.type) {
        case "noul":
          return { question_id: id, type: "noul" as const, value: answer.noul >= 0.5, probability: answer.noul };
        case "choice":
          return {
            question_id: id,
            type: "choice" as const,
            value: answer.choice,
            confidence: answer.confidence,
            probabilities: answer.probabilities,
            probability: answer.probabilities[answer.choice],
          };
        case "score":
          return {
            question_id: id,
            type: "score" as const,
            value: answer.score,
            confidence: answer.confidence,
            probabilities: answer.probabilities,
          };
        case "box":
          return { question_id: id, type: "box" as const, value: null, confidence: answer.confidence };
        default: {
          const unreachable: never = answer;
          throw new Error(`unexpected answer ${(unreachable as { type: string }).type}`);
        }
      }
    });
}

export function keptSubjectBox(raw: Record<string, RawVisionAnswer>, threshold: number): SubjectBox | null {
  const visible = raw.subject_visible;
  const box = raw.subject_box;
  const probability = visible && visible.type === "noul" ? visible.noul : 0;
  if (probability < threshold || !box || box.type !== "box") return null;
  return { ...box.box, confidence: box.confidence };
}

export function assertRequestModel(model: string): string {
  return assertPinnedModel(model);
}
