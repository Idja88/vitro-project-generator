import { Alert, Box } from '@mantine/core'

import { projectIdFromLocation } from './api/client'
import { ProjectPage } from './features/project/ProjectPage'

export default function App() {
  const projectId = projectIdFromLocation()

  return (
    <Box p="md">
      {projectId ? (
        <ProjectPage projectId={projectId} />
      ) : (
        <Alert color="blue" title="Проект не выбран" maw={640} mx="auto" mt="xl">
          Откройте генератор из карточки проекта в Vitro-CAD: действие «Генератор проектов» в реестре проектов.
        </Alert>
      )}
    </Box>
  )
}
