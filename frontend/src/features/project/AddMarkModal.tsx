import { Alert, Anchor, Button, Group, Loader, Modal, NumberInput, Select, Stack } from '@mantine/core'
import { useMemo, useState } from 'react'

import { useMarks } from '../../api/queries'
import { columnLabel, hasColumn, validMarkNumber, type Column, type MatrixState } from '../matrix/model'

interface Props {
  opened: boolean
  onClose: () => void
  listUrl: string | null
  state: MatrixState
  onAdd: (column: Column) => void
}

export function AddMarkModal({ opened, onClose, listUrl, state, onAdd }: Props) {
  const [markId, setMarkId] = useState<string | null>(null)
  const [number, setNumber] = useState<string | number>('')
  const marks = useMarks(opened)

  const data = useMemo(
    () =>
      [...(marks.data ?? [])]
        .sort((a, b) => a.code.localeCompare(b.code, 'ru', { numeric: true }))
        .map((m) => ({ value: m.id, label: m.name && m.name !== m.code ? `${m.code} — ${m.name}` : m.code })),
    [marks.data],
  )

  const mark = marks.data?.find((m) => m.id === markId)
  const column: Column | null = mark ? { id: mark.id, name: mark.code, number: String(number) } : null
  const numberError = validMarkNumber(number) ? null : 'Введите число от 1 до 99'
  const duplicate = column !== null && hasColumn(state, column)

  function close() {
    setMarkId(null)
    setNumber('')
    onClose()
  }

  function submit() {
    if (column && !numberError && !duplicate) {
      onAdd(column)
      close()
    }
  }

  return (
    <Modal opened={opened} onClose={close} title="Добавить раздел">
      <Stack>
        {marks.isError && (
          <Alert color="red" title="Не удалось загрузить разделы">
            {marks.error.message}
          </Alert>
        )}
        <Select
          label="Раздел"
          placeholder={marks.isLoading ? 'Загрузка…' : 'Выберите раздел'}
          data={data}
          value={markId}
          onChange={setMarkId}
          searchable
          nothingFoundMessage="Ничего не найдено"
          rightSection={marks.isLoading ? <Loader size="xs" /> : undefined}
          disabled={marks.isLoading}
          maxDropdownHeight={320}
          data-autofocus
        />
        <NumberInput
          label="Номер раздела"
          description="1–99, или оставьте пустым, если номер не нужен"
          value={number}
          onChange={setNumber}
          min={1}
          max={99}
          allowDecimal={false}
          allowNegative={false}
          error={numberError}
        />
        {duplicate && column && (
          <Alert color="yellow">Раздел «{columnLabel(column)}» уже есть в таблице.</Alert>
        )}
        <Group justify="space-between">
          {listUrl ? (
            <Anchor href={listUrl} target="_blank" size="sm">
              Перейти к списку
            </Anchor>
          ) : (
            <span />
          )}
          <Group>
            <Button variant="default" onClick={close}>
              Отмена
            </Button>
            <Button onClick={submit} disabled={!column || Boolean(numberError) || duplicate}>
              Добавить
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}
