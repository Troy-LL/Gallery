export type WheelTool = "auto" | "wedge" | "lasso" | "ring" | "brush" | "eyedropper";
export type Gesture = "wedge" | "lasso" | "click" | "ring" | "brush" | "eyedropper";

export function classifyGesture(tool: WheelTool, radius: number, moved: number): Gesture {
  switch (tool) {
    case "eyedropper":
      return "eyedropper";
    case "ring":
      return "ring";
    case "brush":
      return "brush";
    case "wedge":
      return "wedge";
    case "lasso":
      return "lasso";
    case "auto":
      if (radius > 0.86 || moved > 0.03) return "wedge";
      return "click";
    default: {
      const unreachable: never = tool;
      return unreachable;
    }
  }
}
