import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'

/** Рендер с теми же провайдерами, что в main.tsx, и свежим кэшем запросов на каждый тест. */
export function renderWithProviders(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <MantineProvider>
      <ModalsProvider>
        <Notifications />
        <QueryClientProvider client={client}>{ui}</QueryClientProvider>
      </ModalsProvider>
    </MantineProvider>,
  )
}

/** Подмена fetch: путь API (без префикса api/v1/) → тело ответа или функция от тела запроса. */
export function mockApi(routes: Record<string, unknown | ((body: unknown) => unknown)>) {
  const calls: { path: string; method: string; body: unknown }[] = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const path = url.pathname.replace(/^.*\/api\/v1\//, '') + url.search
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ path, method, body })
    const key = `${method} ${path}`
    if (!(key in routes)) return new Response(JSON.stringify({ error: `нет мока для ${key}` }), { status: 500 })
    const handler = routes[key]
    const data = typeof handler === 'function' ? (handler as (b: unknown) => unknown)(body) : handler
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
  return calls
}
