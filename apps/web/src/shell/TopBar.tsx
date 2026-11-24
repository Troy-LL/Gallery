import { type RefObject } from "react";
import type { Facets, FilterChip } from "@gallery/core";

export type WorkspaceMode = "gallery" | "preview";

export type TopBarProps = {
  showWorkspace: boolean;
  mode: WorkspaceMode;
  onMode: (mode: WorkspaceMode) => void;
  trayReady: boolean;
  importOpen: boolean;
  onImportOpen: (open: boolean) => void;
  addPhotosRef: RefObject<HTMLButtonElement | null>;
  importPopoverRef: RefObject<HTMLDivElement | null>;
  estimateLabel: string | null;
  onEstimate: () => void;
  onConfirmImport: () => void;
  onExport: () => void;
  matched: number;
  total: number;
  chips: FilterChip[];
  onRemoveChip: (chipId: string) => void;
  facets: Facets;
  onOrientation: (orientation: "portrait" | "landscape" | "square") => void;
};

export function TopBar(props: TopBarProps) {
  return (
    <header>
      <h1>Color Wheel Gallery</h1>
      <div className="top-bar" role="toolbar" aria-label="Workspace actions">
        <div className="top-bar-primary">
          <button
            ref={props.addPhotosRef}
            type="button"
            className="chrome-btn"
            aria-expanded={props.importOpen}
            aria-haspopup="menu"
            onClick={() => props.onImportOpen(!props.importOpen)}
          >
            Add photos
          </button>
          {props.importOpen ? (
            <div
              ref={props.importPopoverRef}
              className="import-popover"
              role="menu"
              style={{ transformOrigin: "top left" }}
            >
              <button type="button" role="menuitem" onClick={props.onEstimate}>
                Sample library
              </button>
              {props.estimateLabel ? (
                <p role="status">
                  {props.estimateLabel}
                  <button type="button" role="menuitem" onClick={props.onConfirmImport}>
                    Confirm import
                  </button>
                </p>
              ) : null}
            </div>
          ) : null}
          {props.showWorkspace ? (
            <>
              <nav className="modes" aria-label="Workspace mode">
                <button
                  type="button"
                  className="chrome-btn"
                  aria-pressed={props.mode === "gallery"}
                  onClick={() => props.onMode("gallery")}
                >
                  Gallery
                </button>
                <button
                  type="button"
                  className="chrome-btn"
                  aria-pressed={props.mode === "preview"}
                  disabled={!props.trayReady}
                  title={props.trayReady ? undefined : "Add photos to the set"}
                  onClick={() => {
                    if (props.trayReady) props.onMode("preview");
                  }}
                >
                  Preview
                </button>
              </nav>
              <button
                type="button"
                className="chrome-btn"
                disabled={!props.trayReady}
                title={props.trayReady ? undefined : "Add photos to the set"}
                onClick={() => {
                  if (props.trayReady) props.onExport();
                }}
              >
                Export
              </button>
              {!props.trayReady ? <span className="tray-hint">Add photos to the set</span> : null}
            </>
          ) : null}
        </div>
        {props.showWorkspace ? (
          <div className="top-bar-filters">
            <div className="chips" aria-label="Active filters">
              {props.chips.map((chip) => (
                <button key={chip.id} type="button" onClick={() => props.onRemoveChip(chip.id)}>
                  {chip.label}
                </button>
              ))}
              <span>
                {props.matched} of {props.total}
              </span>
            </div>
            <div className="filters">
              {(["portrait", "landscape", "square"] as const).map((orientation) => (
                <button
                  key={orientation}
                  type="button"
                  aria-pressed={props.facets.orientation?.[0] === orientation}
                  onClick={() => props.onOrientation(orientation)}
                >
                  {orientation}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}