// @vitest-environment happy-dom
import { createElement, createRef } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { FilterChip } from "@gallery/core";
import { TopBar } from "../src/shell/TopBar";

function baseProps() {
  return {
    showWorkspace: true,
    mode: "gallery" as const,
    onMode: vi.fn(),
    trayReady: false,
    importOpen: false,
    onImportOpen: vi.fn(),
    addPhotosRef: createRef<HTMLButtonElement>(),
    importPopoverRef: createRef<HTMLDivElement>(),
    estimateLabel: null,
    onEstimate: vi.fn(),
    onConfirmImport: vi.fn(),
    matched: 3,
    total: 10,
    chips: [
      { id: "temperature:warm", label: "warm", facets: { temperature: ["warm"] } } satisfies FilterChip,
    ],
    onRemoveChip: vi.fn(),
    facets: { temperature: ["warm" as const] },
    onOrientation: vi.fn(),
    onClearFilters: vi.fn(),
    onNaturalLanguage: vi.fn().mockResolvedValue(undefined),
    strictness: 0.5,
    onStrictness: vi.fn(),
    onAspectRatio: vi.fn(),
    onSharpness: vi.fn(),
    onTemperature: vi.fn(),
    onFavorites: vi.fn(),
    onNeverUsed: vi.fn(),
  };
}

async function renderTopBar(overrides: Partial<ReturnType<typeof baseProps>> = {}) {
  const props = { ...baseProps(), ...overrides };
  const host = document.createElement("div");
  document.body.append(host);
  await act(async () => {
    createRoot(host).render(createElement(TopBar, props));
  });
  return { host, props };
}

describe("TopBar", () => {
  it("lays out product chrome without Export on row one", async () => {
    const { host } = await renderTopBar();
    expect(host.textContent).toContain("Color Wheel Gallery");
    const labels = [...host.querySelectorAll("button")].map((button) => button.textContent?.trim());
    expect(labels).toContain("Add photos");
    expect(labels).toContain("Gallery");
    expect(labels).toContain("Preview");
    expect(labels).not.toContain("Export");
    const preview = [...host.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Preview");
    expect(preview?.disabled).toBe(true);
    expect(host.textContent).toContain("Add photos to the set");
  });

  it("submits natural language and clears filters from row two", async () => {
    const { host, props } = await renderTopBar();
    const input = host.querySelector("input[aria-label='Natural language filter']") as HTMLInputElement;
    expect(input).toBeTruthy();
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setValue?.call(input, "warm portraits");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const form = input.closest("form");
    expect(form).toBeTruthy();
    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(props.onNaturalLanguage).toHaveBeenCalledWith("warm portraits");

    const clear = [...host.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Clear all");
    expect(clear).toBeTruthy();
    clear?.click();
    expect(props.onClearFilters).toHaveBeenCalled();
  });

  it("shows facet toggles, chips, and strictness", async () => {
    const { host, props } = await renderTopBar({ trayReady: true });
    const warm = [...host.querySelectorAll(".filters button")].find((button) => button.textContent?.trim() === "warm");
    expect(warm?.getAttribute("aria-pressed")).toBe("true");
    (warm as HTMLButtonElement).click();
    expect(props.onTemperature).toHaveBeenCalledWith("warm");

    const chip = [...host.querySelectorAll(".chips button")].find((button) => button.textContent?.trim() === "warm");
    expect(chip).toBeTruthy();
    (chip as HTMLButtonElement).click();
    expect(props.onRemoveChip).toHaveBeenCalledWith("temperature:warm");

    const slider = host.querySelector("input[aria-label='Strictness']") as HTMLInputElement;
    expect(slider).toBeTruthy();
    expect(slider.value).toBe("0.5");
    await act(async () => {
      slider.value = "0.7";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(props.onStrictness).toHaveBeenCalled();
  });
});