import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@tfw/game': path.resolve(__dirname, '../../packages/game/src/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.e2e.test.ts'],
    environment: 'node',
  },
});
