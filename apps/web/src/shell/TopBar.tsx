import { type FormEvent, type RefObject, useState } from "react";
import {
  ASPECT_BUCKETS,
  ORIENTATIONS,
  SHARPNESS,
  TEMPERATURES,
  type Facets,
  type FilterChip,
} from "@gallery/core";

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
  matched: number;
  total: number;
  chips: FilterChip[];
  onRemoveChip: (chipId: string) => void;
  facets: Facets;
  onOrientation: (orientation: (typeof ORIENTATIONS)[number]) => void;
  onAspectRatio: (bucket: (typeof ASPECT_BUCKETS)[number]) => void;
  onSharpness: (value: (typeof SHARPNESS)[number]) => void;
  onTemperature: (value: (typeof TEMPERATURES)[number]) => void;
  onFavorites: () => void;
  onNeverUsed: () => void;
  onClearFilters: () => void;
  onNaturalLanguage: (text: string) => Promise<void>;
  strictness: number;
  onStrictness: (value: number) => void;
};

export function TopBar(props: TopBarProps) {
  const [nlDraft, setNlDraft] = useState("");

  async function onNlSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = nlDraft.trim();
    if (!text) return;
    await props.onNaturalLanguage(text);
    setNlDraft("");
  }

  return (
    <header className="topbar-shell">
      <div className="top-bar-row top-bar-row-primary">
        <h1 className="product-mark">Color Wheel Gallery</h1>
        <div className="top-bar" role="toolbar" aria-label="Workspace actions">
          <div className="top-bar-primary">
            {props.showWorkspace ? (
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
            ) : null}
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
            {props.showWorkspace && !props.trayReady ? (
              <span className="tray-hint">Add photos to the set</span>
            ) : null}
          </div>
        </div>
      </div>
      {props.showWorkspace ? (
        <div className="top-bar-row top-bar-row-filters">
          <form className="nl-filter" onSubmit={(event) => void onNlSubmit(event)}>
            <input
              aria-label="Natural language filter"
              value={nlDraft}
              onChange={(event) => setNlDraft(event.target.value)}
              placeholder="Describe what you want to see"
            />
          </form>
          <button type="button" className="chrome-btn" onClick={props.onClearFilters}>
            Clear all
          </button>
          <div className="filters" aria-label="Facet filters">
            {ORIENTATIONS.map((orientation) => (
              <button
                key={orientation}
                type="button"
                aria-pressed={props.facets.orientation?.includes(orientation) ?? false}
                onClick={() => props.onOrientation(orientation)}
              >
                {orientation}
              </button>
            ))}
            {ASPECT_BUCKETS.map((bucket) => (
              <button
                key={bucket}
                type="button"
                aria-pressed={props.facets.aspect_ratio?.includes(bucket) ?? false}
                onClick={() => props.onAspectRatio(bucket)}
              >
                {bucket}
              </button>
            ))}
            {SHARPNESS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={props.facets.sharpness?.includes(value) ?? false}
                onClick={() => props.onSharpness(value)}
              >
                {value}
              </button>
            ))}
            {TEMPERATURES.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={props.facets.temperature?.includes(value) ?? false}
                onClick={() => props.onTemperature(value)}
              >
                {value}
              </button>
            ))}
            <button type="button" aria-pressed={props.facets.favorites === true} onClick={props.onFavorites}>
              favorites
            </button>
            <button type="button" aria-pressed={props.facets.neverUsed === true} onClick={props.onNeverUsed}>
              never used
            </button>
          </div>
          <div className="chips" aria-label="Active filters">
            {props.chips.map((chip) => (
              <button key={chip.id} type="button" className="filter-chip" onClick={() => props.onRemoveChip(chip.id)}>
                {chip.label}
              </button>
            ))}
            <span>
              {props.matched} of {props.total}
            </span>
          </div>
          <label className="strictness">
            <span>Strictness</span>
            <input
              aria-label="Strictness"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={props.strictness}
              onInput={(event) => props.onStrictness(Number(event.currentTarget.value))}
            />
          </label>
        </div>
      ) : null}
    </header>
  );
}