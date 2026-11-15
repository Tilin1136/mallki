import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir:'./tests',
  testMatch:'*.spec.mjs',
  workers:1,
  timeout:120000,
  expect:{timeout:12000},
  use:{
    baseURL:process.env.MALLKI_URL || 'http://127.0.0.1:8787',
    ...devices['Desktop Chrome'],
    channel:'chrome',
    headless:true,
    trace:'retain-on-failure',
  },
  reporter:'list',
});
