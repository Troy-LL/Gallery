import { useEffect, useRef, useState, type ComponentProps } from "react";
import type { Facets, FilterChip, PlatformConfig } from "@gallery/core";
import { emptyQuery, estimate, loadPlatforms, queryLibrary, seedLibrary, type PublicRecord } from "./api/client";
import { Grid } from "./grid/Grid";
import { Lightbox } from "./lightbox/Lightbox";
import { Preview } from "./preview/Preview";
import { Tray } from "./tray/Tray";
import { Wheel } from "./wheel/Wheel";
import type { WheelTool } from "./wheel/gesture";
import { GridHeader } from "./shell/GridHeader";
import { Rail } from "./shell/Rail";
import { TopBar, type WorkspaceMode } from "./shell/TopBar";

/** Stable wheel slot — PR-06 may edit wheel files only. */
export type WheelSlotProps = ComponentProps<typeof Wheel>;

/** Stable preview slot — PR-07 may edit preview files only. */
export type PreviewSlotProps = ComponentProps<typeof Preview>;

export function App() {
  const [libraryRecords, setLibraryRecords] = useState<PublicRecord[]>([]);
  const [gridRecords, setGridRecords] = useState<PublicRecord[]>([]);
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
  const [error, setError] = useState<string | null>(null);
  const [stripExif, setStripExif] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [mode, setMode] = useState<WorkspaceMode>("gallery");
  const [tile, setTile] = useState(160);
  const [needsTagsFilter, setNeedsTagsFilter] = useState(false);
  const addPhotosRef = useRef<HTMLButtonElement>(null);
  const importPopoverRef = useRef<HTMLDivElement>(null);

  const trayReady = trayIds.length > 0;
  const showWorkspace = total > 0 || Boolean(error);
  const gridEmpty = gridRecords.length === 0;
  const needsTags = gridRecords.filter((record) => record.needs_tags).length;
  const displayedGridRecords = needsTagsFilter
    ? gridRecords.filter((record) => record.needs_tags)
    : gridRecords;
  const gridMatched = needsTagsFilter ? displayedGridRecords.length : matched;
  const visibleIds = displayedGridRecords.map((record) => record.id);

  async function reload(nextFacets = facets, ids = wheelSelection) {
    const libraryResult = await queryLibrary(emptyQuery(nextFacets, { type: "all" }));
    setLibraryRecords(libraryResult.records);
    setTotal(libraryResult.total);
    setMatched(libraryResult.matched);
    setMaxChroma(libraryResult.maxChroma || 0.2);

    if (ids.length > 0) {
      const gridResult = await queryLibrary(emptyQuery(nextFacets, { type: "ids", ids }));
      setGridRecords(gridResult.records);
    } else {
      setGridRecords(libraryResult.records);
    }
  }

  function clearFilters() {
    setFacets({});
    setChips([]);
    setWheelSelection([]);
    void reload({}, []);
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
    if (!trayReady && mode === "preview") setMode("gallery");
  }, [trayReady, mode]);

  const open = gridRecords.find((record) => record.id === openId) ?? null;

  function toggleTrayId(id: string) {
    setTrayIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function addVisibleToTray() {
    setTrayIds((current) => [...current, ...visibleIds.filter((id) => !current.includes(id))]);
  }

  function openInspect(id: string) {
    setOpenId(id);
    setGridFocusId(id);
  }

  function onExport() {
    if (!trayReady) return;
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
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Export failed"));
  }

  const wheelSlot: WheelSlotProps = {
    records: libraryRecords,
    maxChroma,
    tool,
    multiSwatch,
    large,
    selectedIds: wheelSelection,
    onSelect: (ids, gestureMode) => {
      const next = gestureMode === "replace" ? ids : gestureMode === "add" ? [...new Set([...wheelSelection, ...ids])] : wheelSelection.filter((id) => !ids.includes(id));
      setWheelSelection(next);
      void reload(facets, next);
    },
  };

  const previewSlot: PreviewSlotProps = {
    records: gridRecords,
    orderedIds: trayIds,
    platforms,
    caption,
    onCaption: setCaption,
    onMove: (id, direction) => {
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
    },
    theme,
    focus,
    platformId,
    onPlatform: setPlatformId,
    onTheme: setTheme,
    onFocus: setFocus,
  };

  function renderCanvas() {
    switch (mode) {
      case "gallery":
        return (
          <div className="grid-stack">
            <GridHeader
              matched={gridMatched}
              total={total}
              selectedCount={trayIds.length}
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
            return reload(facets, []);
          });
        }}
        onExport={onExport}
        matched={matched}
        total={total}
        chips={chips}
        onRemoveChip={(chipId) => {
          const nextChips = chips.filter((item) => item.id !== chipId);
          setChips(nextChips);
          const next: Facets = {};
          for (const item of nextChips) Object.assign(next, item.facets);
          setFacets(next);
          void reload(next, wheelSelection);
        }}
        facets={facets}
        onOrientation={(orientation) => {
          const next = { ...facets, orientation: facets.orientation?.[0] === orientation ? undefined : [orientation] };
          setFacets(next);
          void reload(next, wheelSelection);
        }}
      />
      {error ? <p role="status">{error}</p> : null}
      {paused ? <p className="banner">Queue paused</p> : null}
      <div className="workspace">
        {total > 0 ? (
          <Rail
            wheelSlot={wheelSlot}
            tool={tool}
            onTool={setTool}
            onLarge={setLarge}
            facets={facets}
            onFacets={(next) => {
              setFacets(next);
              void reload(next, wheelSelection);
            }}
            multiSwatch={multiSwatch}
            onMultiSwatch={setMultiSwatch}
          />
        ) : null}
        <main>
          <div className="main-stage">{showWorkspace ? renderCanvas() : null}</div>
          {total > 0 && mode === "gallery" ? (
            <Tray
              records={gridRecords}
              orderedIds={trayIds}
              visibleIds={visibleIds}
              onReorder={setTrayIds}
              onToggle={toggleTrayId}
              onInspect={openInspect}
              onAddVisible={addVisibleToTray}
              stripExif={stripExif}
              onStripExif={setStripExif}
            />
          ) : null}
        </main>
      </div>
      {open ? (
        <Lightbox
          record={open}
          records={gridRecords}
          onClose={() => setOpenId(null)}
          onNavigate={setOpenId}
          onChange={() => void reload()}
        />
      ) : null}
    </div>
  );
}