import sharp from "sharp";

type OnnxSession = {
  inputNames: string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: ArrayLike<number> }>>;
};

type OnnxRuntime = {
  InferenceSession: { create(path: string): Promise<OnnxSession> };
  Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown;
};

const sessions = new Map<string, Promise<{ runtime: OnnxRuntime; session: OnnxSession }>>();

export async function embedWithOnnx(modelPath: string, bytes: Uint8Array): Promise<number[]> {
  if (!modelPath) throw new Error("CLIP model path is not set");
  const { runtime, session } = await loadSession(modelPath);
  const raw = await sharp(bytes).resize(224, 224, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const floats = new Float32Array(3 * 224 * 224);
  for (let index = 0; index < 224 * 224; index += 1) {
    floats[index] = ((raw[index * 3] ?? 0) / 255 - 0.48145466) / 0.26862954;
    floats[224 * 224 + index] = ((raw[index * 3 + 1] ?? 0) / 255 - 0.4578275) / 0.26130258;
    floats[2 * 224 * 224 + index] = ((raw[index * 3 + 2] ?? 0) / 255 - 0.40821073) / 0.27577711;
  }
  const inputName = session.inputNames[0];
  if (!inputName) throw new Error("CLIP model has no inputs");
  const outputs = await session.run({ [inputName]: new runtime.Tensor("float32", floats, [1, 3, 224, 224]) });
  const first = Object.values(outputs)[0];
  if (!first) throw new Error("CLIP model returned no embedding");
  const vector = Array.from(first.data);
  const norm = Math.hypot(...vector);
  return norm === 0 ? vector : vector.map((value) => value / norm);
}

function loadSession(modelPath: string): Promise<{ runtime: OnnxRuntime; session: OnnxSession }> {
  const cached = sessions.get(modelPath);
  if (cached) return cached;
  const pending = openSession(modelPath);
  sessions.set(modelPath, pending);
  pending.catch(() => sessions.delete(modelPath));
  return pending;
}

async function openSession(modelPath: string): Promise<{ runtime: OnnxRuntime; session: OnnxSession }> {
  const importer = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<OnnxRuntime>;
  let runtime: OnnxRuntime;
  try {
    runtime = await importer("onnxruntime-node");
  } catch {
    throw new Error("onnxruntime-node is not installed");
  }
  return { runtime, session: await runtime.InferenceSession.create(modelPath) };
}
