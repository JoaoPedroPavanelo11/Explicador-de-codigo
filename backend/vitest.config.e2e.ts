import { defineConfig } from 'vitest/config';

// Testes e2e sobem a aplicação inteira contra um PostgreSQL real
// (docker compose -f docker-compose.dev.yml up -d).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    setupFiles: ['dotenv/config'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
