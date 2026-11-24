export function visibleRange(scrollTop: number, viewport: number, rowHeight: number, count: number, columns: number): { start: number; end: number } {
  const safeRow = Math.max(1, rowHeight);
  const row = Math.max(0, Math.floor(scrollTop / safeRow));
  const rows = Math.ceil(viewport / safeRow) + 2;
  return {
    start: Math.min(count, row * columns),
    end: Math.min(count, (row + rows) * columns),
  };
}
