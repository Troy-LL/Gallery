import { platformConfigSchema, type PlatformConfig, type SubjectBox } from "./schema.js";

export type CropRect = { x: number; y: number; width: number; height: number };

export type PreviewImage = {
  width: number;
  height: number;
  subjectBox: SubjectBox | null;
};

export type PreviewBadge = { label: string; detail: string } | null;

export type PreviewLayout = {
  platform: PlatformConfig["id"];
  surfaceId: string;
  aspect: number;
  crops: CropRect[];
  caption: string;
  seeMore: boolean;
  badge: PreviewBadge;
  previewLabel: "Preview";
};

export function parsePlatformConfig(raw: unknown): PlatformConfig {
  return platformConfigSchema.parse(raw);
}

export function coverCrop(srcWidth: number, srcHeight: number, aspect: number): CropRect {
  const srcAspect = srcWidth / srcHeight;
  if (srcAspect > aspect) {
    const width = srcHeight * aspect;
    return { x: (srcWidth - width) / 2, y: 0, width, height: srcHeight };
  }
  const height = srcWidth / aspect;
  return { x: 0, y: (srcHeight - height) / 2, width: srcWidth, height };
}

export function subjectPreservingCrop(srcWidth: number, srcHeight: number, aspect: number, box: SubjectBox): CropRect {
  const crop = coverCrop(srcWidth, srcHeight, aspect);
  const boxCenterX = ((box.left + box.right) / 2) * srcWidth;
  const boxCenterY = ((box.top + box.bottom) / 2) * srcHeight;
  const x = clamp(boxCenterX - crop.width / 2, 0, srcWidth - crop.width);
  const y = clamp(boxCenterY - crop.height / 2, 0, srcHeight - crop.height);
  return { x, y, width: crop.width, height: crop.height };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function boxIntersectionArea(crop: CropRect, box: SubjectBox, srcWidth: number, srcHeight: number): number {
  const left = Math.max(crop.x, box.left * srcWidth);
  const right = Math.min(crop.x + crop.width, box.right * srcWidth);
  const top = Math.max(crop.y, box.top * srcHeight);
  const bottom = Math.min(crop.y + crop.height, box.bottom * srcHeight);
  if (right <= left || bottom <= top) return 0;
  return (right - left) * (bottom - top);
}

export function subjectBoxArea(box: SubjectBox, srcWidth: number, srcHeight: number): number {
  return Math.max(0, box.right - box.left) * srcWidth * Math.max(0, box.bottom - box.top) * srcHeight;
}

export function subjectIsCropped(crop: CropRect, box: SubjectBox, srcWidth: number, srcHeight: number): boolean {
  const area = subjectBoxArea(box, srcWidth, srcHeight);
  if (area <= 0) return false;
  return boxIntersectionArea(crop, box, srcWidth, srcHeight) / area < 0.99;
}

export function truncateCaption(text: string, rules: PlatformConfig["caption_rules"]): { text: string; seeMore: boolean; reason: "chars" | "lines" | null; at: number } {
  const lines = text.split("\n");
  if (lines.length > rules.max_lines) {
    return { text: lines.slice(0, rules.max_lines).join("\n"), seeMore: true, reason: "lines", at: rules.max_lines };
  }
  if (text.length > rules.max_chars) {
    return { text: text.slice(0, rules.max_chars), seeMore: true, reason: "chars", at: rules.max_chars };
  }
  return { text, seeMore: false, reason: null, at: 0 };
}

export function layoutPreview(input: {
  config: PlatformConfig;
  surfaceId: string;
  images: PreviewImage[];
  caption: string;
}): PreviewLayout {
  const surface = input.config.surfaces.find((item) => item.id === input.surfaceId);
  if (!surface) throw new Error(`unknown surface ${input.surfaceId}`);
  const crops = input.images.map((image) => coverCrop(image.width, image.height, surface.aspect));
  const caption = truncateCaption(input.caption, input.config.caption_rules);
  const croppedIndex = input.images.findIndex((image, index) => {
    const crop = crops[index];
    return image.subjectBox && crop ? subjectIsCropped(crop, image.subjectBox, image.width, image.height) : false;
  });
  let badge: PreviewBadge = null;
  if (croppedIndex >= 0) {
    badge = { label: "subject cropped", detail: `Image ${croppedIndex + 1} loses part of the subject box in this crop.` };
  } else if (caption.seeMore && caption.reason === "lines") {
    badge = { label: `caption cut at line ${caption.at}`, detail: input.config.caption_rules.see_more_label };
  } else if (caption.seeMore && caption.reason === "chars") {
    badge = { label: `caption cut at ${caption.at} characters`, detail: input.config.caption_rules.see_more_label };
  }
  return {
    platform: input.config.id,
    surfaceId: surface.id,
    aspect: surface.aspect,
    crops,
    caption: caption.text,
    seeMore: caption.seeMore,
    badge,
    previewLabel: "Preview",
  };
}

export function boxIou(left: SubjectBox, right: SubjectBox): number {
  const x1 = Math.max(left.left, right.left);
  const y1 = Math.max(left.top, right.top);
  const x2 = Math.min(left.right, right.right);
  const y2 = Math.min(left.bottom, right.bottom);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaLeft = Math.max(0, left.right - left.left) * Math.max(0, left.bottom - left.top);
  const areaRight = Math.max(0, right.right - right.left) * Math.max(0, right.bottom - right.top);
  const union = areaLeft + areaRight - intersection;
  if (union <= 0) return 0;
  return intersection / union;
}
