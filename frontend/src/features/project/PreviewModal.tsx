import { Alert, Badge, Button, Group, List, Modal, ScrollArea, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { IconFolderPlus, IconRestore, IconTrash } from '@tabler/icons-react'
import type { ReactNode } from 'react'

import type { ActionType, Preview, PreviewAction } from '../../api/types'

const GROUPS: { type: ActionType; title: string; color: string; icon: ReactNode }[] = [
  { type: 'create', title: 'Будет создано', color: 'teal', icon: <IconFolderPlus size={14} /> },
  { type: 'restore', title: 'Будет восстановлено из корзины', color: 'blue', icon: <IconRestore size={14} /> },
  { type: 'remove', title: 'Будет удалено в корзину', color: 'red', icon: <IconTrash size={14} /> },
]

const KIND: Record<PreviewAction['kind'], string> = { project: 'Папка проекта', object: 'Объект', mark: 'Раздел' }

function describe(action: PreviewAction): string {
  if (action.kind === 'mark') return `${KIND.mark} ${action.name}${action.object ? ` — ${action.object}` : ' — в папке проекта'}`
  return `${KIND[action.kind]} «${action.name}»`
}

interface Props {
  opened: boolean
  preview: Preview | undefined
  submitting: boolean
  isUpdate: boolean
  onClose: () => void
  onConfirm: () => void
}

export function PreviewModal({ opened, preview, submitting, isUpdate, onClose, onConfirm }: Props) {
  const total = preview ? preview.summary.create + preview.summary.remove + preview.summary.restore : 0

  return (
    <Modal opened={opened} onClose={onClose} title={<Title order={4}>Проверьте изменения</Title>} size="lg">
      {preview && (
        <Stack>
          {total === 0 ? (
            <Alert color="gray">
              Папки в Vitro-CAD не изменятся. Будет сохранена только матрица, например новый порядок строк и
              столбцов.
            </Alert>
          ) : (
            <ScrollArea.Autosize mah="55vh">
              <Stack gap="md">
                {GROUPS.filter((g) => preview.summary[g.type] > 0).map((group) => (
                  <div key={group.type}>
                    <Group gap="xs" mb={6}>
                      <Text fw={600}>{group.title}</Text>
                      <Badge color={group.color} variant="light">
                        {preview.summary[group.type]}
                      </Badge>
                    </Group>
                    <List
                      spacing={4}
                      size="sm"
                      icon={
                        <ThemeIcon color={group.color} size={20} radius="xl" variant="light">
                          {group.icon}
                        </ThemeIcon>
                      }
                    >
                      {preview.actions
                        .filter((a) => a.type === group.type)
                        .map((action, i) => (
                          <List.Item key={i}>{describe(action)}</List.Item>
                        ))}
                    </List>
                  </div>
                ))}
              </Stack>
            </ScrollArea.Autosize>
          )}
          {preview.summary.remove > 0 && (
            <Alert color="red" variant="light">
              Удалённые папки попадут в корзину Vitro-CAD; их можно вернуть, снова отметив раздел или объект.
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose} disabled={submitting}>
              Отмена
            </Button>
            <Button color="teal" onClick={onConfirm} loading={submitting}>
              {total === 0 ? 'Сохранить матрицу' : isUpdate ? 'Обновить структуру' : 'Создать структуру'}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
