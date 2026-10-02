import assert from 'node:assert/strict'
import test from 'node:test'

import { addColumn, addRow, createTableData, readTable, removeColumn, removeRow, setCell, setHeader } from './table-data'

let counter = 0
const makeId = (prefix: 'c' | 'r') => `${prefix}${++counter}`

test('a new table has 3 named columns and 3 empty rows', () => {
  counter = 0
  const table = readTable(createTableData(makeId))
  assert.deepEqual(table.columnIds, ['c1', 'c2', 'c3'])
  assert.equal(table.rowIds.length, 3)
  assert.equal(table.header('c2'), 'Column 2')
  assert.equal(table.cell(table.rowIds[0], 'c1'), '')
})

test('edits in different cells are separate keys, so concurrent edits both survive', () => {
  counter = 0
  const data = createTableData(makeId)
  const merged = { ...data, ...setCell('r4', 'c1', 'Ana'), ...setCell('r4', 'c2', 'Bo'), ...setHeader('c1', 'Name') }
  const table = readTable(merged)
  assert.deepEqual([table.cell('r4', 'c1'), table.cell('r4', 'c2'), table.header('c1')], ['Ana', 'Bo', 'Name'])
})

test('rows and columns are added after a given one and removed with their cells', () => {
  counter = 0
  const data = createTableData(makeId)
  const table = readTable(data)
  assert.deepEqual(addRow(table, 'r4', makeId)?.rowIds, ['r4', 'r7', 'r5', 'r6'])
  assert.deepEqual(addColumn(table, undefined, makeId)?.columnIds, ['c1', 'c2', 'c3', 'c8'])
  const filled = readTable({ ...data, ...setCell('r4', 'c1', 'x') })
  assert.deepEqual(removeRow(filled, 'r4'), { rowIds: ['r5', 'r6'], 'cell:r4:c1': undefined, 'cell:r4:c2': undefined, 'cell:r4:c3': undefined })
  assert.equal(removeColumn(readTable({ columnIds: ['c1'], rowIds: ['r1'] }), 'c1'), null, 'the last column stays')
})
