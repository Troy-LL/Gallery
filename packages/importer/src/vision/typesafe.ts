import { image, TypeSafeClient } from "@typesafe-ai/sdk";
import { assertPinnedModel } from "@gallery/core";
import { RetryableStatus } from "../queue/retry.js";
import type { VisionClient, VisionResult } from "./questions.js";

export const DANGER_HEADER = "TypeSafe-Danger-Zone-Images";

export function createTypeSafeVision(options: {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  baseURL?: string;
}): VisionClient {
  const model = assertPinnedModel(options.model);
  const client = new TypeSafeClient({
    apiKey: options.apiKey,
    defaultModel: model,
    baseURL: options.baseURL,
    fetch: options.fetchImpl,
    compression: false,
    defaultHeaders: { [DANGER_HEADER]: "true" },
  });
  return {
    async systemOne(request) {
      try {
        const result = await client.systemOne({
          state: request.state as never,
          questions: request.questions as never,
          model,
        });
        return result as VisionResult;
      } catch (error) {
        const status = typeof error === "object" && error && "status" in error ? Number((error as { status: number }).status) : 0;
        if (status === 429 || status === 529) throw new RetryableStatus(status);
        throw error;
      }
    },
  };
}

export function photoAsset(bytes: Uint8Array): unknown {
  return image(bytes);
}
