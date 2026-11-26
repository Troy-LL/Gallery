// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { parsePlatformConfig, type PlatformConfig } from "@gallery/core";
import type { PublicRecord } from "../src/api/client";
import { Preview } from "../src/preview/Preview";

function platform(id: PlatformConfig["id"], maxLines: number): PlatformConfig {
  return parsePlatformConfig({
    id,
    version: "1",
    last_verified: "2026-11-24",
    export_px: 1080,
    surfaces: [
      { id: "feed", label: "Feed", aspect: 1, kind: "single", min_images: 1, max_images: 1 },
      { id: "pair", label: "Pair", aspect: 1, kind: "grid", min_images: 2, max_images: 2, columns: 2 },
    ],
    frame_tokens: { preview_label: "Preview", avatar: "placeholder", name: "Member" },
    media_rules: { fit: "cover" },
    caption_rules: { max_chars: 400, max_lines: maxLines, see_more_label: "see more" },
  });
}

const platforms = [platform("instagram", 1), platform("linkedin", 4), platform("facebook", 4)];

const records = [
  {
    id: "wide",
    width: 2000,
    height: 1000,
    subject_box: { top: 0.2, bottom: 0.8, left: 0, right: 0.08, confidence: 0.9 },
  },
  {
    id: "square",
    width: 1000,
    height: 1000,
    subject_box: { top: 0, bottom: 1, left: 0, right: 1, confidence: 1 },
  },
] as PublicRecord[];

const caption = "Alpha line\nBeta line";

function renderPreview(overrides: Partial<Parameters<typeof Preview>[0]> = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const props = {
    records,
    orderedIds: ["wide", "square"],
    platforms,
    caption,
    onCaption: vi.fn(),
    onMove: vi.fn(),
    theme: "light" as const,
    focus: "compare" as const,
    platformId: "instagram",
    onPlatform: vi.fn(),
    onTheme: vi.fn(),
    onFocus: vi.fn(),
    ...overrides,
  };
  act(() => {
    createRoot(host).render(createElement(Preview, props));
  });
  return { host, props };
}

function buttonByName(host: HTMLElement, name: string) {
  return [...host.querySelectorAll("button")].find((button) => button.textContent?.trim() === name);
}

