// @vitest-environment happy-dom
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { afterEach, describe, expect, it, vi } from "vitest";
import { syntheticRecord, type Swatch } from "@gallery/core";
import { Lightbox } from "../src/lightbox/Lightbox";
import type { PublicRecord } from "../src/api/client";

type FetchCall = { url: string; body: unknown };

const INK = "#141413";

function swatch(hex: string, weight: number): Swatch {
  return { hex, h: 0, s: 0, l: 0.5, oklch: { L: 0.5, C: 0, h: 0 }, weight };
}

function record(id: string): PublicRecord {
  const { embedding: _embedding, ...photo } = syntheticRecord(1, {
    id,
    status: "shortlisted",
    notes: "soft light",
    source_credit: "Ada",
    rating: 1,
    answers: [{ question_id: "mood", type: "noul", value: "calm", probability: 0.82 }],
    palette: [swatch("#111111", 0.5), swatch("#f6f5f2", 0.3), swatch("#777777", 0.2)],
    dominant_hex: "#111111",
  });
  return photo;
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const raw = hex.replace("#", "");
  const r = channel(Number.parseInt(raw.slice(0, 2), 16));
  const g = channel(Number.parseInt(raw.slice(2, 4), 16));
  const b = channel(Number.parseInt(raw.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const lighter = Math.max(luminance(a), luminance(b));
  const darker = Math.min(luminance(a), luminance(b));
  return (lighter + 0.05) / (darker + 0.05);
}

function parseColor(value: string): string | null {
  const hex = value.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex?.[1]) return `#${hex[1].toLowerCase()}`;
  const rgb = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!rgb?.[1] || !rgb[2] || !rgb[3]) return null;
  return `#${[rgb[1], rgb[2], rgb[3]].map((part) => Number(part).toString(16).padStart(2, "0")).join("")}`;
}

let host: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  host?.remove();
  host = null;
  root = null;
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

function mockFetch(photo: PublicRecord) {
  const calls: FetchCall[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    if (url === "/api/curation") return Response.json({ record: photo });
    if (url === `/api/similar/${photo.id}`) return Response.json({ matches: [{ id: "img-9", score: 0.91 }] });
    if (url === "/api/posts") {
      return Response.json({
        posts: [
          {
            id: "post-1",
            platform: "instagram",
            posted_at: "2026-02-01T00:00:00.000Z",
            image_ids: [photo.id],
            caption_notes: "noon light",
          },
          {
            id: "post-2",
            platform: "linkedin",
            posted_at: "2026-03-01T00:00:00.000Z",
            image_ids: ["other-photo"],
            caption_notes: "someone else",
          },
        ],
      });
    }
    if (url === "/api/collections" && init?.method === "POST") return Response.json({ ok: true });
    if (url === "/api/collections") {
      return Response.json({ collections: [{ id: "col-1", name: "Summer", image_ids: [photo.id] }] });
    }
    return new Response("missing", { status: 404 });
  }));
  return calls;
}

async function renderLightbox(photo: PublicRecord, props?: { onClose?: () => void; onNavigate?: (id: string) => void }) {
  const calls = mockFetch(photo);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const previous = record("photo-0");
  const next = record("photo-2");
  await act(async () => {
    root?.render(createElement(Lightbox, {
      record: photo,
      records: [previous, photo, next],
      onClose: props?.onClose ?? vi.fn(),
      onNavigate: props?.onNavigate ?? vi.fn(),
      onChange: vi.fn(),
    }));
  });
  return calls;
}

