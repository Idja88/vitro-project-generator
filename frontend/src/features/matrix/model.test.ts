import { describe, expect, it } from 'vitest'

import type { MatrixMark, MatrixObject, SelectionMatrix } from '../../api/types'
import {
  buildSelectionMatrix,
  cellKey,
  columnKey,
  duplicateRows,
  emptyState,
  matrixReducer,
  stateFromMatrix,
  validMarkNumber,
  type Column,
  type MatrixState,
  type Row,
} from './model'

const PROJECT = { id: 'P1', name: 'Проект' }

const mark = (id: string, name: string, extra: Partial<MatrixMark> = {}): MatrixMark => ({
  id,
  name,
  number: '',
  folder_structure_id: '',
  deleted: false,
  to_remove: false,
  to_restore: false,
  ...extra,
})

const obj = (id: string, name: string, marks: MatrixMark[], extra: Partial<MatrixObject> = {}): MatrixObject => ({
  id,
  name,
  number: '',
  folder_structure_id: '',
  deleted: false,
  to_remove: false,
  to_restore: false,
  marks,
  ...extra,
})

const matrix = (objects: MatrixObject[], extra: Partial<SelectionMatrix> = {}): SelectionMatrix => ({
  id: 'P1',
  name: 'Проект',
  folder_structure_id: 'PF',
  objects,
  ...extra,
})

function withChecks(rows: Row[], columns: Column[], checks: [string, Column][]): MatrixState {
  return {
    ...emptyState(),
    rows,
    columns,
    checked: new Set(checks.map(([rowId, c]) => cellKey(rowId, columnKey(c)))),
  }
}

const AR: Column = { id: 'M1', name: 'АР', number: '' }
const KZH2: Column = { id: 'M2', name: 'КЖ', number: '2' }
const KORPUS: Row = { id: 'O1', name: 'Корпус', number: '1' }
const SKLAD: Row = { id: 'O2', name: 'Склад', number: '' }

describe('columnKey', () => {
  it('различает марки по номеру раздела', () => {
    expect(columnKey({ id: 'M1', number: '' })).toBe('M1|')
    expect(columnKey({ id: 'M1', number: 2 })).toBe('M1|2')
    expect(columnKey({ id: 'M1', number: '2' })).toBe(columnKey({ id: 'M1', number: 2 }))
  })
})

describe('stateFromMatrix', () => {
  it('пустая матрица для нового проекта', () => {
    expect(stateFromMatrix(null)).toEqual(emptyState())
  })

  it('берёт только неудалённые объекты и марки и отмечает пересечения', () => {
    const state = stateFromMatrix(
      matrix([
        obj('O1', 'Корпус', [mark('M1', 'АР'), mark('M2', 'КЖ', { number: 2 }), mark('M3', 'ОВ', { deleted: true })]),
        obj('O2', 'Склад', [mark('M1', 'АР')]),
        obj('O3', 'Снесённый', [mark('M4', 'ГП')], { deleted: true }),
      ]),
    )

    expect(state.rows.map((r) => r.name)).toEqual(['Корпус', 'Склад'])
    expect(state.columns.map(columnKey)).toEqual(['M1|', 'M2|2'])
    expect(state.checked).toEqual(new Set(['O1::M1|', 'O1::M2|2', 'O2::M1|']))
  })

  it('восстанавливает порядок колонок из mark_order, остальные — по первому появлению', () => {
    const state = stateFromMatrix(
      matrix([obj('O1', 'Корпус', [mark('M1', 'АР'), mark('M2', 'КЖ'), mark('M3', 'ГП')])], {
        mark_order: [
          { id: 'M3', number: '' },
          { id: 'GONE', number: '' },
          { id: 'M1', number: '' },
        ],
      }),
    )

    expect(state.columns.map((c) => c.name)).toEqual(['ГП', 'АР', 'КЖ'])
  })

  it('различает в mark_order колонки одной марки с разными номерами', () => {
    const state = stateFromMatrix(
      matrix([obj('O1', 'Корпус', [mark('M1', 'АР'), mark('M1', 'АР', { number: '1' }), mark('M1', 'АР', { number: '2' })])], {
        mark_order: [
          { id: 'M1', number: '2' },
          { id: 'M1', number: '' },
          { id: 'M1', number: '1' },
        ],
      }),
    )

    expect(state.columns.map((c) => `${c.name}${c.number}`)).toEqual(['АР2', 'АР', 'АР1'])
  })

  it('элементы mark_order, не являющиеся колонкой {id, number}, не учитываются', () => {
    const saved = matrix([obj('O1', 'Корпус', [mark('M1', 'АР'), mark('M2', 'КЖ')])], {
      mark_order: ['M2|', { id: 'M2', number: '' }] as unknown as SelectionMatrix['mark_order'],
    })

    expect(stateFromMatrix(saved).columns.map(columnKey)).toEqual(['M2|', 'M1|'])
  })
})

