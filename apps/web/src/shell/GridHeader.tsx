export type GridHeaderProps = {
  matched: number;
  total: number;
  selectedCount: number;
  needsTags: number;
  onSelectAll: () => void;
  tile: number;
  onTile: (value: number) => void;
  needsTagsFilter: boolean;
  onNeedsTagsFilter: (value: boolean) => void;
};

export function GridHeader(props: GridHeaderProps) {
  function onSelectAllClick() {
    if (props.matched > 50) {
      if (!window.confirm(`Select all ${props.matched} matching photos?`)) return;
    }
    props.onSelectAll();
  }

  return (
    <header className="grid-header">
      <p className="grid-header-summary">
        {props.matched} photos · {props.selectedCount} selected
      </p>
      <div className="grid-header-actions">
        <button
          type="button"
          className="chrome-btn"
          aria-pressed={props.needsTagsFilter}
          onClick={() => props.onNeedsTagsFilter(!props.needsTagsFilter)}
        >
          {props.needsTags} need tags
        </button>
        <button type="button" className="chrome-btn" onClick={onSelectAllClick}>
          Select all {props.matched} matching
        </button>
        <label className="grid-header-tile">
          Tile size
          <input
            aria-label="Tile size"
            type="range"
            min={96}
            max={280}
            value={props.tile}
            onChange={(event) => props.onTile(Number(event.target.value))}
          />
        </label>
      </div>
    </header>
  );
}