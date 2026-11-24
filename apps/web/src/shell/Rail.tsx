import type { Facets } from "@gallery/core";
import type { ComponentProps } from "react";
import { Wheel } from "../wheel/Wheel";
import { WheelToolMenu } from "../wheel/WheelToolMenu";
import type { WheelTool } from "../wheel/gesture";

type WheelSlotProps = ComponentProps<typeof Wheel>;

export type RailProps = {
  wheelSlot: WheelSlotProps;
  tool: WheelTool;
  onTool: (tool: WheelTool) => void;
  cursor: { hue: number; radius: number; brush: number };
  onCursorKey: (key: string) => void;
  facets: Facets;
  onFacets: (facets: Facets) => void;
  multiSwatch: boolean;
  onMultiSwatch: (value: boolean) => void;
};

export function Rail(props: RailProps) {
  return (
    <aside>
      <div className="wheel-rail">
        <Wheel {...props.wheelSlot} />
        <WheelToolMenu value={props.tool} onChange={props.onTool} />
      </div>
      <div
        aria-label="Wheel keys"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === " ") {
            event.preventDefault();
            return;
          }
          props.onCursorKey(event.key);
        }}
      />
      <p>
        Cursor hue {Math.round(props.cursor.hue)} radius {props.cursor.radius.toFixed(2)} brush {props.cursor.brush.toFixed(2)}
      </p>
      <label>
        Lightness
        <input
          aria-label="Lightness"
          type="range"
          min={0}
          max={100}
          defaultValue={100}
          onChange={(event) => {
            const max = Number(event.target.value) / 100;
            props.onFacets({ ...props.facets, lightness: { min: 0, max } });
          }}
        />
      </label>
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
    </aside>
  );
}