describe("post preview", () => {
  it("compares three platforms with caption cutoff, crop badge, and shared controls", () => {
    const { host, props } = renderPreview({ theme: "dark" });
    const section = host.querySelector("section");
    expect(section?.getAttribute("data-theme")).toBe("dark");
    expect(host.querySelectorAll("article")).toHaveLength(3);
    expect(buttonByName(host, "Earlier")).toBeUndefined();
    expect(buttonByName(host, "Later")).toBeUndefined();

    const instagram = host.querySelector("[data-platform='instagram']");
    const linkedin = host.querySelector("[data-platform='linkedin']");
    expect(instagram?.textContent).toContain("Preview");
    expect(instagram?.querySelector(".avatar")?.textContent).toBe("ME");
    expect(instagram?.textContent).toContain("Instagram");
    expect(instagram?.textContent).toContain("Alpha line");
    expect(instagram?.textContent).not.toContain("Beta line");
    expect(instagram?.textContent).toContain("see more");
    expect(instagram?.textContent).toContain("subject cropped");
    expect(linkedin?.textContent).toContain("LinkedIn");
    expect(linkedin?.textContent).toContain("Beta line");
    expect(linkedin?.querySelectorAll(".badge")).toHaveLength(1);
    expect(host.querySelector("textarea")?.value).toBe(caption);

    buttonByName(host, "Facebook")?.click();
    buttonByName(host, "Focus")?.click();
    buttonByName(host, "Light")?.click();
    const area = host.querySelector("textarea");
    if (!area) throw new Error("missing caption");
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(area, "Next caption");
    area.dispatchEvent(new Event("input", { bubbles: true }));

    expect(props.onPlatform).toHaveBeenCalledWith("facebook");
    expect(props.onFocus).toHaveBeenCalledWith("focus");
    expect(props.onTheme).toHaveBeenCalledWith("light");
    expect(props.onCaption).toHaveBeenCalledWith("Next caption");
  });

  it("focuses the chosen platform and reorders thumbs through onMove", () => {
    const { host, props } = renderPreview({ focus: "focus", platformId: "linkedin", theme: "light" });
    expect(host.querySelector("section")?.getAttribute("data-theme")).toBe("light");
    expect(host.querySelectorAll("article")).toHaveLength(1);
    expect(host.querySelector("article")?.getAttribute("data-platform")).toBe("linkedin");

    const thumbs = [...host.querySelectorAll(".order-thumb")];
    expect(thumbs).toHaveLength(2);
    act(() => {
      thumbs[0]?.dispatchEvent(new DragEvent("dragstart", { bubbles: true }));
      thumbs[1]?.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true }));
      thumbs[1]?.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true }));
    });
    expect(props.onMove).toHaveBeenCalledTimes(1);
    expect(props.onMove).toHaveBeenCalledWith("wide", 1);
  });

  it("uses the 2px radius token on the order index", () => {
    const css = readFileSync("apps/web/src/preview.css", "utf8");
    const block = css.match(/\.order-index\s*\{[^}]*\}/)?.[0] ?? "";
    expect(block).toMatch(/border-radius:\s*var\(--radius-chrome\)/);
    expect(block).not.toMatch(/border-radius:\s*4px/);
  });

  it("scrolls side to side on an Instagram carousel via controls, dots, keys, and scroll", () => {
    const igCarousel = parsePlatformConfig({
      id: "instagram",
      version: "1",
      last_verified: "2026-11-24",
      export_px: 1080,
      surfaces: [
        { id: "feed_square", label: "Feed square", aspect: 1, kind: "single", min_images: 1, max_images: 1 },
        { id: "carousel", label: "Carousel", aspect: 0.8, kind: "carousel", min_images: 2, max_images: 10 },
      ],
      frame_tokens: { preview_label: "Preview", avatar: "placeholder", name: "Member" },
      media_rules: { fit: "cover" },
      caption_rules: { max_chars: 125, max_lines: 2, see_more_label: "see more" },
    });
    const threeRecords = [
      ...records,
      { id: "third", width: 1000, height: 1250, subject_box: null },
    ] as PublicRecord[];
    const { host } = renderPreview({
      records: threeRecords,
      orderedIds: ["wide", "square", "third"],
      platforms: [igCarousel, platform("linkedin", 4), platform("facebook", 4)],
    });

    const ig = host.querySelector("[data-platform='instagram']");
    const track = ig?.querySelector(".carousel-track") as HTMLDivElement | null;
    expect(track?.getAttribute("data-kind")).toBe("carousel");
    expect(ig?.querySelectorAll(".carousel-slide")).toHaveLength(3);
    expect(ig?.querySelector(".carousel-counter")?.textContent).toBe("1/3");
    expect(ig?.querySelector(".carousel-prev")).toBeNull();
    expect(ig?.querySelector(".carousel-next")).not.toBeNull();

    act(() => {
      (ig?.querySelector(".carousel-next") as HTMLButtonElement | null)?.click();
    });
    expect(ig?.querySelector(".carousel-counter")?.textContent).toBe("2/3");
    expect(ig?.querySelector(".carousel-prev")).not.toBeNull();

    const dots = [...(ig?.querySelectorAll(".carousel-dot") ?? [])] as HTMLButtonElement[];
    expect(dots).toHaveLength(3);
    act(() => {
      dots[2]?.click();
    });
    expect(ig?.querySelector(".carousel-counter")?.textContent).toBe("3/3");
    expect(ig?.querySelector(".carousel-next")).toBeNull();

    act(() => {
      track?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    });
    expect(ig?.querySelector(".carousel-counter")?.textContent).toBe("2/3");

    if (track) {
      Object.defineProperty(track, "clientWidth", { value: 348, configurable: true });
      track.scrollLeft = 0;
      act(() => {
        track.dispatchEvent(new Event("scroll"));
      });
    }
    expect(ig?.querySelector(".carousel-counter")?.textContent).toBe("1/3");
  });

  it("matches native platform layout order for Instagram, LinkedIn, and Facebook", () => {
    const { host } = renderPreview();
    const ig = host.querySelector("[data-platform='instagram']");
    const li = host.querySelector("[data-platform='linkedin']");
    const fb = host.querySelector("[data-platform='facebook']");

    expect(ig?.querySelector(".post-copy")).toBeNull();
    expect(ig?.querySelector(".post-footer .caption")).not.toBeNull();
    expect(li?.querySelector(".post-copy .caption")).not.toBeNull();
    expect(li?.textContent).toContain("Repost");
    expect(fb?.querySelector(".post-copy .caption")).not.toBeNull();
    expect(fb?.textContent).toContain("Share");
  });

  it("uses thumbs in Compare mode and working copies only for Focus mode active frames", () => {
    const compare = renderPreview({ focus: "compare" });
    const compareSrcs = [...compare.host.querySelectorAll(".frame img")].map((img) => img.getAttribute("src"));
    expect(compareSrcs.length).toBeGreaterThan(0);
    expect(compareSrcs.every((src) => src?.endsWith("?kind=thumb"))).toBe(true);

    const focused = renderPreview({ focus: "focus", platformId: "linkedin" });
    const focusSrcs = [...focused.host.querySelectorAll(".frame img")].map((img) => img.getAttribute("src"));
    expect(focusSrcs.some((src) => src?.endsWith("?kind=working"))).toBe(true);
    expect(focusSrcs.some((src) => src?.endsWith("?kind=thumb"))).toBe(true);
  });
});
