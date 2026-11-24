export type JevFit = {
  width: number;
  height: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
};

const MIN_SIDE = 280;
const MAX_SIDE = 1568;
const MAX_PIXELS = 2_460_000;

export function targetJevSize(width: number, height: number): JevFit {
  let w = Math.max(1, Math.round(width));
  let h = Math.max(1, Math.round(height));
  const longest = Math.max(w, h);
  if (longest > MAX_SIDE) {
    const scale = MAX_SIDE / longest;
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
  }
  if (Math.min(w, h) < MIN_SIDE) {
    const scale = MIN_SIDE / Math.min(w, h);
    const grownW = Math.round(w * scale);
    const grownH = Math.round(h * scale);
    if (Math.max(grownW, grownH) <= MAX_SIDE) {
      w = grownW;
      h = grownH;
    }
  }
  if (w * h > MAX_PIXELS) {
    const scale = Math.sqrt(MAX_PIXELS / (w * h));
    w = Math.max(1, Math.floor(w * scale));
    h = Math.max(1, Math.floor(h * scale));
  }
  const padX = Math.max(0, MIN_SIDE - w);
  const padY = Math.max(0, MIN_SIDE - h);
  return {
    width: w,
    height: h,
    padLeft: Math.floor(padX / 2),
    padRight: padX - Math.floor(padX / 2),
    padTop: Math.floor(padY / 2),
    padBottom: padY - Math.floor(padY / 2),
  };
}

export function fittedJevPixels(fit: JevFit): { width: number; height: number } {
  return { width: fit.width + fit.padLeft + fit.padRight, height: fit.height + fit.padTop + fit.padBottom };
}

export function isBaselineJpeg(bytes: Uint8Array): boolean {
  let baseline = false;
  let progressive = false;
  for (let index = 0; index < bytes.length - 1; index += 1) {
    if (bytes[index] !== 0xff) continue;
    const marker = bytes[index + 1];
    if (marker === 0xc0) baseline = true;
    if (marker === 0xc2) progressive = true;
  }
  return baseline && !progressive;
}
