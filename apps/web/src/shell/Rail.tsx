import { matchHarmony, type Facets, type Palette, type Swatch } from "@gallery/core";
import { useMemo, useState, type ComponentProps } from "react";
import { savePalette, type PublicRecord } from "../api/client";
import { Wheel } from "../wheel/Wheel";
import { WheelToolMenu } from "../wheel/WheelToolMenu";
import type { WheelTool } from "../wheel/gesture";

const NEAR_GRAY_CHROMA = 0.02;
const NEUTRAL_BUCKETS = 100;

type WheelSlotProps = ComponentProps<typeof Wheel>;

export type RailProps = {
  wheelSlot: WheelSlotProps;
  tool: WheelTool;
  onTool: (tool: WheelTool) => void;
  onLarge: (large: boolean) => void;
  facets: Facets;
  onFacets: (facets: Facets) => void;
  multiSwatch: boolean;
  onMultiSwatch: (value: boolean) => void;
  palettes?: Palette[];
  onPalettes?: (palettes: Palette[]) => void;
};

const HARMONY = ["analogous", "complementary", "triadic"] as const;

export function Rail(props: RailProps) {
  const palettes = props.palettes ?? [];
  const [paletteName, setPaletteName] = useState("");
  const [exportText, setExportText] = useState<string | null>(null);
  const [colorBlind, setColorBlind] = useState(false);
  const min = props.facets.lightness?.min ?? 0;
  const max = props.facets.lightness?.max ?? 1;
  const { records: wheelRecords, selectedIds } = props.wheelSlot;
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedRecords = useMemo(
    () => (selectedSet.size === 0 ? [] : wheelRecords.filter((record) => selectedSet.has(record.id))),
    [wheelRecords, selectedSet],
  );
  const harmonySource = selectedRecords.length === 1 ? selectedRecords[0] : undefined;
  const harmonyMatches = useMemo(() => {
    if (!harmonySource) return null;
    const rows = wheelRecords.map((record) => ({ id: record.id, hue: record.dominant_oklch.h }));
    return HARMONY.map((kind) => ({
      kind,
      ids: matchHarmony(rows, harmonySource.id, harmonySource.dominant_oklch.h, kind),
    }));
  }, [wheelRecords, harmonySource]);

  async function saveCurrent() {
    const name = paletteName.trim();
    if (!name) return;
    const selected = props.wheelSlot.selectedIds;
    const records = selected.length > 0 ? selectedRecords : wheelRecords;
    const palette: Palette = {
      id: crypto.randomUUID(),
      name,
      selection_shape: selected.length > 0 ? { type: "ids", ids: [...selected] } : { type: "all" },
      swatches: records.map(dominantSwatch),
    };
    await savePalette(palette);
    props.onPalettes?.([...palettes, palette]);
    setPaletteName("");
  }

  function reapply(palette: Palette) {
    props.wheelSlot.onSelect(paletteIds(palette), "replace");
  }

  function publishExport(text: string, filename: string) {
    setExportText(text);
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <aside>
      <div className="wheel-rail">
        <div className="wheel-stage">
          <Wheel {...props.wheelSlot} colorBlind={colorBlind} />
          <NeutralsStrip records={props.wheelSlot.records} />
        </div>
        <WheelToolMenu value={props.tool} onChange={props.onTool} />
        <button
          type="button"
          aria-pressed={props.wheelSlot.large === true}
          onClick={() => props.onLarge(props.wheelSlot.large !== true)}
        >
          Expand wheel
        </button>
        <button type="button" onClick={() => props.wheelSlot.onSelect([], "replace")}>
          Clear selection
        </button>
      </div>
      <div className="lightness">
        <span>Lightness</span>
        <label>
          <span>Dark</span>
          <input
            aria-label="Lightness"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={min}
            onChange={(event) => {
              const nextMin = Math.min(Number(event.target.value), max);
              props.onFacets({ ...props.facets, lightness: { min: nextMin, max } });
            }}
          />
        </label>
        <label>
          <span>Light</span>
          <input
            aria-label="Light"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={max}
            onChange={(event) => {
              const nextMax = Math.max(Number(event.target.value), min);
              props.onFacets({ ...props.facets, lightness: { min, max: nextMax } });
            }}
          />
        </label>
      </div>
      <fieldset className="color-group">
        <legend>Color</legend>
        <button
          type="button"
          aria-pressed={props.facets.monochrome === true}
          onClick={() => {
            props.onFacets({ ...props.facets, monochrome: props.facets.monochrome ? undefined : true });
          }}
        >
          Monochrome
        </button>
        <button type="button" aria-pressed={props.multiSwatch} onClick={() => props.onMultiSwatch(!props.multiSwatch)}>
          Multi-swatch
        </button>
        <button type="button" aria-pressed={colorBlind} onClick={() => setColorBlind((value) => !value)}>
          Color-blind safe
        </button>
      </fieldset>
      {harmonyMatches ? (
        <fieldset className="color-group">
          <legend>Harmony</legend>
          {harmonyMatches.map(({ kind, ids }) => (
            <button key={kind} type="button" onClick={() => props.wheelSlot.onSelect(ids, "replace")}>
              {`${harmonyLabel(kind)} ${ids.length}`}
            </button>
          ))}
        </fieldset>
      ) : null}
      <section className="saved-palettes" aria-label="Saved palettes">
        <label>
          Palette name
          <input aria-label="Palette name" value={paletteName} onChange={(event) => setPaletteName(event.target.value)} />
        </label>
        <button type="button" onClick={() => void saveCurrent()}>
          Save palette
        </button>
        <ul>
          {palettes.map((palette) => (
            <li key={palette.id}>
              <button type="button" onClick={() => reapply(palette)}>
                {palette.name}
              </button>
              <button
                type="button"
                onClick={() => publishExport(palette.swatches.map((swatch) => swatch.hex).join("\n"), `${palette.name}.txt`)}
              >
                Export hex
              </button>
              <button type="button" onClick={() => publishExport(JSON.stringify(palette), `${palette.name}.json`)}>
                Export JSON
              </button>
            </li>
          ))}
        </ul>
        {exportText !== null ? (
          <output className="palette-export" aria-label="Palette export">{exportText}</output>
        ) : null}
      </section>
    </aside>
  );
}

