/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Сборка с относительными путями ('./assets/…'): Flask отдаёт её под любым префиксом (/ или /generator/),
// подставляя префикс в <base href>. В разработке Vite проксирует API на Flask (порт 5000).
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? './' : '/',
  // Внутренний инструмент: один бандл ~200 КБ gzip, дробить на чанки незачем
  build: { chunkSizeWarningLimit: 1024 },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:5000',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
}))
