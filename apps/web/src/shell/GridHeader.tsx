export type GridHeaderProps = {
  matched: number;
  total: number;
  selectedCount: number;
  needsTags: number;
  onSelectAll: () => void;
  tile: number;
  onTile: (value: number) => void;
};

export function GridHeader(_props: GridHeaderProps) {
  return null;
}
