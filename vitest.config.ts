import { defineConfig } from "vitest/config"
import { resolve } from "path"

export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}", "packages/**/*.test.{ts,tsx}"],
    testTimeout: 30_000,
    hookTimeout: 15_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      thresholds: {
        lines: 60,
        branches: 55,
        functions: 65,
        statements: 60,
      },
      exclude: ["**/*.test.ts", "**/*.test.tsx"],
    },
  },
  resolve: {
    alias: [
      {
        find: "@c8c/workflow-runner/node",
        replacement: resolve(
          __dirname,
          "packages/workflow-runner/src/node/index.ts",
        ),
      },
      {
        find: "@c8c/workflow-runner/schema",
        replacement: resolve(
          __dirname,
          "packages/workflow-runner/src/schema.ts",
        ),
      },
      {
        find: "@c8c/workflow-runner",
        replacement: resolve(
          __dirname,
          "packages/workflow-runner/src/index.ts",
        ),
      },
      { find: "@shared", replacement: resolve(__dirname, "src/shared") },
      { find: "@", replacement: resolve(__dirname, "src/renderer") },
    ],
  },
})
