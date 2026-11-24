// @vitest-environment happy-dom
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { TopBar, type TopBarProps } from "../src/shell/TopBar";
import { createRef, type RefObject } from "react";

function mockFetchEmpty() {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo) => {
    const url = String(input);
    if (url === "/api/query") return Response.json({ total: 0, matched: 0, maxChroma: 0.2, records: [] });
    if (url === "/api/platforms") return Response.json({ platforms: [] });
    if (url === "/api/queue") return Response.json({ paused: false });
    return new Response("missing", { status: 404 });
  }));
}

function mockQueuePaused(reason: string) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo) => {
    const url = String(input);
    if (url === "/api/query") {
      return Response.json({
        total: 2,
        matched: 2,
        maxChroma: 0.2,
        records: [{ id: "photo-1", needs_tags: false }, { id: "photo-2", needs_tags: false }],
      });
    }
    if (url === "/api/platforms") return Response.json({ platforms: [] });
    if (url === "/api/queue") return Response.json({ paused: true, reason });
    return new Response("missing", { status: 404 });
  }));
}

function mockLibraryLoaded() {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo) => {
    const url = String(input);
    if (url === "/api/query") {
      return Response.json({
        total: 2,
        matched: 2,
        maxChroma: 0.2,
        records: [{ id: "photo-1", needs_tags: false }, { id: "photo-2", needs_tags: false }],
      });
    }
    if (url === "/api/platforms") return Response.json({ platforms: [] });
    if (url === "/api/queue") return Response.json({ paused: false });
    if (url === "/api/palettes") return Response.json({ palettes: [] });
    return new Response("missing", { status: 404 });
  }));
}

type MatchMediaStub = {
  matches: boolean;
  listeners: Array<(event: MediaQueryListEvent) => void>;
};

function stubMatchMedia(narrow: boolean): MatchMediaStub {
  const stub: MatchMediaStub = { matches: narrow, listeners: [] };
  vi.stubGlobal("matchMedia", vi.fn((query: string) => {
    const matches = query.includes("1023") ? narrow : false;
    return {
      matches,
      media: query,
      addEventListener: (_: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === "function") stub.listeners.push(listener as (event: MediaQueryListEvent) => void);
      },
      removeEventListener: (_: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === "function") {
          stub.listeners = stub.listeners.filter((item) => item !== listener);
        }
      },
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => true,
      onchange: null,
    } satisfies MediaQueryList;
  }));
  return stub;
}

async function renderApp() {
  const host = document.createElement("div");
  document.body.append(host);
  await act(async () => {
    createRoot(host).render(createElement(App));
  });
  return host;
}

function topBarBase(overrides: Partial<TopBarProps> = {}): TopBarProps {
  return {
    showWorkspace: false,
    mode: "gallery",
    onMode: vi.fn(),
    trayReady: false,
    importOpen: true,
    onImportOpen: vi.fn(),
    addPhotosRef: createRef<HTMLButtonElement>(),
    importPopoverRef: createRef<HTMLDivElement>(),
    estimateLabel: "~$0.12 for 24 sample photos",
    onEstimate: vi.fn(),
    onConfirmImport: vi.fn(),
    matched: 0,
    total: 0,
    chips: [],
    onRemoveChip: vi.fn(),
    facets: {},
    onOrientation: vi.fn(),
    onAspectRatio: vi.fn(),
    onSharpness: vi.fn(),
    onTemperature: vi.fn(),
    onFavorites: vi.fn(),
    onNeverUsed: vi.fn(),
    onStatus: vi.fn(),
    onClearFilters: vi.fn(),
    onNaturalLanguage: vi.fn().mockResolvedValue(undefined),
    strictness: 0.5,
    onStrictness: vi.fn(),
    ...overrides,
  };
}

describe("import adapt polish", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("lists Takeout guidance and keeps sample import actions", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    await act(async () => {
      createRoot(host).render(createElement(TopBar, topBarBase()));
    });
    const menu = host.querySelector(".import-popover");
    expect(menu).toBeTruthy();
    expect(menu?.textContent).toContain("Takeout folder");
    expect(menu?.textContent).toContain("Run pnpm import:takeout on this machine");
    expect(menu?.textContent).toContain("Sample library");
    expect(menu?.textContent).toContain("Confirm import");
    expect(menu?.textContent).toContain("~$0.12 for 24 sample photos");
  });

  it("closes the import popover on pointerdown outside", async () => {
    mockFetchEmpty();
    const host = await renderApp();
    const add = [...host.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Add photos");
    expect(add).toBeTruthy();
    await act(async () => {
      add?.click();
    });
    expect(host.querySelector(".import-popover")).toBeTruthy();
    await act(async () => {
      document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    expect(host.querySelector(".import-popover")).toBeNull();
  });

  it("shows an empty-library canvas message", async () => {
    mockFetchEmpty();
    const host = await renderApp();
    expect(host.textContent).toContain("Add photos to start");
    expect([...host.querySelectorAll("button")].map((button) => button.textContent?.trim())).not.toContain("Gallery");
    expect([...host.querySelectorAll("button")].map((button) => button.textContent?.trim())).not.toContain("Preview");
  });

  it("shows the queue pause reason in the banner", async () => {
    mockQueuePaused("Importer sleep — both desktops offline");
    const host = await renderApp();
    const banner = host.querySelector(".banner");
    expect(banner?.textContent).toContain("Importer sleep — both desktops offline");
  });

  it("toggles the color wheel rail below 1024px", async () => {
    stubMatchMedia(true);
    mockLibraryLoaded();
    const host = await renderApp();
    const toggle = [...host.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Color wheel");
    expect(toggle).toBeTruthy();
    const workspace = host.querySelector(".workspace");
    expect(workspace?.getAttribute("data-rail-open")).toBe("false");
    await act(async () => {
      toggle?.click();
    });
    expect(workspace?.getAttribute("data-rail-open")).toBe("true");
    await act(async () => {
      toggle?.click();
    });
    expect(workspace?.getAttribute("data-rail-open")).toBe("false");
  });

  it("uses coarse-pointer touch targets in chrome CSS", () => {
    const styles = readFileSync("apps/web/src/styles.css", "utf8");
    const tray = readFileSync("apps/web/src/tray.css", "utf8");
    expect(styles).toMatch(/@media\s*\(pointer:\s*coarse\)/);
    expect(styles).toMatch(/min-height:\s*44px/);
    expect(tray).toMatch(/@media\s*\(pointer:\s*coarse\)/);
    expect(tray).toMatch(/min-height:\s*44px/);
  });

  it("raises tray hint contrast and wheel tool label size", () => {
    const topbar = readFileSync("apps/web/src/topbar.css", "utf8");
    const styles = readFileSync("apps/web/src/styles.css", "utf8");
    expect(topbar).toMatch(/\.tray-hint[\s\S]*color:\s*var\(--ink-2\)/);
    expect(styles).toMatch(/\.wheel-tool-option[\s\S]*font-size:\s*0\.75rem/);
  });
});