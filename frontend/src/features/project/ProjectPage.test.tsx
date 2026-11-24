import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { Project, SelectionMatrix } from '../../api/types'
import { mockApi, renderWithProviders } from '../../test/render'
import { ProjectPage } from './ProjectPage'

const SAVED: SelectionMatrix = {
  id: 'P1',
  name: 'Проект',
  folder_structure_id: 'PF',
  objects: [
    {
      id: 'O1',
      name: 'Корпус',
      number: '1',
      folder_structure_id: 'OF1',
      deleted: false,
      to_remove: false,
      to_restore: false,
      marks: [
        { id: 'M1', name: 'АР', number: '', folder_structure_id: 'MF1', deleted: false, to_remove: false, to_restore: false },
        { id: 'M2', name: 'КЖ', number: '2', folder_structure_id: 'MF2', deleted: false, to_remove: false, to_restore: false },
      ],
    },
  ],
}

const project = (matrix: SelectionMatrix | null): Project => ({
  id: 'P1',
  name: 'Проект',
  code: '0079',
  chief: 'Иванов И.И.',
  objectParentId: 'SITE',
  isGenerated: matrix !== null,
  matrix,
})

const CONFIG = { vitroBaseUrl: 'http://vitro', objectListUrl: null, markListUrl: null }

describe('ProjectPage', () => {
  it('показывает карточку проекта и сохранённую матрицу', async () => {
    mockApi({ 'GET projects/P1': project(SAVED), 'GET config': CONFIG })
    renderWithProviders(<ProjectPage projectId="P1" />)

    expect(await screen.findByText('Проект')).toBeInTheDocument()
    expect(screen.getByText('Шифр 0079')).toBeInTheDocument()
    expect(screen.getByText('ГИП: Иванов И.И.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Обновить структуру' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Корпус — АР' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Корпус — КЖ2' })).toBeChecked()
  })

  it('пустой новый проект: Форма 10 недоступна, кнопка «Создать»', async () => {
    mockApi({ 'GET projects/P1': project(null), 'GET config': CONFIG })
    renderWithProviders(<ProjectPage projectId="P1" />)

    expect(await screen.findByText('Матрица пуста')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Форма 10/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Создать структуру' })).toBeInTheDocument()
  })

  it('снятая отметка → предпросмотр с удалением → сохранение матрицы', async () => {
    const user = userEvent.setup()
    const calls = mockApi({
      'GET projects/P1': project(SAVED),
      'GET config': CONFIG,
      'POST projects/P1/structure/preview': {
        actions: [{ type: 'remove', kind: 'mark', name: 'КЖ2', object: 'Корпус' }],
        summary: { create: 0, remove: 1, restore: 0 },
      },
      'POST projects/P1/structure': (body: unknown) => ({ matrix: body, project_link: 'http://vitro/item/PF' }),
    })
    renderWithProviders(<ProjectPage projectId="P1" />)

    await user.click(await screen.findByRole('checkbox', { name: 'Корпус — КЖ2' }))
    await user.click(screen.getByRole('button', { name: 'Обновить структуру' }))

    const dialog = await screen.findByRole('dialog', { name: 'Проверьте изменения' })
    expect(within(dialog).getByText('Будет удалено в корзину')).toBeInTheDocument()
    expect(within(dialog).getByText('Марка КЖ2 — Корпус')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Обновить структуру' }))
    expect(await screen.findByRole('link', { name: 'Открыть в Vitro-CAD' })).toHaveAttribute('href', 'http://vitro/item/PF')

    const sent = calls.find((c) => c.method === 'POST' && c.path === 'projects/P1/structure')?.body as SelectionMatrix
    const kzh = sent.objects[0].marks.find((m) => m.id === 'M2')
    expect(kzh).toMatchObject({ to_remove: true, folder_structure_id: 'MF2' })
    expect(sent.mark_order).toEqual([
      { id: 'M1', number: '' },
      { id: 'M2', number: '2' },
    ])
  })

  it('выделение строки и удаление через подтверждение', async () => {
    const user = userEvent.setup()
    mockApi({ 'GET projects/P1': project(SAVED), 'GET config': CONFIG })
    renderWithProviders(<ProjectPage projectId="P1" />)

    await user.click(await screen.findByRole('button', { name: 'Корпус' }))
    await user.click(screen.getByRole('button', { name: 'Удалить выбранное (1)' }))
    await user.click(await screen.findByRole('button', { name: 'Удалить' }))

    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Корпус — АР' })).not.toBeInTheDocument())
  })

  it('без авторизации подсказывает открыть генератор из Vitro-CAD', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ message: 'Отсутствует токен авторизации!' }), { status: 401 })) as typeof fetch
    renderWithProviders(<ProjectPage projectId="P1" />)

    expect(await screen.findByText('Нет авторизации')).toBeInTheDocument()
  })
})
