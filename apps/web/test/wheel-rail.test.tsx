// @vitest-environment happy-dom
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { syntheticRecord } from "@gallery/core";
import type { Facets } from "@gallery/core";
import { Rail, type RailProps } from "../src/shell/Rail";
import { WheelToolMenu } from "../src/wheel/WheelToolMenu";
import { WHEEL_TOOLS } from "../src/wheel/gesture";

const here = dirname(fileURLToPath(import.meta.url));
for (const file of ["../src/styles.css", "../src/wheel.css"]) {
  const style = document.createElement("style");
  style.textContent = readFileSync(resolve(here, file), "utf8");
  document.head.append(style);
}

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
    root,
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
    ...overrides,
  };
}

function buttonNamed(host: HTMLElement, name: string): HTMLButtonElement {
  const button = [...host.querySelectorAll("button")].find((item) => item.textContent?.trim() === name);
  if (!(button instanceof HTMLButtonElement)) throw new Error(`missing ${name}`);
  return button;
}

function labeledRange(host: HTMLElement, name: string): HTMLInputElement {
  const label = [...host.querySelectorAll("label")].find((item) => item.querySelector("span")?.textContent === name);
  const input = label?.querySelector("input");
  if (!(input instanceof HTMLInputElement)) throw new Error(`missing ${name}`);
  return input;
}

