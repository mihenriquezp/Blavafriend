import { defineConfig } from '@playwright/test'

if (process.env.VITE_SUPABASE_URL !== 'http://127.0.0.1:54321')
  throw new Error('Integration tests require the isolated local Supabase URL')

export default defineConfig({
  testDir: './tests/integration',
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4173', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173', reuseExistingServer: false },
})
