import { useEffect, useRef, useState } from "react";
import { WHEEL_TOOLS, type WheelTool } from "./gesture";

export function WheelToolMenu(props: { value: WheelTool; onChange: (tool: WheelTool) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointerDown(event: PointerEvent) {
      const root = rootRef.current;
      if (root && !root.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div className="wheel-tool-menu" ref={rootRef}>
      <button
        type="button"
        className="chrome-btn wheel-tool-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Wheel tool, ${props.value}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="wheel-tool-label">Tool</span>
        <span className="wheel-tool-value">{props.value}</span>
      </button>
      {open ? (
        <div className="wheel-tool-popover" role="menu" aria-label="Wheel tool">
          {WHEEL_TOOLS.map((tool) => (
            <button
              key={tool}
              type="button"
              role="menuitemradio"
              className="wheel-tool-option"
              aria-checked={props.value === tool}
              onClick={() => {
                props.onChange(tool);
                setOpen(false);
              }}
            >
              {tool}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}