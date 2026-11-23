// Хуки TanStack Query: загрузка, кэш и состояния «загружается / ошибка» для данных из Vitro-CAD.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import type { SelectionMatrix } from './types'

export const queryKeys = {
  config: ['config'] as const,
  project: (id: string) => ['project', id] as const,
  objects: (parentId: string) => ['objects', parentId] as const,
  marks: ['marks'] as const,
}

export function useConfig() {
  return useQuery({ queryKey: queryKeys.config, queryFn: api.config, staleTime: Infinity })
}

export function useProject(id: string) {
  return useQuery({ queryKey: queryKeys.project(id), queryFn: () => api.project(id) })
}

/** Списки объектов и марок грузятся при первом открытии окна добавления и кэшируются. */
export function useObjects(parentId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.objects(parentId ?? ''),
    queryFn: () => api.objects(parentId as string),
    enabled: enabled && Boolean(parentId),
    staleTime: 5 * 60_000,
  })
}

export function useMarks(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.marks, queryFn: api.marks, enabled, staleTime: 5 * 60_000 })
}

export function usePreview(projectId: string) {
  return useMutation({ mutationFn: (matrix: SelectionMatrix) => api.preview(projectId, matrix) })
}

export function useApplyStructure(projectId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (matrix: SelectionMatrix) => api.applyStructure(projectId, matrix),
    // После создания структуры перечитываем проект: в нём новая матрица с id папок
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.project(projectId) }),
  })
}
