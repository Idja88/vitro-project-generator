import { Alert, AppShell, Group, Title } from '@mantine/core'

import { projectIdFromLocation } from './api/client'
import { ProjectPage } from './features/project/ProjectPage'

export default function App() {
  const projectId = projectIdFromLocation()

  return (
    <AppShell header={{ height: 52 }} padding="md">
      <AppShell.Header px="md">
        <Group h="100%">
          <Title order={4}>Vitro Project Generator</Title>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        {projectId ? (
          <ProjectPage projectId={projectId} />
        ) : (
          <Alert color="blue" title="Проект не выбран" maw={640} mx="auto" mt="xl">
            Откройте генератор из карточки проекта в Vitro-CAD: действие «Генератор проектов» в реестре проектов.
          </Alert>
        )}
      </AppShell.Main>
    </AppShell>
  )
}
