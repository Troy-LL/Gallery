// @vitest-environment happy-dom
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PublicRecord } from "../src/api/client";
import { Tray } from "../src/tray/Tray";
import "../src/tray.css";

const records = [
  { id: "photo-a", needs_tags: false },
  { id: "photo-b", needs_tags: false },
] as PublicRecord[];

type TrayTestProps = {
  orderedIds?: string[];
  exporting?: boolean;
  platformId?: string;
  stripExif?: boolean;
};

function mountTray(overrides: TrayTestProps = {}) {
  const onExport = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const props = {
    records,
    orderedIds: overrides.orderedIds ?? [],
    onReorder: vi.fn(),
    onToggle: vi.fn(),
    onInspect: vi.fn(),
    stripExif: overrides.stripExif ?? true,
    onStripExif: vi.fn(),
    platformId: overrides.platformId ?? "instagram",
    exporting: overrides.exporting ?? false,
    onExport,
  };
  act(() => {
    createRoot(host).render(createElement(Tray, props));
  });
  return { host, onExport };
}

describe("Tray", () => {
  it("uses Selection copy and sticky horizontal strip layout", () => {
    const { host } = mountTray();
    const tray = host.querySelector("section.tray");
    expect(tray?.getAttribute("aria-label")).toBe("Selection");
    expect(host.textContent).toContain("Click photos to build a selection");
    expect([...host.querySelectorAll("button")].map((button) => button.textContent?.trim())).not.toContain("Add visible");

    const style = tray ? getComputedStyle(tray) : null;
    expect(style?.position).toBe("sticky");
    expect(style?.bottom).toBe("0px");
    expect(style?.height).toBe("96px");

    const withThumbs = mountTray({ orderedIds: ["photo-a"] });
    const strip = withThumbs.host.querySelector(".tray-ids");
    const stripStyle = strip ? getComputedStyle(strip) : null;
    expect(stripStyle?.overflowX).toBe("auto");
    expect(stripStyle?.flexWrap).toBe("nowrap");
  });

  it("shows selection count and export controls", () => {
    const { host, onExport } = mountTray({ orderedIds: ["photo-a", "photo-b"] });
    expect(host.textContent).toContain("2 in selection");

    const exportButton = [...host.querySelectorAll("button")].find((button) => button.classList.contains("primary"));
    expect(exportButton?.textContent?.trim()).toBe("Export instagram zip");
    expect(exportButton?.disabled).toBe(false);

    act(() => {
      exportButton?.click();
    });
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("disables export when empty and while exporting", () => {
    const empty = mountTray();
    const emptyExport = [...empty.host.querySelectorAll("button")].find((button) => button.classList.contains("primary"));
    expect(emptyExport?.disabled).toBe(true);

    const busy = mountTray({ orderedIds: ["photo-a"], exporting: true });
    const busyExport = [...busy.host.querySelectorAll("button")].find((button) => button.classList.contains("primary"));
    expect(busyExport?.textContent?.trim()).toBe("Exporting…");
    expect(busyExport?.disabled).toBe(true);
  });

  it("keeps at least a 24px-tall EXIF label hit target", () => {
    const { host } = mountTray();
    const label = host.querySelector(".export-options");
    const labelStyle = label ? getComputedStyle(label) : null;
    expect(labelStyle?.minHeight).toBe("24px");
    expect(host.querySelector("input[aria-label='Strip EXIF']")).toBeTruthy();
  });
});