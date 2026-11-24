// @vitest-environment happy-dom
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { classifyGesture } from "../src/wheel/gesture";
import { visibleRange } from "../src/grid/window";

describe("ui helpers", () => {
  it("classifies wheel gestures and window ranges", () => {
    expect(classifyGesture("auto", 0.9, 0)).toBe("wedge");
    expect(classifyGesture("auto", 0.2, 0.2)).toBe("lasso");
    expect(classifyGesture("auto", 0.2, 0)).toBe("click");
    expect(visibleRange(0, 200, 100, 40, 4)).toEqual({ start: 0, end: 16 });
  });

  it("renders the three modes", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url === "/api/query") return Response.json({ total: 0, matched: 0, maxChroma: 0.2, records: [] });
      if (url === "/api/platforms") return Response.json({ platforms: [] });
      if (url === "/api/queue") return Response.json({ paused: false });
      return new Response("missing", { status: 404 });
    }));
    const host = document.createElement("div");
    document.body.append(host);
    await act(async () => {
      createRoot(host).render(createElement(App));
    });
    expect(host.textContent).toContain("Color Wheel Gallery");
    const preview = [...host.querySelectorAll("button")].find((button) => button.textContent === "Post preview");
    await act(async () => {
      preview?.click();
    });
    expect(preview?.getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector("[aria-label='Color wheel']")).toBeTruthy();
  });
});