function dominantSwatch(record: PublicRecord): Swatch {
  return {
    hex: record.dominant_hex,
    h: record.dominant_h,
    s: record.dominant_s,
    l: record.dominant_l,
    oklch: record.dominant_oklch,
    weight: 1,
  };
}

function paletteIds(palette: Palette): string[] {
  switch (palette.selection_shape.type) {
    case "ids":
      return palette.selection_shape.ids;
    case "all":
    case "neighborhood":
    case "wedge":
    case "lasso":
    case "ring":
    case "brush":
      return [];
    default: {
      const unreachable: never = palette.selection_shape;
      return unreachable;
    }
  }
}

function harmonyLabel(kind: (typeof HARMONY)[number]): string {
  switch (kind) {
    case "analogous":
      return "Analogous";
    case "complementary":
      return "Complementary";
    case "triadic":
      return "Triadic";
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

function NeutralsStrip(props: { records: PublicRecord[] }) {
  const dots = useMemo(() => {
    const seen = new Set<number>();
    const bucketed: PublicRecord[] = [];
    for (const record of props.records) {
      if ((record.dominant_oklch?.C ?? 1) > NEAR_GRAY_CHROMA) continue;
      const bucket = Math.min(NEUTRAL_BUCKETS - 1, Math.max(0, Math.floor(record.dominant_oklch.L * NEUTRAL_BUCKETS)));
      if (seen.has(bucket)) continue;
      seen.add(bucket);
      bucketed.push(record);
    }
    return bucketed;
  }, [props.records]);

  return (
    <div className="neutrals" aria-label="Neutrals">
      {dots.map((record) => (
        <span
          key={record.id}
          className="neutral-dot"
          data-id={record.id}
          style={{ top: `${(1 - record.dominant_oklch.L) * 100}%`, background: record.dominant_hex }}
        />
      ))}
    </div>
  );
}
