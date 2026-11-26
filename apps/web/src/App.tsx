import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import type { Facets, FilterChip, Palette, PlatformConfig } from "@gallery/core";
import {
  emptyQuery,
  estimate,
  listPalettes,
  loadPlatforms,
  naturalLanguage,
  queryLibrary,
  seedLibrary,
  type PublicRecord,
} from "./api/client";
import { Grid } from "./grid/Grid";
import { Lightbox } from "./lightbox/Lightbox";
import { Preview } from "./preview/Preview";
import { Tray } from "./tray/Tray";
import { Wheel } from "./wheel/Wheel";
import type { WheelTool } from "./wheel/gesture";
import { removeChipFromFacets, withTagStrictness } from "./facets";
import { GridHeader } from "./shell/GridHeader";
import { Rail } from "./shell/Rail";
import { TopBar, type WorkspaceMode } from "./shell/TopBar";

const SLIDER_DEBOUNCE_MS = 120;

/** Stable wheel slot — PR-06 may edit wheel files only. */
export type WheelSlotProps = ComponentProps<typeof Wheel>;

/** Stable preview slot — PR-07 may edit preview files only. */
export type PreviewSlotProps = ComponentProps<typeof Preview>;

export function App() {
  const [libraryRecords, setLibraryRecords] = useState<PublicRecord[]>([]);
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
  const [multiSwatch, setMultiSwatch] = useState(false);
  const [large, setLarge] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [gridFocusId, setGridFocusId] = useState<string | null>(null);
  const [estimateLabel, setEstimateLabel] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [pauseReason, setPauseReason] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const [narrowRail, setNarrowRail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stripExif, setStripExif] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [mode, setMode] = useState<WorkspaceMode>("gallery");
  const [tile, setTile] = useState(160);
  const [needsTagsFilter, setNeedsTagsFilter] = useState(false);
  const [palettes, setPalettes] = useState<Palette[]>([]);
  const [strictness, setStrictness] = useState(0.5);
  const addPhotosRef = useRef<HTMLButtonElement>(null);
  const importPopoverRef = useRef<HTMLDivElement>(null);
  const facetsRef = useRef(facets);
  facetsRef.current = facets;
  const abortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async (nextFacets: Facets = facetsRef.current) => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const seq = ++requestSeqRef.current;

    try {
      const libraryResult = await queryLibrary(emptyQuery(nextFacets, { type: "all" }), controller.signal);
      if (seq !== requestSeqRef.current) return;
      setLibraryRecords(libraryResult.records);
      setTotal(libraryResult.total);
      setMatched(libraryResult.matched);
      setMaxChroma(libraryResult.maxChroma || 0.2);
      setError(null);
    } catch (reason: unknown) {
      if (controller.signal.aborted || seq !== requestSeqRef.current) return;
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "The gallery API is not running.");
    }
  }, []);

  const scheduleReload = useCallback((nextFacets: Facets) => {
    if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      void reload(nextFacets);
    }, SLIDER_DEBOUNCE_MS);
  }, [reload]);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current);
  }, []);

  function toggleFacetList<Key extends "aspect_ratio" | "sharpness" | "temperature" | "status">(
    key: Key,
    value: NonNullable<Facets[Key]>[number],
  ) {
    const current = facets[key] as typeof value[] | undefined;
    const set = new Set(current ?? []);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    const list = [...set];
    const next = { ...facets, [key]: list.length ? list : undefined };
    setFacets(next);
    void reload(next);
  }

  function applyFacets(next: Facets) {
    const strict = withTagStrictness(next, strictness);
    setFacets(strict);
    void reload(strict);
  }

  const libraryById = useMemo(
    () => new Map(libraryRecords.map((record) => [record.id, record])),
    [libraryRecords],
  );
  const gridRecords = useMemo(() => {
    if (wheelSelection.length === 0) return libraryRecords;
    const selected = new Set(wheelSelection);
    return libraryRecords.filter((record) => selected.has(record.id));
  }, [libraryRecords, wheelSelection]);

  const trayReady = trayIds.length > 0;
  const showWorkspace = total > 0 || Boolean(error);
  const railExpanded = !narrowRail || railOpen;
  const gridEmpty = gridRecords.length === 0;
  const needsTags = useMemo(
    () => gridRecords.reduce((count, record) => count + (record.needs_tags ? 1 : 0), 0),
    [gridRecords],
  );
  const displayedGridRecords = useMemo(
    () => (needsTagsFilter ? gridRecords.filter((record) => record.needs_tags) : gridRecords),
    [gridRecords, needsTagsFilter],
  );
  const gridMatched = needsTagsFilter ? displayedGridRecords.length : matched;
  const visibleIds = useMemo(() => displayedGridRecords.map((record) => record.id), [displayedGridRecords]);

  const clearFilters = useCallback(() => {
    setFacets({});
    setChips([]);
    setWheelSelection([]);
    void reload({});
  }, [reload]);

  useEffect(() => {
    void reload();
    void loadPlatforms().then((result) => setPlatforms(result.platforms)).catch(() => undefined);
    void listPalettes().then((result) => setPalettes(result.palettes)).catch(() => undefined);
    void fetch("/api/queue").then(async (response) => {
      if (!response.ok) return;
      const body = (await response.json()) as { paused: boolean; reason?: unknown };
      setPaused(body.paused);
      setPauseReason(typeof body.reason === "string" ? body.reason : null);
    }).catch(() => undefined);
  }, [reload]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    function sync() {
      setNarrowRail(media.matches);
      if (!media.matches) setRailOpen(true);
    }
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!importOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setImportOpen(false);
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (importPopoverRef.current?.contains(target)) return;
      if (addPhotosRef.current?.contains(target)) return;
      setImportOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [importOpen]);

  useEffect(() => {
    if (!trayReady && mode === "preview") setMode("gallery");
  }, [trayReady, mode]);

  const open = useMemo(
    () => (openId ? libraryById.get(openId) ?? null : null),
    [libraryById, openId],
  );

  const toggleTrayId = useCallback((id: string) => {
    setTrayIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }, []);

  const addVisibleToTray = useCallback(() => {
    setTrayIds((current) => {
      const existing = new Set(current);
      const additions = visibleIds.filter((id) => !existing.has(id));
      return additions.length > 0 ? [...current, ...additions] : current;
    });
  }, [visibleIds]);

  const openInspect = useCallback((id: string) => {
    setOpenId(id);
    setGridFocusId(id);
  }, []);

  const onExport = useCallback(() => {
    if (!trayReady || exporting) return;
    setExporting(true);
    void fetch("/api/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageIds: trayIds, platform: platformId, keepExif: !stripExif }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${platformId}.zip`;
        link.click();
        URL.revokeObjectURL(url);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Export failed"))
      .finally(() => setExporting(false));
  }, [trayReady, exporting, trayIds, platformId, stripExif]);

  const handleWheelSelect = useCallback((ids: string[], gestureMode: "replace" | "add" | "subtract") => {
    setWheelSelection((current) => {
      switch (gestureMode) {
        case "replace":
          return ids;
        case "add":
          return [...new Set([...current, ...ids])];
        case "subtract": {
          const remove = new Set(ids);
          return current.filter((id) => !remove.has(id));
        }
        default: {
          const unreachable: never = gestureMode;
          return unreachable;
        }
      }
    });
  }, []);

  const handlePreviewMove = useCallback((id: string, direction: -1 | 1) => {
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
  }, []);

  const handleRailFacets = useCallback((next: Facets) => {
    const prev = facetsRef.current;
    setFacets(next);
    const lightnessChanged =
      next.lightness?.min !== prev.lightness?.min || next.lightness?.max !== prev.lightness?.max;
    const monochromeChanged = next.monochrome !== prev.monochrome;
    if (lightnessChanged && !monochromeChanged) scheduleReload(next);
    else void reload(next);
  }, [reload, scheduleReload]);

  const handleCloseLightbox = useCallback(() => setOpenId(null), []);
  const handleLightboxChange = useCallback(() => {
    void reload();
  }, [reload]);

  const wheelSlot: WheelSlotProps = useMemo(() => ({
    records: libraryRecords,
    maxChroma,
    tool,
    multiSwatch,
    large,
    selectedIds: wheelSelection,
    onSelect: handleWheelSelect,
  }), [libraryRecords, maxChroma, tool, multiSwatch, large, wheelSelection, handleWheelSelect]);

  const previewSlot: PreviewSlotProps = useMemo(() => ({
    records: libraryRecords,
    orderedIds: trayIds,
    platforms,
    caption,
    onCaption: setCaption,
    onMove: handlePreviewMove,
    theme,
    focus,
    platformId,
    onPlatform: setPlatformId,
    onTheme: setTheme,
    onFocus: setFocus,
  }), [libraryRecords, trayIds, platforms, caption, handlePreviewMove, theme, focus, platformId]);

  function renderCanvas() {
    switch (mode) {
      case "gallery":
        return (
          <div className="grid-stack">
            <GridHeader
              matched={gridMatched}
              total={total}
              selectedCount={wheelSelection.length}
              trayCount={trayIds.length}
              needsTags={needsTags}
              onSelectAll={addVisibleToTray}
              tile={tile}
              onTile={setTile}
              needsTagsFilter={needsTagsFilter}
              onNeedsTagsFilter={setNeedsTagsFilter}
            />
            {gridEmpty && total > 0 ? (
              <div className="grid-wrap">
                <p>No photos match</p>
                <button type="button" className="chrome-btn" onClick={clearFilters}>
                  Clear filters
                </button>
              </div>
            ) : (
              <Grid
                records={displayedGridRecords}
                trayIds={trayIds}
                focusId={gridFocusId}
                onFocus={setGridFocusId}
                onToggle={toggleTrayId}
                onInspect={openInspect}
                tile={tile}
              />
            )}
          </div>
        );
      case "preview":
        return (
          <div className="preview-panel" aria-label="Post preview">
            <Preview {...previewSlot} />
          </div>
        );
      default: {
        const unreachable: never = mode;
        return unreachable;
      }
    }
  }

  return (
    <div className="app">
      <TopBar
        showWorkspace={showWorkspace}
        mode={mode}
        onMode={setMode}
        trayReady={trayReady}
        importOpen={importOpen}
        onImportOpen={setImportOpen}
        addPhotosRef={addPhotosRef}
        importPopoverRef={importPopoverRef}
        estimateLabel={estimateLabel}
        onEstimate={() => {
          void estimate(24).then((result) => setEstimateLabel(result.label));
        }}
        onConfirmImport={() => {
          void seedLibrary(24).then(() => {
            setEstimateLabel(null);
            setImportOpen(false);
            setWheelSelection([]);
            return reload(facets);
          });
        }}
        matched={matched}
        total={total}
        chips={chips}
        onRemoveChip={(chipId) => {
          const removed = chips.find((item) => item.id === chipId);
          const nextChips = chips.filter((item) => item.id !== chipId);
          setChips(nextChips);
          if (!removed) return;
          applyFacets(withTagStrictness(removeChipFromFacets(facets, removed.facets, nextChips), strictness));
        }}
        facets={facets}
        onOrientation={(orientation) => {
          const next = { ...facets, orientation: facets.orientation?.[0] === orientation ? undefined : [orientation] };
          applyFacets(next);
        }}
        onAspectRatio={(bucket) => toggleFacetList("aspect_ratio", bucket)}
        onSharpness={(value) => toggleFacetList("sharpness", value)}
        onTemperature={(value) => toggleFacetList("temperature", value)}
        onFavorites={() => {
          const next = { ...facets, favorites: facets.favorites ? undefined : true };
          applyFacets(next);
        }}
        onNeverUsed={() => {
          const next = { ...facets, neverUsed: facets.neverUsed ? undefined : true };
          applyFacets(next);
        }}
        onStatus={(value) => toggleFacetList("status", value)}
        onClearFilters={clearFilters}
        onNaturalLanguage={async (text) => {
          const result = await naturalLanguage(text);
          const existing = new Set(chips.map((chip) => chip.id));
          const incoming = result.chips
            .filter((chip) => !existing.has(chip.id))
            .map((chip) => ({ ...chip, facets: withTagStrictness(chip.facets, strictness) }));
          const nextChips = [...chips, ...incoming];
          setChips(nextChips);
          const next = { ...facets };
          for (const chip of incoming) Object.assign(next, chip.facets);
          applyFacets(next);
        }}
        strictness={strictness}
        onStrictness={(value) => {
          setStrictness(value);
          const nextChips = chips.map((chip) => ({
            ...chip,
            facets: withTagStrictness(chip.facets, value),
          }));
          setChips(nextChips);
          const nextFacets = withTagStrictness(facets, value);
          setFacets(nextFacets);
          scheduleReload(nextFacets);
        }}
      />
      {error ? (
        <p role="status">
          {error}
          <button type="button" className="chrome-btn" onClick={() => void reload()}>Retry</button>
        </p>
      ) : null}
      {paused ? (
        <p className="banner">{typeof pauseReason === "string" ? pauseReason : "Queue paused"}</p>
      ) : null}
      <div className="workspace" data-rail-open={railExpanded ? "true" : "false"}>
        {total > 0 ? (
          <Rail
            wheelSlot={wheelSlot}
            tool={tool}
            onTool={setTool}
            onLarge={setLarge}
            facets={facets}
            onFacets={handleRailFacets}
            multiSwatch={multiSwatch}
            onMultiSwatch={setMultiSwatch}
            palettes={palettes}
            onPalettes={setPalettes}
          />
        ) : null}
        <main>
          {narrowRail && total > 0 ? (
            <button
              type="button"
              className="chrome-btn rail-toggle"
              aria-expanded={railOpen}
              onClick={() => setRailOpen((open) => !open)}
            >
              Color wheel
            </button>
          ) : null}
          <div className="main-stage">
            {total === 0 && !error ? <p className="library-empty">Add photos to start</p> : null}
            {showWorkspace ? renderCanvas() : null}
          </div>
          {total > 0 && mode === "gallery" ? (
            <Tray
              records={libraryRecords}
              orderedIds={trayIds}
              onReorder={setTrayIds}
              onToggle={toggleTrayId}
              onInspect={openInspect}
              stripExif={stripExif}
              onStripExif={setStripExif}
              platformId={platformId}
              exporting={exporting}
              onExport={onExport}
            />
          ) : null}
        </main>
      </div>
      {open ? (
        <Lightbox
          record={open}
          records={gridRecords}
          onClose={handleCloseLightbox}
          onNavigate={setOpenId}
          onChange={handleLightboxChange}
        />
      ) : null}
    </div>
  );
}