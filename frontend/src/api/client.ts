// HTTP-клиент /api/v1.
//
// Адреса строятся от document.baseURI: Flask подставляет в <base href> префикс приложения
// (/generator/ за nginx, / локально), поэтому сборка не зависит от того, где её развернули.

import type { ApplyResult, AppConfig, DesignObject, Mark, Preview, Project, SelectionMatrix } from './types'

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function apiUrl(path: string): string {
  return new URL(`api/v1/${path}`, document.baseURI).toString()
}

async function errorFrom(response: Response): Promise<ApiError> {
  let message = `Ошибка сервера (${response.status})`
  try {
    const body = await response.json()
    message = body.error ?? body.message ?? message
  } catch {
    // ответ не JSON — оставляем общее сообщение
  }
  return new ApiError(message, response.status)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), { credentials: 'same-origin', ...init })
  if (!response.ok) throw await errorFrom(response)
  return response.json() as Promise<T>
}

function postJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export const api = {
  config: () => request<AppConfig>('config'),
  project: (id: string) => request<Project>(`projects/${encodeURIComponent(id)}`),
  objects: (parentId: string) => request<DesignObject[]>(`objects?parent=${encodeURIComponent(parentId)}`),
  marks: () => request<Mark[]>('marks'),
  preview: (projectId: string, matrix: SelectionMatrix) =>
    postJson<Preview>(`projects/${encodeURIComponent(projectId)}/structure/preview`, matrix),
  applyStructure: (projectId: string, matrix: SelectionMatrix) =>
    postJson<ApplyResult>(`projects/${encodeURIComponent(projectId)}/structure`, matrix),

  /** Скачивает Ф10: fetch вместо перехода по ссылке, чтобы показать ошибку, а не JSON в браузере. */
  async downloadF10(projectId: string): Promise<void> {
    const response = await fetch(apiUrl(`projects/${encodeURIComponent(projectId)}/f10`), {
      credentials: 'same-origin',
    })
    if (!response.ok) throw await errorFrom(response)

    const disposition = response.headers.get('Content-Disposition') ?? ''
    const match = /filename\*=UTF-8''([^;]+)/i.exec(disposition) ?? /filename="?([^";]+)"?/i.exec(disposition)
    const filename = match ? decodeURIComponent(match[1]) : 'Ф10.xlsx'

    const url = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  },
}

/** id проекта из адреса страницы /project/<id> (с любым префиксом перед ним). */
export function projectIdFromLocation(pathname = window.location.pathname): string | null {
  const match = /\/project\/([^/]+)\/?$/.exec(pathname)
  return match ? decodeURIComponent(match[1]) : null
}
