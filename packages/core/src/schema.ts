import { z } from "zod";

export const SOURCE_TYPES = ["google_photos", "upload", "inbox"] as const;
export const ORIENTATIONS = ["portrait", "landscape", "square"] as const;
export const ASPECT_BUCKETS = ["1:1", "4:5", "9:16", "16:9", "3:2", "other"] as const;
export const STATUSES = ["unreviewed", "shortlisted", "approved", "rejected", "archived"] as const;
export const TEMPERATURES = ["warm", "neutral", "cool"] as const;
export const SHARPNESS = ["sharp", "soft", "blurry"] as const;
export const RESOLUTION_TIERS = ["ready", "low"] as const;
export const VOCAB_KINDS = ["yesno", "choice", "score"] as const;

export const modelVersionSchema = z
  .string()
  .min(1)
  .refine((value) => value !== "jev-latest" && !value.endsWith("-latest"), "model_version must be an explicit pin");

export const oklchSchema = z.object({
  L: z.number().min(0).max(1),
  C: z.number().min(0).max(0.5),
  h: z.number().min(0).max(360),
});

export const labSchema = z.object({
  L: z.number(),
  a: z.number(),
  b: z.number(),
});

export const swatchSchema = z.object({
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  h: z.number().min(0).max(360),
  s: z.number().min(0).max(1),
  l: z.number().min(0).max(1),
  oklch: oklchSchema,
  weight: z.number().min(0).max(1),
});

export const subjectBoxSchema = z
  .object({
    top: z.number().min(0).max(1),
    bottom: z.number().min(0).max(1),
    left: z.number().min(0).max(1),
    right: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1).nullable(),
  })
  .refine((box) => box.top <= box.bottom && box.left <= box.right, "subject box edges are inverted");

export const answerSchema = z.object({
  question_id: z.string().min(1),
  type: z.enum(["noul", "choice", "score", "box"]),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  probability: z.number().min(0).max(1).optional(),
  probabilities: z.record(z.string(), z.number()).optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
});

export const analysisSchema = z.object({
  image_id: z.string().min(1),
  model_version: modelVersionSchema,
  analyzed_at: z.string().min(1),
  vocab_version: z.string().min(1),
  answers: z.array(answerSchema),
  has_text: z.boolean(),
  subject_box: subjectBoxSchema.nullable(),
  locked_fields: z.array(z.string()),
  needs_tags: z.boolean(),
});

export const libraryRecordSchema = z.object({
  id: z.string().min(1),
  file_path: z.string(),
  thumbnail_path: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  orientation: z.enum(ORIENTATIONS),
  aspect_ratio: z.enum(ASPECT_BUCKETS),
  file_size: z.number().int().nonnegative(),
  hash: z.string().min(1),
  phash: z.string().min(1),
  created_at: z.string().min(1),
  added_at: z.string().min(1),
  media_type: z.string().min(1),
  source_type: z.enum(SOURCE_TYPES),
  source_ref: z.string().nullable(),
  embedding: z.array(z.number()).nullable(),
  taken_at: z.string().nullable(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  place_name: z.string().nullable(),
  camera: z.string().nullable(),
  lens: z.string().nullable(),
  dominant_hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  dominant_h: z.number().min(0).max(360),
  dominant_s: z.number().min(0).max(1),
  dominant_l: z.number().min(0).max(1),
  dominant_oklch: oklchSchema,
  palette: z.array(swatchSchema).min(1),
  avg_luminance: z.number(),
  contrast: z.number(),
  temperature: z.enum(TEMPERATURES),
  is_monochrome: z.boolean(),
  saturation: z.number(),
  sharpness: z.enum(SHARPNESS),
  negative_space: z.number().min(0).max(1),
  composition: z.array(z.string()),
  resolution_tier: z.enum(RESOLUTION_TIERS),
  model_version: modelVersionSchema.nullable(),
  analyzed_at: z.string().nullable(),
  vocab_version: z.string().nullable(),
  answers: z.array(answerSchema),
  has_text: z.boolean(),
  subject_box: subjectBoxSchema.nullable(),
  locked_fields: z.array(z.string()),
  needs_tags: z.boolean(),
  rating: z.number().int().min(0).max(5).nullable(),
  status: z.enum(STATUSES),
  notes: z.string().nullable(),
  source_credit: z.string().nullable(),
  used_count: z.number().int().nonnegative(),
  last_used_at: z.string().nullable(),
});

export const settingsSchema = z
  .object({
    model_version: modelVersionSchema,
    vocab_version: z.string().min(1),
    endpoint_url: z.string().url(),
    monthly_cap_usd: z.number().nonnegative(),
    price_per_million_input_tokens: z.number().positive(),
    mean_input_tokens: z.number().positive(),
    subject_visible_threshold: z.number().min(0).max(1),
    working_copy_px: z.union([z.literal(2048), z.literal(1600)]),
    storage_cap_bytes: z.number().positive(),
    postgres_cap_bytes: z.number().positive(),
  })
  .strict();

export const pointSchema = z.object({ x: z.number(), y: z.number() });

export const selectionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("all") }),
  z.object({ type: z.literal("ids"), ids: z.array(z.string()) }),
  z.object({ type: z.literal("neighborhood"), lab: labSchema, tolerance: z.number().positive() }),
  z.object({ type: z.literal("wedge"), startHue: z.number(), endHue: z.number() }),
  z.object({ type: z.literal("lasso"), points: z.array(pointSchema).min(3) }),
  z.object({ type: z.literal("ring"), inner: z.number().min(0).max(1), outer: z.number().min(0).max(1) }),
  z.object({ type: z.literal("brush"), lab: labSchema, radius: z.number().positive() }),
]);

