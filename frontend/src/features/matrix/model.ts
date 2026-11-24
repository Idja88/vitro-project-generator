// Модель матрицы «объекты × марки» без React и без DOM.
//
// Состояние редактора — строки (объекты), колонки (марки) и множество отмеченных пересечений.
// Порядок строк и колонок задаётся порядком массивов, поэтому перетаскивание — это просто
// перестановка элементов массива. buildSelectionMatrix() превращает состояние в матрицу для
// бэкенда по тем же правилам, что и прежний getSelectionMatrix() в jQuery-версии.

import type { MarkOrderEntry, MatrixMark, MatrixObject, SelectionMatrix } from '../../api/types'

/** Псевдо-объект: марки создаются прямо в папке проекта, без папки объекта. */
export const NULL_OBJECT_ID = '00000000-0000-0000-0000-000000000000'
export const NULL_OBJECT_NAME = 'Общий объект'

export interface Row {
  id: string
  name: string
  number: string
}

export interface Column {
  id: string
  /** Код марки (АР, КЖ…) — так марка называется в матрице. */
  name: string
  number: string
}

export interface MatrixState {
  rows: Row[]
  columns: Column[]
  /** Ключи отмеченных пересечений: cellKey(rowId, columnKey(column)). */
  checked: Set<string>
  selectedRows: Set<string>
  selectedColumns: Set<string>
}

/** Марка идентифицируется парой id + номер раздела: АР1 и АР2 — разные колонки. */
export function columnKey(mark: { id: string; number?: string | number | null }): string {
  return `${mark.id}|${mark.number || ''}`
}

export function cellKey(rowId: string, colKey: string): string {
  return `${rowId}::${colKey}`
}

export function columnLabel(column: Column): string {
  return `${column.name}${column.number}`
}

export function emptyState(): MatrixState {
  return { rows: [], columns: [], checked: new Set(), selectedRows: new Set(), selectedColumns: new Set() }
}

const str = (value: string | number | null | undefined) => (value === null || value === undefined ? '' : String(value))

/** Состояние редактора из сохранённой матрицы: только неудалённые объекты и марки. */
export function stateFromMatrix(matrix: SelectionMatrix | null): MatrixState {
  const state = emptyState()
  if (!matrix) return state

  const found = new Map<string, Column>()
  for (const obj of matrix.objects) {
    if (obj.deleted) continue
    state.rows.push({ id: obj.id, name: obj.name, number: str(obj.number) })
    for (const mark of obj.marks) {
      if (mark.deleted) continue
      const key = columnKey(mark)
      if (!found.has(key)) found.set(key, { id: mark.id, name: mark.name, number: str(mark.number) })
      state.checked.add(cellKey(obj.id, key))
    }
  }

  // Сначала колонки в сохранённом порядке, затем остальные в порядке первого появления
  const ordered = new Map<string, Column>()
  for (const entry of matrix.mark_order ?? []) {
    // сохранённые данные могут содержать что угодно: учитываем только колонки {id, number}
    if (typeof entry !== 'object' || entry === null || !entry.id) continue
    const key = columnKey(entry)
    const column = found.get(key)
    if (column) ordered.set(key, column)
  }
  for (const [key, column] of found) if (!ordered.has(key)) ordered.set(key, column)
  state.columns = [...ordered.values()]
  return state
}

const sameMark = (a: { id: string; number?: string | number }, b: { id: string; number?: string | number }) =>
  a.id === b.id && str(a.number) === str(b.number)

/**
 * Матрица для POST /structure.
 *
 * - объект попадает в матрицу, если у него отмечена хотя бы одна марка; folder_structure_id берётся
 *   из сохранённой матрицы ("" — папку нужно создать); ранее удалённый объект помечается to_restore;
 * - то же для марок внутри объекта;
 * - марки и объекты сохранённой матрицы, которые больше не отмечены, получают to_remove
 *   (если ещё не удалены), их папки уйдут в корзину.
 */