describe('buildSelectionMatrix', () => {
  it('новый проект: объекты с отмеченными марками, папки создаются', () => {
    const state = withChecks([KORPUS, SKLAD], [AR, KZH2], [['O1', AR], ['O1', KZH2]])
    const result = buildSelectionMatrix(state, null, PROJECT)

    expect(result.folder_structure_id).toBe('')
    expect(result.mark_order).toEqual([
      { id: 'M1', number: '' },
      { id: 'M2', number: '2' },
    ])
    expect(result.objects).toEqual([
      obj('O1', 'Корпус', [mark('M1', 'АР'), mark('M2', 'КЖ', { number: '2' })], { number: '1' }),
    ])
  })

  it('существующие папки сохраняют folder_structure_id', () => {
    const original = matrix([
      obj('O1', 'Корпус', [mark('M1', 'АР', { folder_structure_id: 'MF1' })], { folder_structure_id: 'OF1' }),
    ])
    const result = buildSelectionMatrix(stateFromMatrix(original), original, PROJECT)

    expect(result.folder_structure_id).toBe('PF')
    expect(result.objects[0].folder_structure_id).toBe('OF1')
    expect(result.objects[0].marks[0]).toMatchObject({ folder_structure_id: 'MF1', to_remove: false, to_restore: false })
  })

  it('снятая отметка помечает марку на удаление', () => {
    const original = matrix([
      obj('O1', 'Корпус', [mark('M1', 'АР', { folder_structure_id: 'MF1' }), mark('M2', 'КЖ', { folder_structure_id: 'MF2' })], {
        folder_structure_id: 'OF1',
      }),
    ])
    const state = matrixReducer(stateFromMatrix(original), { type: 'toggleCell', rowId: 'O1', colKey: 'M2|' })
    const marks = buildSelectionMatrix(state, original, PROJECT).objects[0].marks

    expect(marks.find((m) => m.id === 'M1')).toMatchObject({ to_remove: false })
    expect(marks.find((m) => m.id === 'M2')).toMatchObject({ to_remove: true, folder_structure_id: 'MF2' })
  })

  it('объект без отметок или убранный из таблицы удаляется целиком', () => {
    const original = matrix([
      obj('O1', 'Корпус', [mark('M1', 'АР', { folder_structure_id: 'MF1' })], { folder_structure_id: 'OF1' }),
      obj('O2', 'Склад', [mark('M1', 'АР', { folder_structure_id: 'MF2' })], { folder_structure_id: 'OF2' }),
    ])
    let state = stateFromMatrix(original)
    state = matrixReducer(state, { type: 'toggleRowSelection', rowId: 'O2' })
    state = matrixReducer(state, { type: 'deleteSelected' })
    const removed = buildSelectionMatrix(state, original, PROJECT).objects.find((o) => o.id === 'O2')

    expect(removed).toMatchObject({ to_remove: true, folder_structure_id: 'OF2' })
    expect(removed?.marks[0]).toMatchObject({ to_remove: true })
  })

  it('повторно выбранные удалённые объект и марка восстанавливаются', () => {
    const original = matrix([
      obj('O1', 'Корпус', [mark('M1', 'АР', { folder_structure_id: 'MF1', deleted: true })], {
        folder_structure_id: 'OF1',
        deleted: true,
      }),
    ])
    const state = withChecks([KORPUS], [AR], [['O1', AR]])
    const result = buildSelectionMatrix(state, original, PROJECT).objects[0]

    expect(result).toMatchObject({ deleted: true, to_restore: true, folder_structure_id: 'OF1' })
    expect(result.marks[0]).toMatchObject({ deleted: true, to_restore: true, folder_structure_id: 'MF1' })
  })

  it('уже удалённое и снова не выбранное не удаляется повторно', () => {
    const original = matrix([obj('O1', 'Корпус', [mark('M1', 'АР', { deleted: true })], { deleted: true })])
    const result = buildSelectionMatrix(emptyState(), original, PROJECT).objects[0]

    expect(result).toMatchObject({ to_remove: false, deleted: true })
    expect(result.marks[0]).toMatchObject({ to_remove: false, deleted: true })
  })

  it('порядок строк и колонок после перетаскивания уходит в матрицу', () => {
    let state = withChecks([KORPUS, SKLAD], [AR, KZH2], [['O1', AR], ['O2', KZH2]])
    state = matrixReducer(state, { type: 'moveRow', activeId: 'O2', overId: 'O1' })
    state = matrixReducer(state, { type: 'moveColumn', activeKey: 'M2|2', overKey: 'M1|' })
    const result = buildSelectionMatrix(state, null, PROJECT)

    expect(result.objects.map((o) => o.id)).toEqual(['O2', 'O1'])
    expect(result.mark_order).toEqual([
      { id: 'M2', number: '2' },
      { id: 'M1', number: '' },
    ])
  })
})

