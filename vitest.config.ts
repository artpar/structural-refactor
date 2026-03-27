import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: '.',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/cli/commands/**',   // CLI command wiring — tested via integration
        'src/core/project-context.ts', // pure interfaces, no runtime code
        'src/scanner/types.ts',        // pure types, no runtime code
        'src/index.ts',                // barrel re-exports, no logic
        'src/patterns/types.ts',       // pure types, no runtime code
      ],
      reporter: ['text'],
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 95,
        lines: 90,
      },
    },
  },
});