async function setRange(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function key(canvas: HTMLCanvasElement, keyName: string, extras: Pick<KeyboardEventInit, "shiftKey" | "altKey"> = {}) {
  await act(async () => {
    canvas.dispatchEvent(new KeyboardEvent("keydown", { key: keyName, bubbles: true, ...extras }));
  });
}

describe("wheel rail", () => {
  it("rings selected dots without dropping the rest of the library", async () => {
    const strokes: number[] = [];
    const fills: number[] = [];
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement, type: string) {
      if (type !== "2d") return original.call(this, type);
      let radius = 0;
      const context = new Proxy({} as CanvasRenderingContext2D, {
        get(_target, prop) {
          if (prop === "arc") return (_x: number, _y: number, next: number) => { radius = next; };
          if (prop === "stroke") return () => strokes.push(radius);
          if (prop === "fill") return () => fills.push(radius);
          return () => undefined;
        },
        set() { return true; },
      });
      return context;
    } as HTMLCanvasElement["getContext"];

    const records = [
      syntheticRecord(1, { id: "picked", dominant_oklch: { L: 0.4, C: 0.1, h: 20 } }),
      syntheticRecord(2, { id: "other", dominant_oklch: { L: 0.7, C: 0.12, h: 200 } }),
    ];
    try {
      const plain = await mount(createElement(Rail, rail({ wheelSlot: slot({ records, selectedIds: [] }) })));
      const plainStrokes = strokes.length;
      const plainFills = fills.length;
      await plain.unmount();
      strokes.length = 0;
      fills.length = 0;
      const selected = await mount(createElement(Rail, rail({ wheelSlot: slot({ records, selectedIds: ["picked"] }) })));
      expect(fills.length).toBe(plainFills);
      expect(fills.length).toBe(2);
      expect(strokes.length).toBeGreaterThan(plainStrokes);
      await selected.unmount();
    } finally {
      HTMLCanvasElement.prototype.getContext = original;
    }
  });

  it("clears the wheel selection from the rail", async () => {
    const onSelect = vi.fn();
    const { host } = await mount(createElement(Rail, rail({ wheelSlot: slot({ onSelect, selectedIds: ["picked"] }) })));
    await act(async () => {
      buttonNamed(host, "Clear selection").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSelect).toHaveBeenCalledWith([], "replace");
  });

  it("keeps every wheel tool visible as a radio", async () => {
    const onTool = vi.fn();
    const { host } = await mount(createElement(Rail, rail({ tool: "brush", onTool })));
    const radios = [...host.querySelectorAll("[role='radio']")];
    expect(host.querySelector("[role='radiogroup']")).toBeTruthy();
    expect(host.querySelector("[role='menu']")).toBeNull();
    expect(host.querySelector("[aria-haspopup]")).toBeNull();
    expect(radios.map((radio) => radio.textContent?.trim())).toEqual([...WHEEL_TOOLS]);
    for (const radio of radios) {
      expect(radio.getAttribute("aria-checked")).toBe(radio.textContent?.trim() === "brush" ? "true" : "false");
    }
    expect(host.textContent).toContain("Shift adds · Alt subtracts");
    await act(async () => {
      radios.find((radio) => radio.textContent?.trim() === "lasso")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onTool).toHaveBeenCalledWith("lasso");
  });

  it("paints the checked tool darker than the generic button rule", async () => {
    const { host } = await mount(createElement(WheelToolMenu, { value: "wedge", onChange: vi.fn() }));
    const checked = host.querySelector("[role='radio'][aria-checked='true']");
    const open = host.querySelector("[role='radio'][aria-checked='false']");
    if (!(checked instanceof HTMLElement) || !(open instanceof HTMLElement)) throw new Error("missing tools");
    const checkedStyle = getComputedStyle(checked);
    const openStyle = getComputedStyle(open);
    expect(checkedStyle.display).not.toBe("none");
    expect(checkedStyle.backgroundColor).toBe("#141413");
    expect(checkedStyle.color).toBe("#fcfcfb");
    expect(checkedStyle.backgroundColor).not.toBe(openStyle.backgroundColor);
  });

  it("selects and resizes a brush from the color wheel canvas", async () => {
    const onSelect = vi.fn();
    const records = [
      syntheticRecord(1, { id: "near", dominant_oklch: { L: 0.5, C: 0.08, h: 0 } }),
      syntheticRecord(2, { id: "far", dominant_oklch: { L: 0.5, C: 0.2, h: 0 } }),
    ];
    const { host } = await mount(createElement(Rail, rail({
      wheelSlot: slot({ records, maxChroma: 0.2, onSelect }),
    })));
    const canvas = host.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error("missing canvas");
    expect(canvas.tabIndex).toBe(0);
    expect(canvas.getAttribute("aria-label")).toBe("Color wheel");
    expect(host.querySelector("[aria-label='Wheel keys']")).toBeNull();
    expect(host.textContent).not.toContain("Cursor hue");
    expect(host.textContent).toContain("HUE");
    expect(host.textContent).toContain("SATURATION: less → more");

    await key(canvas, " ");
    expect(onSelect).toHaveBeenLastCalledWith(["near"], "replace");
    await key(canvas, " ", { shiftKey: true });
    expect(onSelect).toHaveBeenLastCalledWith(["near"], "add");
    await key(canvas, " ", { altKey: true });
    expect(onSelect).toHaveBeenLastCalledWith(["near"], "subtract");

    onSelect.mockClear();
    await key(canvas, "+");
    await key(canvas, "+");
    await key(canvas, " ");
    expect(onSelect).toHaveBeenLastCalledWith(["near", "far"], "replace");

    onSelect.mockClear();
    await key(canvas, "-");
    await key(canvas, "-");
    await key(canvas, "-");
    await key(canvas, " ");
    expect(onSelect).toHaveBeenLastCalledWith(["near"], "replace");

    onSelect.mockClear();
    for (let step = 0; step < 18; step += 1) await key(canvas, "ArrowRight");
    await key(canvas, " ");
    expect(onSelect.mock.calls.at(-1)?.[0]).not.toContain("near");
  });

  it("toggles the large wheel", async () => {
    const onLarge = vi.fn();
    const compact = await mount(createElement(Rail, rail({ onLarge, wheelSlot: slot({ large: false }) })));
    const expand = buttonNamed(compact.host, "Expand wheel");
    expect(expand.getAttribute("aria-pressed")).toBe("false");
    expect(compact.host.querySelector("canvas")?.width).toBe(240);
    await act(async () => {
      expand.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onLarge).toHaveBeenCalledWith(true);
    await compact.unmount();

    const wide = await mount(createElement(Rail, rail({ wheelSlot: slot({ large: true }) })));
    expect(buttonNamed(wide.host, "Expand wheel").getAttribute("aria-pressed")).toBe("true");
    expect(wide.host.querySelector("canvas")?.width).toBe(520);
  });

  it("writes dark and light lightness as min and max", async () => {
    const onFacets = vi.fn();
    const facets: Facets = { monochrome: true };
    const { host } = await mount(createElement(Rail, rail({ facets, onFacets })));
    const title = [...host.querySelectorAll("span")].find((item) => item.textContent === "Lightness");
    const dark = labeledRange(host, "Dark");
    const light = labeledRange(host, "Light");
    if (!title) throw new Error("missing lightness");
    expect(title.compareDocumentPosition(dark) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(dark.min).toBe("0");
    expect(dark.max).toBe("1");
    expect(light.min).toBe("0");
    expect(light.max).toBe("1");
    expect(host.querySelector("input[aria-label='Lightness']")).toBe(dark);

    await setRange(dark, "0.2");
    expect(onFacets).toHaveBeenLastCalledWith({ monochrome: true, lightness: { min: 0.2, max: 1 } });
    await setRange(light, "0.75");
    expect(onFacets).toHaveBeenLastCalledWith({ monochrome: true, lightness: { min: 0, max: 0.75 } });
  });

  it("groups monochrome and multi-swatch under Color", async () => {
    const { host } = await mount(createElement(Rail, rail()));
    const legend = [...host.querySelectorAll("legend")].find((item) => item.textContent === "Color");
    const group = legend?.parentElement;
    expect(group?.textContent).toContain("Monochrome");
    expect(group?.textContent).toContain("Multi-swatch");
    expect(group?.textContent).not.toContain("Clear selection");
  });

  it("plots near-gray library dots on the neutrals strip", async () => {
    const empty = await mount(createElement(Rail, rail()));
    expect(empty.host.querySelector("[aria-label='Neutrals']")?.querySelectorAll(".neutral-dot")).toHaveLength(0);
    await empty.unmount();

    const records = [
      syntheticRecord(1, { id: "gray", dominant_oklch: { L: 0.25, C: 0.02, h: 0 }, dominant_hex: "#bfbfbf" }),
      syntheticRecord(2, { id: "ink", dominant_oklch: { L: 0, C: 0, h: 0 }, dominant_hex: "#111111" }),
      syntheticRecord(3, { id: "red", dominant_oklch: { L: 0.6, C: 0.2, h: 30 }, dominant_hex: "#cc3344" }),
    ];
    const { host } = await mount(createElement(Rail, rail({
      wheelSlot: slot({ records, selectedIds: ["red"] }),
    })));
    const strip = host.querySelector("[aria-label='Neutrals']");
    const dots = [...(strip?.querySelectorAll(".neutral-dot") ?? [])];
    expect(dots.map((dot) => dot.getAttribute("data-id"))).toEqual(["gray", "ink"]);
    const gray = dots[0];
    if (!(gray instanceof HTMLElement)) throw new Error("missing gray dot");
    expect(gray.style.top).toBe("75%");
    expect(gray.style.background).toBe("#bfbfbf");
  });
});