describe("lightbox", () => {
  it("renders a modal dialog with the photo, status, readable swatches, and tags", async () => {
    const photo = record("photo-1");
    await renderLightbox(photo);
    const dialog = host?.querySelector("[role='dialog']");
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(host?.querySelector(".lightbox-scrim")).toBeTruthy();
    const img = dialog?.querySelector("img");
    expect(img?.style.maxHeight).toBe("70vh");
    expect(dialog?.querySelector("[aria-label='Previous photo']")).toBeTruthy();
    expect(dialog?.querySelector("[aria-label='Next photo']")).toBeTruthy();
    expect(dialog?.querySelector("select")).toBeNull();
    const radios = [...(dialog?.querySelectorAll("[role='radiogroup'][aria-label='Status'] [role='radio']") ?? [])];
    expect(radios.map((radio) => radio.textContent)).toEqual([
      "unreviewed",
      "shortlisted",
      "approved",
      "rejected",
      "archived",
    ]);
    expect(radios.find((radio) => radio.textContent === "shortlisted")?.getAttribute("aria-checked")).toBe("true");
    for (const swatchHex of ["#111111", "#f6f5f2", "#777777"]) {
      const button = dialog?.querySelector(`button[aria-label='Use ${swatchHex}']`) as HTMLButtonElement | null;
      expect(button).toBeTruthy();
      const background = parseColor(button?.style.backgroundColor ?? "");
      const foreground = parseColor(button?.style.color ?? "");
      const onChip = Boolean(background && foreground && button?.textContent?.includes(swatchHex) && contrast(background, foreground) >= 4.5);
      const caption = button?.parentElement?.querySelector(".swatch-hex") as HTMLElement | null;
      const underChip = caption?.textContent === swatchHex && parseColor(caption.style.color) === INK;
      expect(onChip || underChip).toBe(true);
    }
    expect(host?.textContent).toContain("calm");
    expect(host?.textContent).toContain("0.82");
    expect((host?.querySelector("textarea[aria-label='Notes']") as HTMLTextAreaElement | null)?.value).toBe("soft light");
    expect((host?.querySelector("input[aria-label='Credit']") as HTMLInputElement | null)?.value).toBe("Ada");
    expect(host?.textContent).toContain("img-9");
    expect(host?.textContent).toContain("instagram");
    expect(host?.textContent).toContain("noon light");
    expect(host?.textContent).not.toContain("someone else");
    expect(host?.textContent).toContain("Summer");
  });

  it("moves focus into the dialog and restores it on close", async () => {
    const opener = document.createElement("button");
    opener.textContent = "Open";
    document.body.append(opener);
    opener.focus();
    const photo = record("photo-1");
    await renderLightbox(photo);
    const dialog = host?.querySelector("[role='dialog']");
    expect(dialog?.contains(document.activeElement)).toBe(true);
    await act(async () => {
      root?.unmount();
    });
    root = null;
    expect(document.activeElement).toBe(opener);
  });

  it("closes on escape and navigates with arrows and edge buttons", async () => {
    const photo = record("photo-1");
    const onClose = vi.fn();
    const onNavigate = vi.fn();
    await renderLightbox(photo, { onClose, onNavigate });
    await act(async () => {
      (host?.querySelector("[aria-label='Previous photo']") as HTMLButtonElement).click();
    });
    expect(onNavigate).toHaveBeenCalledWith("photo-0");
    await act(async () => {
      (host?.querySelector("[aria-label='Next photo']") as HTMLButtonElement).click();
    });
    expect(onNavigate).toHaveBeenCalledWith("photo-2");
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    });
    expect(onNavigate).toHaveBeenCalledWith("photo-0");
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("saves favorite, status, tags, notes, and credit through curation patches", async () => {
    const photo = record("photo-1");
    const calls = await renderLightbox(photo);
    await act(async () => {
      (host?.querySelector("button[aria-pressed='true']") as HTMLButtonElement).click();
    });
    await act(async () => {
      const approved = [...(host?.querySelectorAll("[role='radio']") ?? [])].find((radio) => radio.textContent === "approved");
      (approved as HTMLButtonElement).click();
    });
    await act(async () => {
      (host?.querySelector("button[aria-label='Remove calm']") as HTMLButtonElement).click();
    });
    const form = host?.querySelector("form[aria-label='Add tag']") as HTMLFormElement;
    const question = form.querySelector("input[aria-label='Tag question']") as HTMLInputElement;
    const value = form.querySelector("input[aria-label='Tag value']") as HTMLInputElement;
    question.value = "setting";
    value.value = "outdoor";
    await act(async () => {
      form.requestSubmit();
    });
    const notes = host?.querySelector("textarea[aria-label='Notes']") as HTMLTextAreaElement;
    notes.value = "updated note";
    await act(async () => {
      notes.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    const credit = host?.querySelector("input[aria-label='Credit']") as HTMLInputElement;
    credit.value = "Grace";
    await act(async () => {
      credit.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    const patches = calls.filter((call) => call.url === "/api/curation").map((call) => call.body);
    expect(patches).toContainEqual({ id: "photo-1", patch: { rating: 0 } });
    expect(patches).toContainEqual({ id: "photo-1", patch: { status: "approved" } });
    expect(patches).toContainEqual({
      id: "photo-1",
      patch: { answer: { question_id: "mood", type: "noul", value: null, probability: 0.82 } },
    });
    expect(patches).toContainEqual({
      id: "photo-1",
      patch: { answer: { question_id: "setting", type: "choice", value: "outdoor" } },
    });
    expect(patches).toContainEqual({ id: "photo-1", patch: { notes: "updated note" } });
    expect(patches).toContainEqual({ id: "photo-1", patch: { source_credit: "Grace" } });
    for (const body of patches) {
      expect(JSON.stringify(body)).not.toContain("locked_fields");
    }
  });

  it("creates a collection that includes the open photo", async () => {
    const photo = record("photo-1");
    const calls = await renderLightbox(photo);
    const form = host?.querySelector("form[aria-label='Add collection']") as HTMLFormElement;
    const name = form.querySelector("input[aria-label='Collection name']") as HTMLInputElement;
    name.value = "Winter";
    await act(async () => {
      form.requestSubmit();
    });
    const created = calls.find((call) => call.url === "/api/collections" && (call.body as { name?: string } | undefined)?.name === "Winter");
    const body = created?.body as { id: string; name: string; image_ids: string[] };
    expect(body.name).toBe("Winter");
    expect(body.image_ids).toEqual(["photo-1"]);
    expect(body.id.length).toBeGreaterThan(0);
    expect(host?.textContent).toContain("Winter");
  });
});
