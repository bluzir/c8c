import { defineConfig, externalizeDepsPlugin } from "electron-vite"
import { resolve } from "path"
import react from "@vitejs/plugin-react"
import tailwindcss from "tailwindcss"
import autoprefixer from "autoprefixer"
import { loadEnv } from "vite"

export default defineConfig(({ mode }) => {
  // Load .env/.env.local and let shell env override file values.
  const loadedEnv = loadEnv(mode, process.cwd(), "")
  const env = { ...loadedEnv, ...process.env }

  const buildFlavor = env.C8C_BUILD_FLAVOR === "release" ? "release" : "oss"
  const releaseChannel = env.C8C_RELEASE_CHANNEL === "beta" ? "beta" : "stable"
  const posthogHost = env.C8C_POSTHOG_HOST || ""
  const posthogKey = env.C8C_POSTHOG_KEY || ""
  const hasPosthogConfig = Boolean(posthogHost) && Boolean(posthogKey)
  const telemetryLocalTest = env.C8C_TELEMETRY_LOCAL_TEST === "1"
    || env.C8C_TELEMETRY_LOCAL_TEST === "true"
  const testMode = env.C8C_TEST_MODE === "1" || env.C8C_TEST_MODE === "true"
  if (buildFlavor === "release" && testMode) {
    throw new Error("C8C_TEST_MODE must be disabled for release builds")
  }
  const explicitTelemetryProvider = env.C8C_TELEMETRY_PROVIDER === "posthog"
    ? "posthog"
    : env.C8C_TELEMETRY_PROVIDER === "noop"
      ? "noop"
      : undefined
  const telemetryProvider = explicitTelemetryProvider || (hasPosthogConfig ? "posthog" : "noop")
  const telemetryEnabled = telemetryProvider === "posthog" && (buildFlavor === "release" || telemetryLocalTest)

  const buildDefines = {
    __BUILD_FLAVOR__: JSON.stringify(buildFlavor),
    __RELEASE_CHANNEL__: JSON.stringify(releaseChannel),
    __TELEMETRY_PROVIDER__: JSON.stringify(telemetryProvider),
    __TELEMETRY_ENABLED__: JSON.stringify(telemetryEnabled),
    __TELEMETRY_LOCAL_TEST__: JSON.stringify(telemetryLocalTest),
    __TEST_MODE__: JSON.stringify(testMode),
  }

  return {
    main: {
      define: {
        ...buildDefines,
        __POSTHOG_HOST__: JSON.stringify(posthogHost),
        __POSTHOG_KEY__: JSON.stringify(posthogKey),
      },
      resolve: {
        alias: [
          { find: "@c8c/workflow-runner/node", replacement: resolve(__dirname, "packages/workflow-runner/src/node/index.ts") },
          { find: "@c8c/workflow-runner", replacement: resolve(__dirname, "packages/workflow-runner/src/index.ts") },
          { find: "@shared", replacement: resolve(__dirname, "src/shared") },
        ],
      },
      plugins: [
        externalizeDepsPlugin({
          exclude: ["@c8c/workflow-runner", "@claude-tools/runner", "yaml"],
        }),
      ],
      build: {
        lib: {
          entry: resolve(__dirname, "src/main/index.ts"),
        },
        rollupOptions: {
          external: ["electron"],
          output: {
            format: "cjs",
          },
        },
      },
    },
    preload: {
      define: {
        ...buildDefines,
        __POSTHOG_HOST__: JSON.stringify(""),
        __POSTHOG_KEY__: JSON.stringify(""),
      },
      plugins: [externalizeDepsPlugin()],
      build: {
        lib: {
          entry: resolve(__dirname, "src/preload/index.ts"),
        },
        rollupOptions: {
          external: ["electron"],
          output: {
            format: "cjs",
          },
        },
      },
    },
    renderer: {
      define: {
        ...buildDefines,
        __POSTHOG_HOST__: JSON.stringify(""),
        __POSTHOG_KEY__: JSON.stringify(""),
      },
      plugins: [react()],
      resolve: {
        alias: [
          { find: "@c8c/workflow-runner/node", replacement: resolve(__dirname, "packages/workflow-runner/src/node/index.ts") },
          { find: "@c8c/workflow-runner/schema", replacement: resolve(__dirname, "packages/workflow-runner/src/schema.ts") },
          { find: "@c8c/workflow-runner", replacement: resolve(__dirname, "packages/workflow-runner/src/index.ts") },
          { find: "@shared", replacement: resolve(__dirname, "src/shared") },
          { find: "@", replacement: resolve(__dirname, "src/renderer") },
        ],
      },
      build: {
        rollupOptions: {
          input: {
            index: resolve(__dirname, "src/renderer/index.html"),
          },
        },
      },
      css: {
        postcss: {
          plugins: [tailwindcss, autoprefixer],
        },
      },
    },
  }
})
