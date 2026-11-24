import { useEffect, useState } from "react";
import { reduceWheelKey, type Facets, type FilterChip, type PlatformConfig } from "@gallery/core";
import { emptyQuery, estimate, loadPlatforms, naturalLanguage, queryLibrary, seedLibrary, type PublicRecord } from "./api/client";
import { Grid } from "./grid/Grid";
import { Lightbox } from "./lightbox/Lightbox";
import { Preview } from "./preview/Preview";
import { Wheel } from "./wheel/Wheel";
import type { WheelTool } from "./wheel/gesture";

type Mode = "gallery" | "wheel" | "preview";

export function App() {
  const [mode, setMode] = useState<Mode>("gallery");
  const [records, setRecords] = useState<PublicRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [matched, setMatched] = useState(0);
  const [maxChroma, setMaxChroma] = useState(0.2);
  const [facets, setFacets] = useState<Facets>({});
  const [chips, setChips] = useState<FilterChip[]>([]);
  const [platforms, setPlatforms] = useState<PlatformConfig[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
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
  const [queryText, setQueryText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [stripExif, setStripExif] = useState(true);

  async function reload(nextFacets = facets, ids = selected) {
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

  const open = records.find((record) => record.id === openId) ?? null;
  return (
    <div className="app">
      <header>
        <h1>Color Wheel Gallery</h1>
        <nav aria-label="Modes">
          <button aria-pressed={mode === "gallery"} onClick={() => setMode("gallery")}>Gallery</button>
          <button aria-pressed={mode === "wheel"} onClick={() => setMode("wheel")}>Wheel focus</button>
          <button aria-pressed={mode === "preview"} onClick={() => setMode("preview")}>Post preview</button>
        </nav>
      </header>
      {error ? <p role="status">{error}</p> : null}
      {paused ? <p className="banner">Queue paused</p> : null}
      <div className="workspace">
        <aside>
          <Wheel
            records={records}
            maxChroma={maxChroma}
            tool={tool}
            colorBlind={colorBlind}
            multiSwatch={multiSwatch}
            large={mode === "wheel"}
            onSelect={(ids, gestureMode) => {
              const next = gestureMode === "replace" ? ids : gestureMode === "add" ? [...new Set([...selected, ...ids])] : selected.filter((id) => !ids.includes(id));
              setSelected(next);
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
                void reload(next, selected);
              }}
            />
          </label>
          <button aria-pressed={facets.monochrome === true} onClick={() => {
            const next = { ...facets, monochrome: facets.monochrome ? undefined : true };
            setFacets(next);
            void reload(next, selected);
          }}>Monochrome</button>
          <label>
            Tool
            <select aria-label="Wheel tool" value={tool} onChange={(event) => setTool(event.target.value as WheelTool)}>
              {["auto", "wedge", "lasso", "ring", "brush", "eyedropper"].map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <button aria-pressed={multiSwatch} onClick={() => setMultiSwatch((value) => !value)}>Multi-swatch</button>
          <button aria-pressed={colorBlind} onClick={() => setColorBlind((value) => !value)}>Color-blind safe</button>
        </aside>
        <main>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void naturalLanguage(queryText).then((result) => {
                setChips(result.chips);
                const next: Facets = {};
                for (const chip of result.chips) Object.assign(next, chip.facets);
                setFacets(next);
                void reload(next, selected);
              });
            }}
          >
            <input aria-label="Natural language filter" value={queryText} onChange={(event) => setQueryText(event.target.value)} placeholder="warm portraits" />
            <button type="submit">Filter</button>
          </form>
          <div className="chips" aria-label="Active filters">
            {chips.map((chip) => (
              <button
                key={chip.id}
                onClick={() => {
                  const nextChips = chips.filter((item) => item.id !== chip.id);
                  setChips(nextChips);
                  const next: Facets = {};
                  for (const item of nextChips) Object.assign(next, item.facets);
                  setFacets(next);
                  void reload(next, selected);
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
                aria-pressed={facets.orientation?.[0] === orientation}
                onClick={() => {
                  const next = { ...facets, orientation: facets.orientation?.[0] === orientation ? undefined : [orientation] };
                  setFacets(next);
                  void reload(next, selected);
                }}
              >
                {orientation}
              </button>
            ))}
          </div>
          {mode === "preview" ? (
            <Preview
              records={records}
              orderedIds={selected.length > 0 ? selected : records.slice(0, 3).map((record) => record.id)}
              platforms={platforms}
              caption={caption}
              onCaption={setCaption}
              onMove={(id, direction) => {
                setSelected((current) => {
                  const base = current.length > 0 ? current : records.slice(0, 3).map((record) => record.id);
                  const index = base.indexOf(id);
                  const next = index + direction;
                  if (index < 0 || next < 0 || next >= base.length) return base;
                  const copy = [...base];
                  const [item] = copy.splice(index, 1);
                  if (!item) return base;
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
          ) : (
            <Grid records={records} onOpen={setOpenId} />
          )}
          <div className="actions">
            <button
              onClick={() => {
                void estimate(24).then((result) => setEstimateLabel(result.label));
              }}
            >
              Sample library
            </button>
            {estimateLabel ? (
              <p>
                {estimateLabel}
                <button
                  onClick={() => {
                    void seedLibrary(24).then(() => {
                      setEstimateLabel(null);
                      setSelected([]);
                      return reload(facets, []);
                    });
                  }}
                >
                  Confirm import
                </button>
              </p>
            ) : null}
            <button
              onClick={() => {
                const ids = selected.length > 0 ? selected : records.slice(0, 1).map((record) => record.id);
                void fetch("/api/export", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ imageIds: ids, platform: platformId, keepExif: !stripExif }),
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
              Export all
            </button>
            <label>
              <input type="checkbox" checked={stripExif} aria-label="Strip EXIF" onChange={(event) => setStripExif(event.target.checked)} /> Strip EXIF
            </label>
          </div>
        </main>
      </div>
      {open ? <Lightbox record={open} onClose={() => setOpenId(null)} onChange={() => void reload()} /> : null}
    </div>
  );
}
