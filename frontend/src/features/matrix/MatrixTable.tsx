// Таблица «объекты × марки».
//
// Строки и колонки перетаскиваются за ручку (dnd-kit), клик по названию объекта или коду марки
// выделяет строку/колонку для удаления, при наведении подсвечиваются строка и колонка ячейки.
// Компонент ничего не хранит, кроме подсветки: всё состояние матрицы приходит в props.

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { Checkbox, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { IconGripHorizontal, IconGripVertical } from '@tabler/icons-react'
import { useState, type CSSProperties, type Dispatch } from 'react'

import { cellKey, columnKey, columnLabel, type Column, type MatrixAction, type MatrixState, type Row } from './model'
import classes from './MatrixTable.module.css'

const ROW = 'row:'
const COL = 'col:'

/** Цель перетаскивания ищется только среди элементов того же вида: строка — среди строк, колонка — среди колонок. */
const sameKindCollision: CollisionDetection = (args) => {
  const prefix = String(args.active.id).startsWith(ROW) ? ROW : COL
  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter((c) => String(c.id).startsWith(prefix)),
  })
}

interface Hover {
  rowId: string | null
  colKey: string | null
}

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ')

function ColumnHeader({
  column,
  selected,
  highlighted,
  onToggle,
  onHover,
}: {
  column: Column
  selected: boolean
  highlighted: boolean
  onToggle: () => void
  onHover: () => void
}) {
  const key = columnKey(column)
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: COL + key,
  })
  const style: CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, 0, 0)` : undefined,
    transition,
  }

  return (
    <th
      ref={setNodeRef}
      style={style}
      className={cx(classes.colHeader, selected && classes.selected, highlighted && classes.highlight, isDragging && classes.dragging)}
      onMouseEnter={onHover}
    >
      <div className={classes.colHeaderInner}>
        <button
          type="button"
          ref={setActivatorNodeRef}
          className={classes.handle}
          aria-label={`Переместить раздел ${columnLabel(column)}`}
          {...attributes}
          {...listeners}
        >
          <IconGripHorizontal size={14} />
        </button>
        <UnstyledButton onClick={onToggle} className={classes.label} aria-pressed={selected}>
          {columnLabel(column)}
        </UnstyledButton>
      </div>
    </th>
  )
}

function MatrixRow({
  row,
  state,
  hover,
  onHover,
  dispatch,
}: {
  row: Row
  state: MatrixState
  hover: Hover
  onHover: (hover: Hover) => void
  dispatch: Dispatch<MatrixAction>
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: ROW + row.id,
  })
  const style: CSSProperties = {
    transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
    transition,
  }
  const rowSelected = state.selectedRows.has(row.id)

  return (
    <tr ref={setNodeRef} style={style} className={cx(isDragging && classes.dragging)}>
      <th
        scope="row"
        className={cx(classes.rowHeader, rowSelected && classes.selected, hover.rowId === row.id && classes.highlight)}
        onMouseEnter={() => onHover({ rowId: null, colKey: null })}
      >
        <div className={classes.rowHeaderInner}>
          <button
            type="button"
            ref={setActivatorNodeRef}
            className={classes.handle}
            aria-label={`Переместить объект ${row.name}`}
            {...attributes}
            {...listeners}
          >
            <IconGripVertical size={14} />
          </button>
          <UnstyledButton
            onClick={() => dispatch({ type: 'toggleRowSelection', rowId: row.id })}
            className={classes.label}
            aria-pressed={rowSelected}
          >
            {row.name}
          </UnstyledButton>
        </div>
      </th>
      {state.columns.map((column) => {
        const key = columnKey(column)
        const checked = state.checked.has(cellKey(row.id, key))
        const highlighted = hover.rowId === row.id || hover.colKey === key
        return (
          <td
            key={key}
            className={cx(
              classes.cell,
              highlighted && classes.highlight,
              hover.rowId === row.id && hover.colKey === key && classes.focus,
              (rowSelected || state.selectedColumns.has(key)) && classes.selected,
            )}
            onMouseEnter={() => onHover({ rowId: row.id, colKey: key })}
          >
            <Checkbox
              checked={checked}
              onChange={() => dispatch({ type: 'toggleCell', rowId: row.id, colKey: key })}
              aria-label={`${row.name} — ${columnLabel(column)}`}
              classNames={{ body: classes.checkboxBody }}
            />
          </td>
        )
      })}
    </tr>
  )
}

export function MatrixTable({ state, dispatch }: { state: MatrixState; dispatch: Dispatch<MatrixAction> }) {
  const [hover, setHover] = useState<Hover>({ rowId: null, colKey: null })
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId.startsWith(ROW)) {
      dispatch({ type: 'moveRow', activeId: activeId.slice(ROW.length), overId: overId.slice(ROW.length) })
    } else {
      dispatch({ type: 'moveColumn', activeKey: activeId.slice(COL.length), overKey: overId.slice(COL.length) })
    }
  }

  if (state.rows.length === 0 && state.columns.length === 0) {
    return (
      <div className={classes.empty}>
        <Text fw={500}>Матрица пуста</Text>
        <Text c="dimmed" size="sm">
          Добавьте объекты проектирования и разделы, затем отметьте пересечения.
        </Text>
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={sameKindCollision} onDragEnd={onDragEnd}>
      <div className={classes.scroll} onMouseLeave={() => setHover({ rowId: null, colKey: null })}>
        <table className={classes.table}>
          <thead>
            <tr>
              <th className={classes.corner} onMouseEnter={() => setHover({ rowId: null, colKey: null })}>
                <Tooltip label="Клик по названию выделяет строку или столбец, ручка — перетаскивание" withArrow>
                  <Text size="sm" fw={600}>
                    Наименование объекта
                  </Text>
                </Tooltip>
              </th>
              <SortableContext items={state.columns.map((c) => COL + columnKey(c))} strategy={horizontalListSortingStrategy}>
                {state.columns.map((column) => {
                  const key = columnKey(column)
                  return (
                    <ColumnHeader
                      key={key}
                      column={column}
                      selected={state.selectedColumns.has(key)}
                      highlighted={hover.colKey === key}
                      onToggle={() => dispatch({ type: 'toggleColumnSelection', colKey: key })}
                      onHover={() => setHover({ rowId: null, colKey: key })}
                    />
                  )
                })}
              </SortableContext>
            </tr>
          </thead>
          <tbody>
            <SortableContext items={state.rows.map((r) => ROW + r.id)} strategy={verticalListSortingStrategy}>
              {state.rows.map((row) => (
                <MatrixRow key={row.id} row={row} state={state} hover={hover} onHover={setHover} dispatch={dispatch} />
              ))}
            </SortableContext>
          </tbody>
        </table>
      </div>
    </DndContext>
  )
}
