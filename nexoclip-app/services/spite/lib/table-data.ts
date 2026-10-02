// Canvas tables. Rows and columns have stable ids; every cell (and header)
// is its own node-data key, so two people typing in different cells never
// overwrite each other. Adding/removing rows and columns rewrites only the
// id lists. Each function returns the node-data patch to write.

export const MAX_TABLE_ROWS = 50
export const MAX_TABLE_COLUMNS = 20
export const MAX_CELL_LENGTH = 1000

type Patch = Record<string, unknown>
export type TableView = {
  columnIds: string[]
  rowIds: string[]
  header: (columnId: string) => string
  cell: (rowId: string, columnId: string) => string
}

const headKey = (columnId: string) => `head:${columnId}`
const cellKey = (rowId: string, columnId: string) => `cell:${rowId}:${columnId}`
const ids = (value: unknown) => Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && id.length > 0) : []

export function newTableId(prefix: 'c' | 'r'): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

// A new table: 3 columns, a header row, and 3 body rows.
export function createTableData(makeId: (prefix: 'c' | 'r') => string = newTableId): Patch {
  const columnIds = [makeId('c'), makeId('c'), makeId('c')]
  return { columnIds, rowIds: [makeId('r'), makeId('r'), makeId('r')], ...Object.fromEntries(columnIds.map((id, i) => [headKey(id), `Column ${i + 1}`])) }
}

export function readTable(data: Record<string, unknown>): TableView {
  const text = (key: string) => typeof data[key] === 'string' ? data[key] as string : ''
  return {
    columnIds: ids(data.columnIds),
    rowIds: ids(data.rowIds),
    header: (columnId) => text(headKey(columnId)),
    cell: (rowId, columnId) => text(cellKey(rowId, columnId)),
  }
}

export function setHeader(columnId: string, value: string): Patch {
  return { [headKey(columnId)]: value.slice(0, MAX_CELL_LENGTH) }
}

export function setCell(rowId: string, columnId: string, value: string): Patch {
  return { [cellKey(rowId, columnId)]: value.slice(0, MAX_CELL_LENGTH) }
}

export function addRow(table: TableView, afterRowId?: string, makeId = newTableId): Patch | null {
  if (table.rowIds.length >= MAX_TABLE_ROWS) return null
  const index = afterRowId ? table.rowIds.indexOf(afterRowId) + 1 : table.rowIds.length
  const rowIds = [...table.rowIds]
  rowIds.splice(index <= 0 ? rowIds.length : index, 0, makeId('r'))
  return { rowIds }
}

export function addColumn(table: TableView, afterColumnId?: string, makeId = newTableId): Patch | null {
  if (table.columnIds.length >= MAX_TABLE_COLUMNS) return null
  const index = afterColumnId ? table.columnIds.indexOf(afterColumnId) + 1 : table.columnIds.length
  const columnIds = [...table.columnIds]
  const id = makeId('c')
  columnIds.splice(index <= 0 ? columnIds.length : index, 0, id)
  return { columnIds, [headKey(id)]: `Column ${columnIds.length}` }
}

// Removing clears the row's / column's cells (undefined deletes the key).
export function removeRow(table: TableView, rowId: string): Patch | null {
  if (table.rowIds.length <= 1 || !table.rowIds.includes(rowId)) return null
  return {
    rowIds: table.rowIds.filter((id) => id !== rowId),
    ...Object.fromEntries(table.columnIds.map((columnId) => [cellKey(rowId, columnId), undefined])),
  }
}

export function removeColumn(table: TableView, columnId: string): Patch | null {
  if (table.columnIds.length <= 1 || !table.columnIds.includes(columnId)) return null
  return {
    columnIds: table.columnIds.filter((id) => id !== columnId),
    [headKey(columnId)]: undefined,
    ...Object.fromEntries(table.rowIds.map((rowId) => [cellKey(rowId, columnId), undefined])),
  }
}