describe('matrixReducer', () => {
  it('не добавляет дубликаты строк и колонок, новые добавляет', () => {
    let state = withChecks([KORPUS], [AR], [])
    // дубль по id, дубль по имени и один новый объект
    state = matrixReducer(state, { type: 'addRows', rows: [KORPUS, { id: 'O9', name: 'Корпус', number: '' }, SKLAD] })
    state = matrixReducer(state, { type: 'addColumn', column: { ...AR } })

    expect(state.rows).toEqual([KORPUS, SKLAD])
    expect(state.columns).toEqual([AR])
  })

  it('удаление выделенного убирает отметки удалённых строк и колонок', () => {
    let state = withChecks([KORPUS, SKLAD], [AR, KZH2], [['O1', AR], ['O1', KZH2], ['O2', AR]])
    state = matrixReducer(state, { type: 'toggleColumnSelection', colKey: 'M2|2' })
    state = matrixReducer(state, { type: 'toggleRowSelection', rowId: 'O2' })
    state = matrixReducer(state, { type: 'deleteSelected' })

    expect(state.rows).toEqual([KORPUS])
    expect(state.columns).toEqual([AR])
    expect(state.checked).toEqual(new Set(['O1::M1|']))
    expect(state.selectedRows.size + state.selectedColumns.size).toBe(0)
  })

  it('перемещение на неизвестный элемент ничего не меняет', () => {
    const state = withChecks([KORPUS, SKLAD], [AR], [])
    expect(matrixReducer(state, { type: 'moveRow', activeId: 'O1', overId: 'NOPE' }).rows).toEqual([KORPUS, SKLAD])
  })
})

describe('проверки', () => {
  it('duplicateRows находит совпадения по id и по имени', () => {
    const state = withChecks([KORPUS], [], [])
    expect(duplicateRows(state, [KORPUS, { id: 'X', name: 'Корпус', number: '' }, SKLAD])).toHaveLength(2)
  })

  it.each([
    ['', true],
    ['1', true],
    [99, true],
    [0, false],
    [100, false],
    ['1.5', false],
  ])('validMarkNumber(%s) = %s', (value, expected) => {
    expect(validMarkNumber(value)).toBe(expected)
  })
})
