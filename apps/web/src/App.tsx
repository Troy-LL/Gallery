import { useEffect, useRef, useState } from "react";
import { reduceWheelKey, type Facets, type FilterChip, type PlatformConfig } from "@gallery/core";
import { emptyQuery, estimate, loadPlatforms, queryLibrary, seedLibrary, type PublicRecord } from "./api/client";
import { Grid } from "./grid/Grid";
import { Lightbox } from "./lightbox/Lightbox";
import { Preview } from "./preview/Preview";
import { Wheel } from "./wheel/Wheel";
import type { WheelTool } from "./wheel/gesture";

export function App() {
  const [records, setRecords] = useState<PublicRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [matched, setMatched] = useState(0);
  const [maxChroma, setMaxChroma] = useState(0.2);
  const [facets, setFacets] = useState<Facets>({});
  const [chips, setChips] = useState<FilterChip[]>([]);
  const [platforms, setPlatforms] = useState<PlatformConfig[]>([]);
  const [wheelSelection, setWheelSelection] = useState<string[]>([]);
  const [trayIds, setTrayIds] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [platformId, setPlatformId] = useState("instagram");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [focus, setFocus] = useState<"compare" | "focus">("compare");
  const [tool, setTool] = useState<WheelTool>("auto");
  const [colorBlind, setColorBlind] = useState(false);
  const [multiSwatch, setMultiSwatch] = useState(false);
  const [cursor, setCursor] = useState({ hue: 0, radius: 0.4, brush: 0.08 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [estimateLabel, setEstimateLabel] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stripExif, setStripExif] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const addPhotosRef = useRef<HTMLButtonElement>(null);
  const importPopoverRef = useRef<HTMLDivElement>(null);

  const hasLibrary = records.length > 0;
  const trayReady = trayIds.length > 0;
  const showWorkspace = hasLibrary || Boolean(error);

  async function reload(nextFacets = facets, ids = wheelSelection) {
    const selection = ids.length > 0 ? { type: "ids" as const, ids } : { type: "all" as const };
    const result = await queryLibrary(emptyQuery(nextFacets, selection));
    setRecords(result.records);
    setTotal(result.total);
    setMatched(result.matched);
    setMaxChroma(result.maxChroma || 0.2);
  }

  useEffect(() => {
    void reload().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "The gallery API is not running."));
    void loadPlatforms().then((result) => setPlatforms(result.platforms)).catch(() => undefined);
    void fetch("/api/queue").then(async (response) => {
      if (!response.ok) return;
      const body = (await response.json()) as { paused: boolean };
      setPaused(body.paused);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!importOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setImportOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [importOpen]);

  useEffect(() => {
    if (!trayReady && previewOpen) setPreviewOpen(false);
  }, [trayReady, previewOpen]);

  const open = records.find((record) => record.id === openId) ?? null;

  function toggleTrayId(id: string) {
    setTrayIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <div className="app">
      <header>
        <h1>Color Wheel Gallery</h1>
        <div className="top-bar" role="toolbar" aria-label="Workspace actions">
          <div className="top-bar-primary">
            <button
              ref={addPhotosRef}
              type="button"
              className="chrome-btn"
              aria-expanded={importOpen}
              aria-haspopup="menu"
              onClick={() => setImportOpen((value) => !value)}
            >
              Add photos
            </button>
            {importOpen ? (
              <div
                ref={importPopoverRef}
                className="import-popover"
                role="menu"
                style={{ transformOrigin: "top left" }}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    void estimate(24).then((result) => setEstimateLabel(result.label));
                  }}
                >
                  Sample library
                </button>
                {estimateLabel ? (
                  <p role="status">
                    {estimateLabel}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        void seedLibrary(24).then(() => {
                          setEstimateLabel(null);
                          setImportOpen(false);
                          setWheelSelection([]);
                          return reload(facets, []);
                        });
                      }}
                    >
                      Confirm import
                    </button>
                  </p>
                ) : null}
              </div>
            ) : null}
            {showWorkspace ? (
              <>
                <button
                  type="button"
                  className="chrome-btn"
                  aria-pressed={previewOpen}
                  disabled={!trayReady}
                  title={trayReady ? undefined : "Add photos to the set"}
                  onClick={() => {
                    if (trayReady) setPreviewOpen((value) => !value);
                  }}
                >
                  Preview
                </button>
                <button
                  type="button"
                  className="chrome-btn"
                  disabled={!trayReady}
                  title={trayReady ? undefined : "Add photos to the set"}
                  onClick={() => {
                    if (!trayReady) return;
                    void fetch("/api/export", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ imageIds: trayIds, platform: platformId, keepExif: !stripExif }),
                    }).then(async (response) => {
                      if (!response.ok) throw new Error(await response.text());
                      const blob = await response.blob();
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement("a");
                      link.href = url;
                      link.download = `${platformId}.zip`;
                      link.click();
                      URL.revokeObjectURL(url);
                    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Export failed"));
                  }}
                >
                  Export
                </button>
                {!trayReady ? <span className="tray-hint">Add photos to the set</span> : null}
              </>
            ) : null}
          </div>
          {showWorkspace ? (
            <div className="top-bar-filters">
              <div className="chips" aria-label="Active filters">
                {chips.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => {
                      const nextChips = chips.filter((item) => item.id !== chip.id);
                      setChips(nextChips);
                      const next: Facets = {};
                      for (const item of nextChips) Object.assign(next, item.facets);
                      setFacets(next);
                      void reload(next, wheelSelection);
                    }}
                  >
                    {chip.label}
                  </button>
                ))}
                <span>{matched} of {total}</span>
              </div>
              <div className="filters">
                {(["portrait", "landscape", "square"] as const).map((orientation) => (
                  <button
                    key={orientation}
                    type="button"
                    aria-pressed={facets.orientation?.[0] === orientation}
                    onClick={() => {
                      const next = { ...facets, orientation: facets.orientation?.[0] === orientation ? undefined : [orientation] };
                      setFacets(next);
                      void reload(next, wheelSelection);
                    }}
                  >
                    {orientation}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </header>
      {error ? <p role="status">{error}</p> : null}
      {paused ? <p className="banner">Queue paused</p> : null}
      <div className="workspace">
        {hasLibrary ? (
          <aside>
            <Wheel
              records={records}
              maxChroma={maxChroma}
              tool={tool}
              colorBlind={colorBlind}
              multiSwatch={multiSwatch}
              large={false}
              onSelect={(ids, gestureMode) => {
                const next = gestureMode === "replace" ? ids : gestureMode === "add" ? [...new Set([...wheelSelection, ...ids])] : wheelSelection.filter((id) => !ids.includes(id));
                setWheelSelection(next);
                void reload(facets, next);
              }}
            />
            <div
              aria-label="Wheel keys"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === " ") {
                  event.preventDefault();
                  return;
                }
                setCursor(reduceWheelKey(cursor, event.key));
              }}
            />
            <p>Cursor hue {Math.round(cursor.hue)} radius {cursor.radius.toFixed(2)} brush {cursor.brush.toFixed(2)}</p>
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
                  const next = { ...facets, lightness: { min: 0, max } };
                  setFacets(next);
                  void reload(next, wheelSelection);
                }}
              />
            </label>
            <button
              type="button"
              aria-pressed={facets.monochrome === true}
              onClick={() => {
                const next = { ...facets, monochrome: facets.monochrome ? undefined : true };
                setFacets(next);
                void reload(next, wheelSelection);
              }}
            >
              Monochrome
            </button>
            <label>
              Tool
              <select aria-label="Wheel tool" value={tool} onChange={(event) => setTool(event.target.value as WheelTool)}>
                {["auto", "wedge", "lasso", "ring", "brush", "eyedropper"].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <button type="button" aria-pressed={multiSwatch} onClick={() => setMultiSwatch((value) => !value)}>Multi-swatch</button>
            <button type="button" aria-pressed={colorBlind} onClick={() => setColorBlind((value) => !value)}>Color-blind safe</button>
          </aside>
        ) : null}
        <main>
          <div className="main-stage">
            {hasLibrary ? (
              <Grid
                records={records}
                onOpen={(id) => {
                  toggleTrayId(id);
                  setOpenId(id);
                }}
              />
            ) : null}
            {previewOpen && trayReady ? (
              <div className="preview-panel" aria-label="Post preview">
                <Preview
                  records={records}
                  orderedIds={trayIds}
                  platforms={platforms}
                  caption={caption}
                  onCaption={setCaption}
                  onMove={(id, direction) => {
                    setTrayIds((current) => {
                      const index = current.indexOf(id);
                      const next = index + direction;
                      if (index < 0 || next < 0 || next >= current.length) return current;
                      const copy = [...current];
                      const [item] = copy.splice(index, 1);
                      if (!item) return current;
                      copy.splice(next, 0, item);
                      return copy;
                    });
                  }}
                  theme={theme}
                  focus={focus}
                  platformId={platformId}
                  onPlatform={setPlatformId}
                  onTheme={setTheme}
                  onFocus={setFocus}
                />
              </div>
            ) : null}
          </div>
          {hasLibrary ? (
            <div className="tray-slot" aria-label="Selection tray">
              {trayReady ? (
                <ul className="tray-ids">
                  {trayIds.map((id) => {
                    const record = records.find((item) => item.id === id);
                    return (
                      <li key={id}>
                        {record ? <img src={`/api/media/${id}?kind=thumb`} alt="" width={48} height={48} /> : id}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="tray-empty">Click photos to build a set</p>
              )}
              <label className="export-options">
                <input type="checkbox" checked={stripExif} aria-label="Strip EXIF" onChange={(event) => setStripExif(event.target.checked)} /> Strip EXIF
              </label>
            </div>
          ) : null}
        </main>
      </div>
      {open ? <Lightbox record={open} onClose={() => setOpenId(null)} onChange={() => void reload()} /> : null}
    </div>
  );
}