import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    open: false,
  },
  build: {
    // Mermaid's lazily loaded chunks are about 690 kB and can't be split further. This
    // still flags anything larger, but the main bundle (about 435 kB) can grow past 500 kB unwarned.
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // App tests re-import the whole app per test, which is slow on a busy CI runner.
    testTimeout: 30000,
  },
});
