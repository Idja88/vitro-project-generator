import { Alert, Anchor, Badge, Button, Center, Group, Loader, Modal, Paper, Stack, Text, Title } from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { IconCheck, IconFileSpreadsheet, IconPlus, IconTrash } from '@tabler/icons-react'
import { useEffect, useReducer, useState } from 'react'

import { api, ApiError } from '../../api/client'
import { useApplyStructure, useConfig, usePreview, useProject } from '../../api/queries'
import type { ApplyResult, SelectionMatrix } from '../../api/types'
import { MatrixTable } from '../matrix/MatrixTable'
import { buildSelectionMatrix, duplicateRows, emptyState, matrixReducer, stateFromMatrix } from '../matrix/model'
import { AddMarkModal } from './AddMarkModal'
import { AddObjectsModal } from './AddObjectsModal'
import { PreviewModal } from './PreviewModal'

function notifyError(title: string, error: unknown) {
  notifications.show({ color: 'red', title, message: error instanceof Error ? error.message : String(error) })
}

export function ProjectPage({ projectId }: { projectId: string }) {
  const project = useProject(projectId)
  const config = useConfig()
  const preview = usePreview(projectId)
  const apply = useApplyStructure(projectId)

  const [state, dispatch] = useReducer(matrixReducer, undefined, emptyState)
  const [modal, setModal] = useState<'objects' | 'mark' | 'preview' | null>(null)
  const [pending, setPending] = useState<SelectionMatrix | null>(null)
  const [result, setResult] = useState<ApplyResult | null>(null)
  const [exporting, setExporting] = useState(false)

  // Состояние редактора пересобирается из сохранённой матрицы при загрузке и после сохранения
  useEffect(() => {
    if (project.data) dispatch({ type: 'reset', state: stateFromMatrix(project.data.matrix) })
  }, [project.data, project.dataUpdatedAt])

  if (project.isPending) {
    return (
      <Center h="60vh">
        <Loader />
      </Center>
    )
  }

  if (project.isError) {
    const unauthorized = project.error instanceof ApiError && project.error.status === 401
    return (
      <Alert color="red" title={unauthorized ? 'Нет авторизации' : 'Не удалось загрузить проект'} maw={640} mx="auto" mt="xl">
        {unauthorized
          ? 'Сессия Vitro-CAD не найдена или истекла. Откройте генератор заново из карточки проекта в Vitro-CAD.'
          : project.error.message}
      </Alert>
    )
  }

  const data = project.data
  const selectionCount = state.selectedRows.size + state.selectedColumns.size

  function startApply() {
    const matrix = buildSelectionMatrix(state, data.matrix, { id: data.id, name: data.name })
    if (matrix.objects.length === 0) {
      notifications.show({
        color: 'yellow',
        title: 'Нечего сохранять',
        message: 'Отметьте хотя бы одну марку у объекта.',
      })
      return
    }
    preview.mutate(matrix, {
      onSuccess: () => {
        setPending(matrix)
        setModal('preview')
      },
      onError: (error) => notifyError('Не удалось подготовить изменения', error),
    })
  }

  function confirmApply() {
    if (!pending) return
    apply.mutate(pending, {
      onSuccess: (res) => {
        setModal(null)
        setPending(null)
        setResult(res)
      },
      onError: (error) => notifyError('Не удалось создать структуру', error),
    })
  }

  function confirmDelete() {
    modals.openConfirmModal({
      title: 'Удалить выбранное?',
      children: (
        <Text size="sm">
          Из матрицы будут убраны выбранные строки и столбцы ({selectionCount}). Папки в Vitro-CAD удалятся только
          после сохранения структуры.
        </Text>
      ),
      labels: { confirm: 'Удалить', cancel: 'Отмена' },
      confirmProps: { color: 'red' },
      onConfirm: () => dispatch({ type: 'deleteSelected' }),
    })
  }

  async function exportF10() {
    setExporting(true)
    try {
      await api.downloadF10(data.id)
    } catch (error) {
      notifyError('Не удалось выгрузить Ф10', error)
    } finally {
      setExporting(false)
    }
  }

  return (
    <Stack gap="md">
      <Paper withBorder radius="md" p="md">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <Stack gap={6}>
            <Title order={3}>{data.name}</Title>
            <Group gap="xs">
              {data.code && <Badge variant="light">Шифр {data.code}</Badge>}
              {data.chief && (
                <Badge variant="light" color="gray">
                  ГИП: {data.chief}
                </Badge>
              )}
              <Badge variant="dot" color={data.isGenerated ? 'teal' : 'gray'}>
                {data.isGenerated ? 'Структура создана' : 'Структура ещё не создана'}
              </Badge>
            </Group>
          </Stack>
          <Group gap="xs">
            <Button
              variant="default"
              leftSection={<IconFileSpreadsheet size={16} />}
              onClick={exportF10}
              loading={exporting}
              disabled={!data.matrix}
              title={data.matrix ? undefined : 'Сначала создайте структуру'}
            >
              Форма 10
            </Button>
            <Button color="teal" leftSection={<IconCheck size={16} />} onClick={startApply} loading={preview.isPending}>
              {data.isGenerated ? 'Обновить структуру' : 'Создать структуру'}
            </Button>
          </Group>
        </Group>
      </Paper>

      <Group justify="space-between">
        <Group gap="xs">
          <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => setModal('objects')}>
            Объекты
          </Button>
          <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => setModal('mark')}>
            Марка
          </Button>
          <Button
            variant="light"
            color="red"
            leftSection={<IconTrash size={16} />}
            disabled={selectionCount === 0}
            onClick={confirmDelete}
          >
            Удалить выбранное{selectionCount ? ` (${selectionCount})` : ''}
          </Button>
          {selectionCount > 0 && (
            <Button variant="subtle" color="gray" onClick={() => dispatch({ type: 'clearSelection' })}>
              Снять выделение
            </Button>
          )}
        </Group>
        <Text size="sm" c="dimmed">
          Объектов: {state.rows.length} · Марок: {state.columns.length}
        </Text>
      </Group>

      <MatrixTable state={state} dispatch={dispatch} />

      <AddObjectsModal
        opened={modal === 'objects'}
        onClose={() => setModal(null)}
        parentId={data.objectParentId}
        listUrl={config.data?.objectListUrl ?? null}
        state={state}
        onAdd={(rows) => {
          const duplicates = duplicateRows(state, rows)
          if (duplicates.length) {
            notifications.show({
              color: 'yellow',
              message: `Уже в таблице: ${duplicates.map((r) => r.name).join(', ')}`,
            })
          }
          dispatch({ type: 'addRows', rows })
        }}
      />
      <AddMarkModal
        opened={modal === 'mark'}
        onClose={() => setModal(null)}
        listUrl={config.data?.markListUrl ?? null}
        state={state}
        onAdd={(column) => dispatch({ type: 'addColumn', column })}
      />
      <PreviewModal
        opened={modal === 'preview'}
        preview={preview.data}
        submitting={apply.isPending}
        isUpdate={data.isGenerated}
        onClose={() => setModal(null)}
        onConfirm={confirmApply}
      />
      <Modal opened={result !== null} onClose={() => setResult(null)} title="Готово">
        <Stack>
          <Text>Структура проекта «{result?.matrix.name}» создана или обновлена.</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setResult(null)}>
              Закрыть
            </Button>
            {result?.project_link && (
              <Button component="a" href={result.project_link} target="_blank" onClick={() => setResult(null)}>
                Открыть в Vitro-CAD
              </Button>
            )}
          </Group>
          {result?.project_link && (
            <Anchor href={result.project_link} target="_blank" size="xs" c="dimmed">
              {result.project_link}
            </Anchor>
          )}
        </Stack>
      </Modal>
    </Stack>
  )
}
