import { describe, expect, it } from "vitest"
import { buildCodexPath, collectAllowedCodexEnv, composeCodexEnv } from "./codex-cli"

describe("main codex-cli env hardening", () => {
  it("allowlists only safe ambient environment keys", () => {
    const env = collectAllowedCodexEnv({
      HOME: "/Users/tester",
      LANG: "en_US.UTF-8",
      TERM: "xterm-256color",
      XDG_CONFIG_HOME: "/Users/tester/.config",
      SSH_AUTH_SOCK: "/tmp/ssh-agent.sock",
      HTTPS_PROXY: "http://proxy.internal:8080",
      PATH: "/usr/local/bin",
      GITHUB_TOKEN: "ghs-secret",
      AWS_SECRET_ACCESS_KEY: "aws-secret",
      NODE_OPTIONS: "--require hacked.js",
      CUSTOM_FLAG: "1",
    })

    expect(env).toEqual({
      HOME: "/Users/tester",
      LANG: "en_US.UTF-8",
      TERM: "xterm-256color",
      XDG_CONFIG_HOME: "/Users/tester/.config",
      SSH_AUTH_SOCK: "/tmp/ssh-agent.sock",
      HTTPS_PROXY: "http://proxy.internal:8080",
    })
    expect(env.PATH).toBeUndefined()
  })

  it("can include PATH explicitly for lookup-only flows", () => {
    const env = collectAllowedCodexEnv({
      HOME: "/Users/tester",
      PATH: "/shell/bin:/usr/bin",
    }, { includePath: true })

    expect(env.HOME).toBe("/Users/tester")
    expect(env.PATH).toBe("/shell/bin:/usr/bin")
  })

  it("composes Codex subprocess env from filtered sources and explicit overrides", () => {
    const env = composeCodexEnv({
      processEnv: {
        HOME: "/Users/tester",
        LANG: "en_US.UTF-8",
        PATH: "/process/bin:/usr/bin",
        GITHUB_TOKEN: "ghs-secret",
      },
      shellEnv: {
        TERM: "xterm-256color",
        PATH: "/shell/bin:/usr/bin",
        AWS_SECRET_ACCESS_KEY: "aws-secret",
      },
      extraEnv: {
        TERM: "dumb",
        CODEX_API_KEY: "explicit-key",
        CODEX_PATH: "/custom/codex",
        NODE_OPTIONS: "--require hacked.js",
      },
      bundledCodexPath: "/bundled/codex",
      codexApiKey: "stored-key",
    })

    expect(env.HOME).toBe("/Users/tester")
    expect(env.LANG).toBe("en_US.UTF-8")
    expect(env.TERM).toBe("dumb")
    expect(env.PATH).toBe(buildCodexPath("/shell/bin:/usr/bin"))
    expect(env.CODEX_API_KEY).toBe("explicit-key")
    expect(env.CODEX_PATH).toBe("/custom/codex")
    expect(env.GITHUB_TOKEN).toBeUndefined()
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined()
    expect(env.NODE_OPTIONS).toBeUndefined()
  })
})
