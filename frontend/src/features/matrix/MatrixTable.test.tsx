import { MantineProvider } from '@mantine/core'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { MatrixTable } from './MatrixTable'
import { emptyState, NULL_OBJECT_ID, NULL_OBJECT_NAME, type MatrixState } from './model'

const state: MatrixState = {
  ...emptyState(),
  rows: [
    { id: 'O1', name: 'Корпус', number: '7' },
    // номер в матрице у «Общего объекта» может оказаться любым — показывать его нельзя
    { id: NULL_OBJECT_ID, name: NULL_OBJECT_NAME, number: '1' },
  ],
  columns: [{ id: 'M1', name: 'АР', number: '' }],
}

function renderTable(dispatch = vi.fn()) {
  render(
    <MantineProvider>
      <MatrixTable state={state} dispatch={dispatch} />
    </MantineProvider>,
  )
  return dispatch
}

const rowOf = (name: string) => screen.getByRole('button', { name }).closest('tr') as HTMLElement

describe('MatrixTable: столбец «Номер по генплану»', () => {
  it('стоит вторым, сразу после наименования', () => {
    renderTable()
    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent)

    expect(headers.slice(0, 3)).toEqual(['Наименование объекта', 'Номер по генплану', 'АР'])
  })

  it('показывает номер объекта и пустую ячейку у «Общего объекта»', () => {
    renderTable()

    expect(within(rowOf('Корпус')).getAllByRole('cell')[0]).toHaveTextContent('7')
    expect(within(rowOf(NULL_OBJECT_NAME)).getAllByRole('cell')[0]).toHaveTextContent(/^$/)
  })

  it('клик по номеру не выделяет строку — только клик по наименованию', async () => {
    const dispatch = renderTable()

    await userEvent.click(within(rowOf('Корпус')).getAllByRole('cell')[0])
    expect(dispatch).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Корпус' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'toggleRowSelection', rowId: 'O1' })
  })
})
