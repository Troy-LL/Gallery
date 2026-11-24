// @vitest-environment happy-dom
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hueSymbol, matchHarmony, paletteSchema, syntheticRecord, wheelPoint, type Palette } from "@gallery/core";
import { listPalettes } from "../src/api/client";
import { Rail, type RailProps } from "../src/shell/Rail";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type WheelSlot = RailProps["wheelSlot"];

async function mount(node: ReturnType<typeof createElement>) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(node);
  });
  return {
    host,
    async rerender(next: ReturnType<typeof createElement>) {
      await act(async () => {
        root.render(next);
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

function slot(overrides: Partial<WheelSlot> = {}): WheelSlot {
  return {
    records: [],
    maxChroma: 0.2,
    tool: "auto",
    multiSwatch: false,
    large: false,
    selectedIds: [],
    onSelect: vi.fn(),
    ...overrides,
  };
}

function rail(overrides: Partial<RailProps> = {}): RailProps {
  return {
    wheelSlot: slot(),
    tool: "auto",
    onTool: vi.fn(),
    onLarge: vi.fn(),
    facets: {},
    onFacets: vi.fn(),
    multiSwatch: false,
    onMultiSwatch: vi.fn(),
    palettes: [],
    onPalettes: vi.fn(),
    ...overrides,
  };
}

function buttonNamed(host: HTMLElement, name: string): HTMLButtonElement {
  const button = [...host.querySelectorAll("button")].find((item) => item.textContent?.trim() === name);
  if (!(button instanceof HTMLButtonElement)) throw new Error(`missing ${name}`);
  return button;
}

async function click(button: HTMLButtonElement) {
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function typeName(host: HTMLElement, value: string) {
  const input = host.querySelector("input[aria-label='Palette name']");
  if (!(input instanceof HTMLInputElement)) throw new Error("missing palette name");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function dominantSwatch(record: ReturnType<typeof syntheticRecord>) {
  return {
    hex: record.dominant_hex,
    h: record.dominant_h,
    s: record.dominant_s,
    l: record.dominant_l,
    oklch: record.dominant_oklch,
    weight: 1,
  };
}

function palette(overrides: Partial<Palette> = {}): Palette {
  return {
    id: "palette-1",
    name: "Dusk",
    selection_shape: { type: "ids", ids: ["picked"] },
    swatches: [{ hex: "#c4553a", h: 18, s: 0.62, l: 0.48, oklch: { L: 0.55, C: 0.12, h: 18 }, weight: 1 }],
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("saved palettes", () => {
  it("lists palettes from GET /api/palettes", async () => {
    const saved = palette();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo) => {
      expect(String(input)).toBe("/api/palettes");
      return Response.json({ palettes: [saved] });
    }));
    await expect(listPalettes()).resolves.toEqual({ palettes: [saved] });
  });

  it("saves the wheel selection and dominant swatches", async () => {
    const picked = syntheticRecord(1, { id: "picked" });
    const other = syntheticRecord(2, { id: "other" });
    const bodies: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      if (String(input) === "/api/palettes" && init?.method === "POST") {
        bodies.push(JSON.parse(String(init.body)));
        return Response.json({ ok: true });
      }
      return new Response("missing", { status: 404 });
    }));
    const props = rail({ wheelSlot: slot({ records: [picked, other], selectedIds: ["picked"] }) });
    const view = await mount(createElement(Rail, props));
    await typeName(view.host, "Dusk");
    await click(buttonNamed(view.host, "Save palette"));
    const saved = paletteSchema.parse(bodies[0]);
    expect(saved.name).toBe("Dusk");
    expect(saved.selection_shape).toEqual({ type: "ids", ids: ["picked"] });
    expect(saved.swatches).toEqual([dominantSwatch(picked)]);
    expect(props.onPalettes).toHaveBeenCalledWith([saved]);
  });

  it("saves every library swatch when the wheel selection is empty", async () => {
    const first = syntheticRecord(1, { id: "first" });
    const second = syntheticRecord(2, { id: "second" });
    const bodies: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      if (String(input) === "/api/palettes" && init?.method === "POST") {
        bodies.push(JSON.parse(String(init.body)));
        return Response.json({ ok: true });
      }
      return new Response("missing", { status: 404 });
    }));
    const view = await mount(createElement(Rail, rail({
      wheelSlot: slot({ records: [first, second], selectedIds: [] }),
    })));
    await typeName(view.host, "Library");
    await click(buttonNamed(view.host, "Save palette"));
    const saved = paletteSchema.parse(bodies[0]);
    expect(saved.selection_shape).toEqual({ type: "all" });
    expect(saved.swatches).toEqual([dominantSwatch(first), dominantSwatch(second)]);
  });

  it("reapplies a saved palette and exports its hex list and JSON", async () => {
    const saved = palette({
      swatches: [
        { hex: "#c4553a", h: 18, s: 0.62, l: 0.48, oklch: { L: 0.55, C: 0.12, h: 18 }, weight: 1 },
        { hex: "#204060", h: 210, s: 0.5, l: 0.25, oklch: { L: 0.35, C: 0.08, h: 210 }, weight: 1 },
      ],
    });
    const onSelect = vi.fn();
    const view = await mount(createElement(Rail, rail({
      palettes: [saved],
      wheelSlot: slot({ onSelect }),
    })));
    expect(view.host.textContent).toContain("Dusk");
    await click(buttonNamed(view.host, "Dusk"));
    expect(onSelect).toHaveBeenCalledWith(["picked"], "replace");

    await click(buttonNamed(view.host, "Export hex"));
    expect(view.host.querySelector("[aria-label='Palette export']")?.textContent).toBe("#c4553a\n#204060");
    await click(buttonNamed(view.host, "Export JSON"));
    expect(paletteSchema.parse(JSON.parse(view.host.querySelector("[aria-label='Palette export']")?.textContent ?? ""))).toEqual(saved);
  });
});

