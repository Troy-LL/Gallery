import type { Facets } from "@gallery/core";
import type { ComponentProps } from "react";
import type { PublicRecord } from "../api/client";
import { Wheel } from "../wheel/Wheel";
import { WheelToolMenu } from "../wheel/WheelToolMenu";
import type { WheelTool } from "../wheel/gesture";

const NEAR_GRAY_CHROMA = 0.02;

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
};

export function Rail(props: RailProps) {
  const min = props.facets.lightness?.min ?? 0;
  const max = props.facets.lightness?.max ?? 1;
  return (
    <aside>
      <div className="wheel-rail">
        <div className="wheel-stage">
          <Wheel {...props.wheelSlot} />
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
      </fieldset>
    </aside>
  );
}

function NeutralsStrip(props: { records: PublicRecord[] }) {
  const dots = props.records.filter((record) => (record.dominant_oklch?.C ?? 1) <= NEAR_GRAY_CHROMA);
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