export const tagPredicateSchema = z.object({
  questionId: z.string().min(1),
  equals: z.union([z.string(), z.boolean(), z.number()]),
  minProbability: z.number().min(0).max(1),
});

export const facetsSchema = z
  .object({
    orientation: z.array(z.enum(ORIENTATIONS)).optional(),
    aspect_ratio: z.array(z.enum(ASPECT_BUCKETS)).optional(),
    sharpness: z.array(z.enum(SHARPNESS)).optional(),
    temperature: z.array(z.enum(TEMPERATURES)).optional(),
    monochrome: z.boolean().optional(),
    lightness: z.object({ min: z.number(), max: z.number() }).optional(),
    status: z.array(z.enum(STATUSES)).optional(),
    favorites: z.boolean().optional(),
    neverUsed: z.boolean().optional(),
    needsTags: z.boolean().optional(),
    tags: z.array(tagPredicateSchema).optional(),
  })
  .strict();

export const libraryQuerySchema = z.object({
  selection: selectionSchema,
  facets: facetsSchema,
});

export const platformConfigSchema = z
  .object({
    id: z.enum(["instagram", "linkedin", "facebook"]),
    version: z.string().min(1),
    last_verified: z.string().min(1),
    export_px: z.number().int().positive(),
    surfaces: z
      .array(
        z
          .object({
            id: z.string().min(1),
            label: z.string().min(1),
            aspect: z.number().positive(),
            kind: z.enum(["single", "carousel", "grid", "document"]),
            min_images: z.number().int().positive(),
            max_images: z.number().int().positive(),
            columns: z.number().int().positive().optional(),
          })
          .strict(),
      )
      .min(1),
    frame_tokens: z
      .object({
        preview_label: z.literal("Preview"),
        avatar: z.literal("placeholder"),
        name: z.string().min(1),
      })
      .strict(),
    media_rules: z.object({ fit: z.literal("cover") }).strict(),
    caption_rules: z
      .object({
        max_chars: z.number().int().positive(),
        max_lines: z.number().int().positive(),
        see_more_label: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export const vocabularyQuestionSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(VOCAB_KINDS),
    name: z.string().min(1),
    definition: z.string().min(1),
    example_image_ids: z.array(z.string()).max(5),
    options: z.array(z.object({ label: z.string().min(1), description: z.string() })).optional(),
    rubric: z.array(z.string()).min(2).optional(),
  })
  .strict();

export const vocabularyFileSchema = z
  .object({
    version: z.string().min(1),
    questions: z.array(vocabularyQuestionSchema).min(1),
  })
  .strict();

export const paletteSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  selection_shape: selectionSchema,
  swatches: z.array(swatchSchema),
});

export const postSchema = z.object({
  id: z.string().min(1),
  platform: z.enum(["instagram", "linkedin", "facebook"]),
  posted_at: z.string().min(1),
  image_ids: z.array(z.string()).min(1),
  caption_notes: z.string().nullable(),
});

export const collectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  image_ids: z.array(z.string()),
});

export const curationPatchSchema = z
  .object({
    rating: z.number().int().min(0).max(5).nullable().optional(),
    status: z.enum(STATUSES).optional(),
    notes: z.string().nullable().optional(),
    source_credit: z.string().nullable().optional(),
    answer: answerSchema.optional(),
    dominant_hex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  })
  .strict();

export type Oklch = z.infer<typeof oklchSchema>;
export type Lab = z.infer<typeof labSchema>;
export type Swatch = z.infer<typeof swatchSchema>;
export type SubjectBox = z.infer<typeof subjectBoxSchema>;
export type Answer = z.infer<typeof answerSchema>;
export type Analysis = z.infer<typeof analysisSchema>;
export type LibraryRecord = z.infer<typeof libraryRecordSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Selection = z.infer<typeof selectionSchema>;
export type Facets = z.infer<typeof facetsSchema>;
export type LibraryQuery = z.infer<typeof libraryQuerySchema>;
export type PlatformConfig = z.infer<typeof platformConfigSchema>;
export type VocabularyFile = z.infer<typeof vocabularyFileSchema>;
export type Palette = z.infer<typeof paletteSchema>;
export type Post = z.infer<typeof postSchema>;
export type Collection = z.infer<typeof collectionSchema>;
export type CurationPatch = z.infer<typeof curationPatchSchema>;
export type SourceType = (typeof SOURCE_TYPES)[number];
export type Orientation = (typeof ORIENTATIONS)[number];
export type AspectBucket = (typeof ASPECT_BUCKETS)[number];
export type Status = (typeof STATUSES)[number];
export type Temperature = (typeof TEMPERATURES)[number];
export type SharpnessLevel = (typeof SHARPNESS)[number];
export type Point = z.infer<typeof pointSchema>;

export function assertPinnedModel(model: string): string {
  return modelVersionSchema.parse(model);
}

export function parseSettings(raw: unknown): Settings {
  return settingsSchema.parse(raw);
}

export function parseLibraryRecord(raw: unknown): LibraryRecord {
  return libraryRecordSchema.parse(raw);
}
