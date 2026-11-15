import { defineConfig, devices } from '@playwright/test'
const backendEnv = {
  VITE_SUPABASE_URL: 'https://lisas-test.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_fixture',
  VITE_BASE_PATH: '/',
}
export default defineConfig({
  testDir: 'tests/browser',
  fullyParallel: true,
  workers: 2,
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: [
    {
      command: 'npm run dev -- --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
      env: {
        ...backendEnv,
        VITE_CONTRIBUTIONS_ENABLED: 'true',
        VITE_TURNSTILE_SITE_KEY: 'test-site-key',
        VITE_PRIVACY_CONTROLLER: 'Titolare di test',
        VITE_PRIVACY_CONTACT: 'privacy@example.org',
        VITE_PRIVACY_RETENTION: 'Periodo di test',
      },
    },
    {
      command: 'npm run dev -- --port 4175 --strictPort',
      url: 'http://127.0.0.1:4175',
      reuseExistingServer: false,
      env: {
        ...backendEnv,
        VITE_CONTRIBUTIONS_ENABLED: 'false',
        VITE_TURNSTILE_SITE_KEY: '',
        VITE_PRIVACY_CONTROLLER: '',
        VITE_PRIVACY_CONTACT: '',
        VITE_PRIVACY_RETENTION: '',
      },
    },
  ],
})
