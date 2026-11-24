import { WHEEL_TOOLS, type WheelTool } from "./gesture";

function toolLabel(tool: WheelTool): string {
  switch (tool) {
    case "auto":
    case "wedge":
    case "lasso":
    case "ring":
    case "brush":
    case "eyedropper":
      return tool;
    default: {
      const unreachable: never = tool;
      return unreachable;
    }
  }
}

export function WheelToolMenu(props: { value: WheelTool; onChange: (tool: WheelTool) => void }) {
  return (
    <div className="wheel-tool-menu">
      <div className="wheel-tools" role="radiogroup" aria-label="Wheel tool">
        {WHEEL_TOOLS.map((tool) => (
          <button
            key={tool}
            type="button"
            role="radio"
            className="wheel-tool-option"
            aria-checked={props.value === tool}
            onClick={() => props.onChange(tool)}
          >
            {toolLabel(tool)}
          </button>
        ))}
      </div>
      <p className="wheel-gesture-hint">Shift adds · Alt subtracts</p>
    </div>
  );
}
