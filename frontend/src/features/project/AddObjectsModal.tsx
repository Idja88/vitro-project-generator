import { Alert, Anchor, Button, Group, Loader, Modal, MultiSelect, Stack } from '@mantine/core'
import { useMemo, useState } from 'react'

import { useObjects } from '../../api/queries'
import { NULL_OBJECT_ID, NULL_OBJECT_NAME, type MatrixState, type Row } from '../matrix/model'

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, 'ru', { numeric: true, sensitivity: 'base', ignorePunctuation: true })

interface Props {
  opened: boolean
  onClose: () => void
  parentId: string | null
  listUrl: string | null
  state: MatrixState
  onAdd: (rows: Row[]) => void
}

export function AddObjectsModal({ opened, onClose, parentId, listUrl, state, onAdd }: Props) {
  const [selected, setSelected] = useState<string[]>([])
  const objects = useObjects(parentId, opened)

  // «Общий объект» первым, дальше объекты площадки по имени; уже добавленные недоступны
  const rows = useMemo<Row[]>(
    () => [
      { id: NULL_OBJECT_ID, name: NULL_OBJECT_NAME, number: '' },
      ...[...(objects.data ?? [])].sort(byName),
    ],
    [objects.data],
  )
  const present = new Set(state.rows.map((r) => r.id))
  const data = rows.map((row) => ({
    value: row.id,
    label: present.has(row.id) ? `${row.name} (уже в таблице)` : row.name,
    disabled: present.has(row.id),
  }))

  function close() {
    setSelected([])
    onClose()
  }

  function submit() {
    onAdd(rows.filter((row) => selected.includes(row.id)))
    close()
  }

  return (
    <Modal opened={opened} onClose={close} title="Добавить объекты проектирования" size="lg">
      <Stack>
        {!parentId && (
          <Alert color="red" title="У проекта не указана площадка">
            Заполните поле «Площадка проекта» в карточке проекта в Vitro-CAD.
          </Alert>
        )}
        {objects.isError && (
          <Alert color="red" title="Не удалось загрузить объекты">
            {objects.error.message}
          </Alert>
        )}
        <MultiSelect
          label="Объекты"
          placeholder={objects.isLoading ? 'Загрузка…' : 'Начните вводить название'}
          data={data}
          value={selected}
          onChange={setSelected}
          searchable
          clearable
          hidePickedOptions
          nothingFoundMessage="Ничего не найдено"
          rightSection={objects.isLoading ? <Loader size="xs" /> : undefined}
          disabled={!parentId || objects.isLoading}
          maxDropdownHeight={320}
          data-autofocus
        />
        <Group justify="space-between">
          {listUrl ? (
            <Anchor href={listUrl} target="_blank" size="sm">
              Открыть реестр объектов
            </Anchor>
          ) : (
            <span />
          )}
          <Group>
            <Button variant="default" onClick={close}>
              Отмена
            </Button>
            <Button onClick={submit} disabled={selected.length === 0}>
              Добавить{selected.length > 1 ? ` (${selected.length})` : ''}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}
