import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './lib'),
      '@/ui': resolve(__dirname, './lib/ui'),
      '@/utils': resolve(__dirname, './lib/utils'),
      '@/commands': resolve(__dirname, './lib/commands'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/integration/**/*.integration.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
    ],
    // Integration tests need more time due to real I/O operations
    testTimeout: 30000,
    // Limit concurrency to avoid resource contention
    maxConcurrency: 3,
    // Use forks pool for better isolation
    pool: 'forks',
  },
});
