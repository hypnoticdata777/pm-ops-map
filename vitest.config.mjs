import { defineConfig } from 'vitest/config';

// Tests import the same ES modules the browser ships (js/*.js) — there are no
// CommonJS mirrors. jsdom provides document/localStorage for the modules that
// touch the DOM. The optional sync server in server/ has its own test runner.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['js/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['js/**/*.js'],
      exclude: ['js/__tests__/**'],
      reporter: ['text-summary', 'html'],
    },
  },
});
