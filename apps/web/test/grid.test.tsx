// @vitest-environment happy-dom
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Grid } from "../src/grid/Grid";
import { GridHeader } from "../src/shell/GridHeader";
import { columnCount, visibleRange } from "../src/grid/window";
import type { PublicRecord } from "../src/api/client";

function record(id: string, needsTags = false): PublicRecord {
  return { id, needs_tags: needsTags } as PublicRecord;
}

function stubResizeObserver() {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      private target: Element | null = null;
      constructor(private callback: ResizeObserverCallback) {}
      observe(node: Element) {
        this.target = node;
        this.callback(
          [{ contentRect: { width: 400, height: 400 } } as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        );
      }
      unobserve() {}
      disconnect() {}
    },
  );
}

describe("grid window", () => {
  it("counts columns from width, tile, and gap", () => {
    expect(columnCount(400, 96)).toBe(3);
    expect(columnCount(640, 160)).toBe(3);
    expect(columnCount(100, 160)).toBe(1);
  });

  it("maps scroll position to a row window", () => {
    expect(visibleRange(0, 400, 168, 40, 4)).toEqual({ start: 0, end: 20 });
    expect(visibleRange(168, 400, 168, 40, 4)).toEqual({ start: 4, end: 24 });
  });
});

describe("GridHeader", () => {
  it("renders counts, filters, select all, and tile size", () => {
    const onTile = vi.fn();
    const onSelectAll = vi.fn();
    const onNeedsTagsFilter = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    act(() => {
      createRoot(host).render(
        createElement(GridHeader, {
          matched: 12,
          total: 20,
          selectedCount: 3,
          needsTags: 5,
          onSelectAll,
          tile: 160,
          onTile,
          needsTagsFilter: false,
          onNeedsTagsFilter,
        }),
      );
    });
    expect(host.textContent).toContain("12 photos");
    expect(host.textContent).toContain("3 selected");
    expect(host.textContent).toContain("5 need tags");
    expect(host.querySelector("input[aria-label='Tile size']")).toBeTruthy();
    const selectAll = [...host.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Select all"),
    );
    expect(selectAll?.textContent).toBe("Select all 12 matching");
    act(() => {
      selectAll?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSelectAll).toHaveBeenCalledTimes(1);
    const needsTagsButton = [...host.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("need tags"),
    );
    act(() => {
      needsTagsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onNeedsTagsFilter).toHaveBeenCalledWith(true);
  });

  it("confirms select all when more than 50 match", () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    const onSelectAll = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    act(() => {
      createRoot(host).render(
        createElement(GridHeader, {
          matched: 60,
          total: 60,
          selectedCount: 0,
          needsTags: 0,
          onSelectAll,
          tile: 160,
          onTile: () => undefined,
          needsTagsFilter: false,
          onNeedsTagsFilter: () => undefined,
        }),
      );
    });
    const selectAll = [...host.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Select all"),
    );
    act(() => {
      selectAll?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(confirm).toHaveBeenCalled();
    expect(onSelectAll).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

describe("Grid", () => {
  beforeEach(() => {
    stubResizeObserver();
  });

  it("virtualizes with a scroll spacer and tab order when unfocused", async () => {
    const records = [
      record("photo-1", true),
      ...Array.from({ length: 23 }, (_, index) => record(`photo-${index + 2}`)),
    ];
    const onToggle = vi.fn();
    const onInspect = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    await act(async () => {
      createRoot(host).render(
        createElement(Grid, {
          records,
          trayIds: [],
          focusId: null,
          onFocus: () => undefined,
          onToggle,
          onInspect,
          tile: 96,
        }),
      );
    });
    const scroller = host.querySelector(".grid") as HTMLDivElement;
    const inner = host.querySelector(".grid-inner") as HTMLDivElement;
    expect(inner.style.height).toBe(`${Math.ceil(24 / 3) * (96 + 8)}px`);
    const tiles = [...host.querySelectorAll(".tile")];
    expect(tiles.length).toBeLessThan(24);
    expect(tiles[0]?.getAttribute("tabindex")).toBe("0");
    expect(tiles.slice(1).every((tile) => tile.getAttribute("tabindex") === "-1")).toBe(true);
    expect(tiles[0]?.getAttribute("aria-label")).toMatch(/1/);
    expect(host.textContent).not.toContain("needs tags");
    expect(host.querySelector(".badge")).toBeNull();
    await act(async () => {
      tiles[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
      tiles[0]?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, detail: 2 }));
    });
    expect(onInspect).toHaveBeenCalledWith("photo-1");
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("ignores tray toggle on double-click detail", async () => {
    const records = [record("photo-1")];
    const onToggle = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    await act(async () => {
      createRoot(host).render(
        createElement(Grid, {
          records,
          trayIds: [],
          focusId: null,
          onFocus: () => undefined,
          onToggle,
          onInspect: () => undefined,
          tile: 96,
        }),
      );
    });
    const tile = host.querySelector(".tile") as HTMLButtonElement;
    await act(async () => {
      tile.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
      tile.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, detail: 2 }));
    });
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("commits a single click after the delay", async () => {
    vi.useFakeTimers();
    const records = [record("photo-1")];
    const onToggle = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    await act(async () => {
      createRoot(host).render(
        createElement(Grid, {
          records,
          trayIds: [],
          focusId: null,
          onFocus: () => undefined,
          onToggle,
          onInspect: () => undefined,
          tile: 96,
        }),
      );
    });
    const tile = host.querySelector(".tile") as HTMLButtonElement;
    await act(async () => {
      tile.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    });
    expect(onToggle).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(onToggle).toHaveBeenCalledWith("photo-1");
    vi.useRealTimers();
  });
});