import type { GridMergedCell, GridSection, SimpleFieldDef } from "@/types/forms";

type GridCellLayout =
  | {
      kind: "cell";
      field: SimpleFieldDef;
      rowSpan: number;
      colSpan: number;
      mergeId?: string;
    }
  | { kind: "covered" };

type NormalizedMergedCell = GridMergedCell & {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  field: SimpleFieldDef;
};

function isActiveField(field: { isActive?: boolean }) {
  return field.isActive !== false;
}

function normalizeMergedCell(
  cell: GridMergedCell,
  columnCount: number,
  rowCount: number
): NormalizedMergedCell | null {
  const row = Math.max(0, Math.floor(cell.row));
  const col = Math.max(0, Math.floor(cell.col));
  const rowSpan = Math.max(1, Math.floor(cell.rowSpan || 1));
  const colSpan = Math.max(1, Math.floor(cell.colSpan || 1));

  if (row >= rowCount || col >= columnCount) return null;
  if (row + rowSpan > rowCount || col + colSpan > columnCount) return null;

  const field = cell.field || {
    id: cell.id,
    type: "text",
    label: "Merged cell",
    required: false,
  };

  return { ...cell, row, col, rowSpan, colSpan, field };
}

export function buildGridLayout(grid: GridSection, rowCount: number) {
  const columns = grid.columns.filter(isActiveField);
  const columnCount = columns.length;
  const rows = Array.from({ length: rowCount }, () =>
    Array.from({ length: columnCount }, (_, colIndex): GridCellLayout => ({
      kind: "cell",
      field: columns[colIndex],
      rowSpan: 1,
      colSpan: 1,
    }))
  );

  if (!grid.mergedCells || grid.mergedCells.length === 0) {
    return { columns, rows };
  }

  const normalized = grid.mergedCells
    .map((cell) => normalizeMergedCell(cell, columnCount, rowCount))
    .filter((cell): cell is NormalizedMergedCell => Boolean(cell));

  for (const cell of normalized) {
    let blocked = false;
    for (let r = cell.row; r < cell.row + cell.rowSpan; r += 1) {
      for (let c = cell.col; c < cell.col + cell.colSpan; c += 1) {
        const existing = rows[r][c];
        if (existing.kind === "covered") {
          blocked = true;
          break;
        }
        if (existing.kind === "cell" && (existing.mergeId || existing.rowSpan > 1 || existing.colSpan > 1)) {
          blocked = true;
          break;
        }
      }
      if (blocked) break;
    }

    if (blocked) continue;

    rows[cell.row][cell.col] = {
      kind: "cell",
      field: cell.field,
      rowSpan: cell.rowSpan,
      colSpan: cell.colSpan,
      mergeId: cell.id,
    };

    for (let r = cell.row; r < cell.row + cell.rowSpan; r += 1) {
      for (let c = cell.col; c < cell.col + cell.colSpan; c += 1) {
        if (r === cell.row && c === cell.col) continue;
        rows[r][c] = { kind: "covered" };
      }
    }
  }

  return { columns, rows };
}

export function getGridRowFields(grid: GridSection, rowIndex: number, rowCount: number): SimpleFieldDef[] {
  const layout = buildGridLayout(grid, rowCount);
  const row = layout.rows[rowIndex];
  if (!row) return [];
  return row.flatMap((cell) => (cell.kind === "cell" ? [cell.field] : []));
}

export function buildGridRowDefaults(grid: GridSection, rowIndex: number, rowCount: number) {
  const fields = getGridRowFields(grid, rowIndex, rowCount);
  const row: Record<string, unknown> = {};

  for (const field of fields) {
    if (field.type === "checkbox") {
      row[field.id] = false;
      continue;
    }

    if (field.readOnly && field.id === "day") {
      row[field.id] = String(rowIndex + 1);
      continue;
    }

    row[field.id] = "";
  }

  return row;
}

export function getGridFieldMap(grid: GridSection, rowCount: number): Map<string, SimpleFieldDef> {
  const map = new Map<string, SimpleFieldDef>();
  const layout = buildGridLayout(grid, rowCount);

  for (const row of layout.rows) {
    for (const cell of row) {
      if (cell.kind === "cell") {
        map.set(cell.field.id, cell.field);
      }
    }
  }

  return map;
}