describe("harmony", () => {
  it("counts matches for one selected photo and selects them", async () => {
    const source = syntheticRecord(1, {
      id: "src",
      dominant_h: 10,
      dominant_oklch: { L: 0.5, C: 0.1, h: 10 },
    });
    const complementary = syntheticRecord(2, {
      id: "comp",
      dominant_h: 190,
      dominant_oklch: { L: 0.5, C: 0.1, h: 190 },
    });
    const analogous = syntheticRecord(3, {
      id: "ana",
      dominant_h: 40,
      dominant_oklch: { L: 0.5, C: 0.1, h: 40 },
    });
    const records = [source, complementary, analogous];
    const hue = (record: (typeof records)[number]) => record.dominant_oklch.h;
    const rows = records.map((record) => ({ id: record.id, hue: hue(record) }));
    const onSelect = vi.fn();
    const view = await mount(createElement(Rail, rail({
      wheelSlot: slot({ records, selectedIds: ["src"], onSelect }),
    })));
    expect(buttonNamed(view.host, `Analogous ${matchHarmony(rows, "src", hue(source), "analogous").length}`).textContent).toContain("1");
    expect(buttonNamed(view.host, `Complementary ${matchHarmony(rows, "src", hue(source), "complementary").length}`).textContent).toContain("1");
    expect(buttonNamed(view.host, `Triadic ${matchHarmony(rows, "src", hue(source), "triadic").length}`).textContent).toContain("0");
    await click(buttonNamed(view.host, "Complementary 1"));
    expect(onSelect).toHaveBeenCalledWith(matchHarmony(rows, "src", hue(source), "complementary"), "replace");
  });
});

describe("color-blind safe", () => {
  it("draws hue symbols and the hovered hex only while the toggle is on", async () => {
    const texts: string[] = [];
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement, type: string) {
      if (type !== "2d") return original.call(this, type);
      const context = new Proxy({} as CanvasRenderingContext2D, {
        get(_target, prop) {
          if (prop === "fillText") return (value: string) => { texts.push(value); };
          return () => undefined;
        },
        set() { return true; },
      });
      return context;
    } as HTMLCanvasElement["getContext"];

    const record = syntheticRecord(1, {
      id: "dot",
      dominant_hex: "#123456",
      dominant_oklch: { L: 0.5, C: 0.2, h: 20 },
    });
    try {
      const view = await mount(createElement(Rail, rail({
        wheelSlot: slot({ records: [record], maxChroma: 0.2 }),
      })));
      const group = [...view.host.querySelectorAll("legend")].find((item) => item.textContent === "Color")?.parentElement;
      expect(group?.textContent).toContain("Color-blind safe");
      const toggle = buttonNamed(view.host, "Color-blind safe");
      expect(toggle.getAttribute("aria-pressed")).toBe("false");
      expect(texts).toEqual([]);
      expect(view.host.querySelector("[aria-label='Hovered swatch']")).toBeNull();
      expect(view.host.textContent).not.toContain("Cursor hue");

      await click(toggle);
      expect(toggle.getAttribute("aria-pressed")).toBe("true");
      expect(texts).toContain(hueSymbol(record.dominant_oklch.h));

      const canvas = view.host.querySelector("canvas");
      if (!(canvas instanceof HTMLCanvasElement)) throw new Error("missing canvas");
      canvas.getBoundingClientRect = () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: canvas.width,
        bottom: canvas.height,
        width: canvas.width,
        height: canvas.height,
        toJSON() { return {}; },
      });
      const size = canvas.width;
      const center = size / 2;
      const ringRadius = size * 0.42;
      const point = wheelPoint(record.dominant_oklch, 0.2);
      await act(async () => {
        canvas.dispatchEvent(new PointerEvent("pointermove", {
          clientX: center + point.x * ringRadius,
          clientY: center - point.y * ringRadius,
          bubbles: true,
        }));
      });
      expect(view.host.querySelector("[aria-label='Hovered swatch']")?.textContent).toBe("#123456");

      texts.length = 0;
      await click(toggle);
      expect(toggle.getAttribute("aria-pressed")).toBe("false");
      expect(texts).toEqual([]);
      expect(view.host.querySelector("[aria-label='Hovered swatch']")).toBeNull();
      expect(view.host.textContent).not.toContain("Cursor hue");
      expect(view.host.textContent).not.toContain("#123456");
    } finally {
      HTMLCanvasElement.prototype.getContext = original;
    }
  });
});
