// @vitest-environment happy-dom
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { classifyGesture } from "../src/wheel/gesture";
import { visibleRange } from "../src/grid/window";

function mockFetchEmpty() {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo) => {
    const url = String(input);
    if (url === "/api/query") return Response.json({ total: 0, matched: 0, maxChroma: 0.2, records: [] });
    if (url === "/api/platforms") return Response.json({ platforms: [] });
    if (url === "/api/queue") return Response.json({ paused: false });
    return new Response("missing", { status: 404 });
  }));
}

describe("ui helpers", () => {
  it("classifies wheel gestures and window ranges", () => {
    expect(classifyGesture("auto", 0.9, 0)).toBe("wedge");
    expect(classifyGesture("auto", 0.2, 0.2)).toBe("wedge");
    expect(classifyGesture("auto", 0.2, 0)).toBe("click");
    expect(visibleRange(0, 200, 100, 40, 4)).toEqual({ start: 0, end: 16 });
  });

  it("renders one workspace shell with empty library", async () => {
    mockFetchEmpty();
    const host = document.createElement("div");
    document.body.append(host);
    await act(async () => {
      createRoot(host).render(createElement(App));
    });
    expect(host.textContent).toContain("Color Wheel Gallery");
    const buttons = [...host.querySelectorAll("button")].map((button) => button.textContent?.trim());
    expect(buttons).toContain("Add photos");
    expect(buttons).not.toContain("Gallery");
    expect(buttons).not.toContain("Wheel focus");
    expect(buttons).not.toContain("Post preview");
    expect(host.querySelector("[aria-label='Color wheel']")).toBeNull();
    expect(host.querySelector("input[aria-label='Natural language filter']")).toBeNull();
  });

  it("keeps the rail when filters match nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url === "/api/query") return Response.json({ total: 4, matched: 0, maxChroma: 0.2, records: [] });
      if (url === "/api/platforms") return Response.json({ platforms: [] });
      if (url === "/api/queue") return Response.json({ paused: false });
      return new Response("missing", { status: 404 });
    }));
    const host = document.createElement("div");
    document.body.append(host);
    await act(async () => {
      createRoot(host).render(createElement(App));
    });
    expect(host.textContent).toContain("No photos match");
    expect([...host.querySelectorAll("button")].map((button) => button.textContent?.trim())).toContain("Clear filters");
    expect(host.querySelector("input[aria-label='Lightness']")).toBeTruthy();
  });

  it("queries the library with an all selection when the wheel is clear", async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/query") {
        if (init?.body) bodies.push(JSON.parse(String(init.body)));
        return Response.json({
          total: 2,
          matched: 2,
          maxChroma: 0.2,
          records: [{ id: "photo-1", needs_tags: false }, { id: "photo-2", needs_tags: false }],
        });
      }
      if (url === "/api/platforms") return Response.json({ platforms: [] });
      if (url === "/api/queue") return Response.json({ paused: false });
      return new Response("missing", { status: 404 });
    }));
    const host = document.createElement("div");
    document.body.append(host);
    await act(async () => {
      createRoot(host).render(createElement(App));
    });
    expect(bodies.length).toBeGreaterThan(0);
    const libraryBody = bodies[0] as { selection?: { type: string; ids?: string[] } };
    expect(libraryBody.selection).toEqual({ type: "all" });
    for (const body of bodies) {
      const selection = (body as { selection?: { type: string } }).selection;
      expect(selection).not.toEqual({ type: "ids" });
    }
  });

  it("shows the tile size control with a loaded grid", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url === "/api/query") {
        return Response.json({
          total: 1,
          matched: 1,
          maxChroma: 0.2,
          records: [{ id: "photo-1", needs_tags: false }],
        });
      }
      if (url === "/api/platforms") return Response.json({ platforms: [] });
      if (url === "/api/queue") return Response.json({ paused: false });
      return new Response("missing", { status: 404 });
    }));
    const host = document.createElement("div");
    document.body.append(host);
    await act(async () => {
      createRoot(host).render(createElement(App));
    });
    expect(host.querySelector("input[aria-label='Tile size']")).toBeTruthy();
  });

  it("disables Preview until the tray has photos", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url === "/api/query") {
        return Response.json({
          total: 1,
          matched: 1,
          maxChroma: 0.2,
          records: [{ id: "photo-1", needs_tags: false }],
        });
      }
      if (url === "/api/platforms") return Response.json({ platforms: [] });
      if (url === "/api/queue") return Response.json({ paused: false });
      return new Response("missing", { status: 404 });
    }));
    const host = document.createElement("div");
    document.body.append(host);
    await act(async () => {
      createRoot(host).render(createElement(App));
    });
    const preview = [...host.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Preview");
    expect(preview).toBeTruthy();
    expect(preview?.disabled).toBe(true);
    expect(host.textContent).toContain("Add photos to the set");
    expect(host.textContent).toContain("Click photos to build a selection");
    expect(host.querySelector("[aria-label='Color wheel']")).toBeTruthy();
  });
});