export function columnCount(width: number, tile: number, gap = 8): number {
  return Math.max(1, Math.floor((width + gap) / (tile + gap)));
}

export function visibleRange(
  scrollTop: number,
  viewport: number,
  rowHeight: number,
  count: number,
  columns: number,
  overscan = 2,
): { start: number; end: number } {
  const safeRow = Math.max(1, rowHeight);
  const firstVisibleRow = Math.max(0, Math.floor(scrollTop / safeRow));
  const visibleRows = Math.ceil(viewport / safeRow);
  const startRow = Math.max(0, firstVisibleRow - overscan);
  const endRow = firstVisibleRow + visibleRows + overscan;
  return {
    start: Math.min(count, startRow * columns),
    end: Math.min(count, endRow * columns),
  };
}