export function buildSelectionMatrix(
  state: MatrixState,
  original: SelectionMatrix | null,
  project: { id: string; name: string },
): SelectionMatrix {
  const originalObjects = original?.objects ?? []
  const originalById = new Map(originalObjects.map((obj) => [obj.id, obj]))
  const objects: MatrixObject[] = []

  for (const row of state.rows) {
    const columns = state.columns.filter((c) => state.checked.has(cellKey(row.id, columnKey(c))))
    if (columns.length === 0) continue

    const prev = originalById.get(row.id)
    const wasDeleted = prev?.deleted === true
    const marks: MatrixMark[] = columns.map((column) => {
      const prevMark = prev?.marks.find((m) => sameMark(m, column))
      const markDeleted = prevMark?.deleted === true
      return {
        id: column.id,
        name: column.name,
        number: column.number,
        folder_structure_id: prevMark?.folder_structure_id ?? '',
        to_remove: false,
        deleted: markDeleted,
        to_restore: markDeleted,
      }
    })

    objects.push({
      id: row.id,
      name: row.name,
      number: row.number,
      folder_structure_id: prev?.folder_structure_id ?? '',
      to_remove: false,
      deleted: wasDeleted,
      to_restore: wasDeleted,
      marks,
    })
  }

  // Всё из сохранённой матрицы, что больше не выбрано, — на удаление
  for (const prev of originalObjects) {
    const current = objects.find((obj) => obj.id === prev.id)
    if (current) {
      for (const prevMark of prev.marks) {
        if (!current.marks.some((m) => sameMark(m, prevMark))) {
          current.marks.push({ ...prevMark, to_remove: !prevMark.deleted, to_restore: false })
        }
      }
    } else {
      objects.push({
        ...prev,
        to_remove: !prev.deleted,
        to_restore: false,
        marks: prev.marks.map((m) => ({ ...m, to_remove: !m.deleted, to_restore: false })),
      })
    }
  }

  return {
    id: project.id,
    name: project.name,
    folder_structure_id: original?.folder_structure_id ?? '',
    mark_order: state.columns.map((c): MarkOrderEntry => ({ id: c.id, number: c.number })),
    objects,
  }
}

// --- проверки перед добавлением ---

/** Номер раздела: пусто или целое 1–99 (то же правило, что validate_matrix на бэкенде). */
export function validMarkNumber(value: string | number): boolean {
  return value === '' || (Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 99)
}

/** Объекты, которые уже есть в таблице (по id или по имени, как в прежней версии). */
export function duplicateRows(state: MatrixState, rows: Row[]): Row[] {
  return rows.filter((row) => state.rows.some((r) => r.id === row.id || r.name === row.name))
}

export function hasColumn(state: MatrixState, column: Column): boolean {
  return state.columns.some((c) => columnKey(c) === columnKey(column))
}

// --- reducer ---

export type MatrixAction =
  | { type: 'reset'; state: MatrixState }
  | { type: 'addRows'; rows: Row[] }
  | { type: 'addColumn'; column: Column }
  | { type: 'toggleCell'; rowId: string; colKey: string }
  | { type: 'toggleRowSelection'; rowId: string }
  | { type: 'toggleColumnSelection'; colKey: string }
  | { type: 'clearSelection' }
  | { type: 'deleteSelected' }
  | { type: 'moveRow'; activeId: string; overId: string }
  | { type: 'moveColumn'; activeKey: string; overKey: string }

function toggled<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

/** Перемещает элемент с индекса from на индекс to (как arrayMove из dnd-kit). */
function moved<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from === to) return items
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function matrixReducer(state: MatrixState, action: MatrixAction): MatrixState {
  switch (action.type) {
    case 'reset':
      return action.state

    case 'addRows': {
      const fresh = action.rows.filter((row) => duplicateRows(state, [row]).length === 0)
      return fresh.length ? { ...state, rows: [...state.rows, ...fresh] } : state
    }

    case 'addColumn':
      return hasColumn(state, action.column) ? state : { ...state, columns: [...state.columns, action.column] }

    case 'toggleCell':
      return { ...state, checked: toggled(state.checked, cellKey(action.rowId, action.colKey)) }

    case 'toggleRowSelection':
      return { ...state, selectedRows: toggled(state.selectedRows, action.rowId) }

    case 'toggleColumnSelection':
      return { ...state, selectedColumns: toggled(state.selectedColumns, action.colKey) }

    case 'clearSelection':
      return { ...state, selectedRows: new Set(), selectedColumns: new Set() }

    case 'deleteSelected': {
      const rows = state.rows.filter((r) => !state.selectedRows.has(r.id))
      const columns = state.columns.filter((c) => !state.selectedColumns.has(columnKey(c)))
      const rowIds = new Set(rows.map((r) => r.id))
      const colKeys = new Set(columns.map(columnKey))
      const checked = new Set(
        [...state.checked].filter((key) => {
          const [rowId, colKey] = key.split('::')
          return rowIds.has(rowId) && colKeys.has(colKey)
        }),
      )
      return { rows, columns, checked, selectedRows: new Set(), selectedColumns: new Set() }
    }

    case 'moveRow':
      return {
        ...state,
        rows: moved(
          state.rows,
          state.rows.findIndex((r) => r.id === action.activeId),
          state.rows.findIndex((r) => r.id === action.overId),
        ),
      }

    case 'moveColumn': {
      const keys = state.columns.map(columnKey)
      return {
        ...state,
        columns: moved(state.columns, keys.indexOf(action.activeKey), keys.indexOf(action.overKey)),
      }
    }
  }
}
