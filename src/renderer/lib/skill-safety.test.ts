import { describe, expect, it } from "vitest"
import { analyzeSkillSafety, type SkillSafetyWarning } from "./skill-safety"

describe("analyzeSkillSafety", () => {
  // ── Danger: destructive commands ──────────────────────

  it("flags rm -rf as danger", () => {
    const warnings = analyzeSkillSafety("Run `rm -rf /tmp/build` to clean up.")
    expect(warnings).toContainEqual<SkillSafetyWarning>({
      severity: "danger",
      message: "This skill contains destructive file removal commands",
    })
  })

  it("flags rm -r without f as danger", () => {
    const warnings = analyzeSkillSafety("Then rm -r old_dir to tidy up.")
    expect(warnings).toContainEqual<SkillSafetyWarning>({
      severity: "danger",
      message: "This skill contains destructive file removal commands",
    })
  })

  it("flags rm -fr as danger", () => {
    const warnings = analyzeSkillSafety("rm -fr dist/")
    expect(warnings).toContainEqual<SkillSafetyWarning>({
      severity: "danger",
      message: "This skill contains destructive file removal commands",
    })
  })

  it("flags DROP TABLE as danger", () => {
    const warnings = analyzeSkillSafety("Execute: DROP TABLE users;")
    expect(warnings).toContainEqual<SkillSafetyWarning>({
      severity: "danger",
      message: "This skill contains destructive database commands",
    })
  })

  it("flags DELETE FROM as danger", () => {
    const warnings = analyzeSkillSafety(
      "DELETE FROM sessions WHERE expired = true",
    )
    expect(warnings).toContainEqual<SkillSafetyWarning>({
      severity: "danger",
      message: "This skill contains destructive database commands",
    })
  })

  it("does not duplicate the same destructive message for multiple matches", () => {
    const warnings = analyzeSkillSafety("rm -rf build && rm -rf dist")
    const destructive = warnings.filter(
      (w) =>
        w.message === "This skill contains destructive file removal commands",
    )
    expect(destructive).toHaveLength(1)
  })

  // ── Danger: outbound data ─────────────────────────────

  it("flags curl as outbound danger", () => {
    const warnings = analyzeSkillSafety(
      "Use curl to post results to the server.",
    )
    expect(warnings).toContainEqual<SkillSafetyWarning>({
      severity: "danger",
      message: "This skill may send data to external servers",
    })
  })

  it("flags wget as outbound danger", () => {
    const warnings = analyzeSkillSafety(
      "Download via wget https://example.com/data.tar",
    )
    expect(warnings).toContainEqual<SkillSafetyWarning>({
      severity: "danger",
      message: "This skill may send data to external servers",
    })
  })

  it("flags fetch() calls as outbound danger", () => {
    const warnings = analyzeSkillSafety(
      "Call fetch( 'https://api.example.com/upload')",
    )
    expect(warnings).toContainEqual<SkillSafetyWarning>({
      severity: "danger",
      message: "This skill may send data to external servers",
    })
  })

  it("flags https URLs as outbound danger", () => {
    const warnings = analyzeSkillSafety(
      "Post the report to https://webhook.site/abc123",
    )
    expect(warnings).toContainEqual<SkillSafetyWarning>({
      severity: "danger",
      message: "This skill may send data to external servers",
    })
  })

  it("flags http URLs as outbound danger", () => {
    const warnings = analyzeSkillSafety("Send to http://internal.dev/ingest")
    expect(warnings).toContainEqual<SkillSafetyWarning>({
      severity: "danger",
      message: "This skill may send data to external servers",
    })
  })

  // ── Warning: shell execution tools ────────────────────

  it("warns when Bash tool is allowed", () => {
    const warnings = analyzeSkillSafety("Run lint checks.", ["Bash", "Read"])
    expect(warnings).toContainEqual<SkillSafetyWarning>({
      severity: "warning",
      message: "This skill can execute arbitrary shell commands",
    })
  })

  it("warns when Execute tool is allowed", () => {
    const warnings = analyzeSkillSafety("Build the project.", ["Execute"])
    expect(warnings).toContainEqual<SkillSafetyWarning>({
      severity: "warning",
      message: "This skill can execute arbitrary shell commands",
    })
  })

  // ── Warning: outside-project paths ────────────────────

  it("warns on home directory references", () => {
    const warnings = analyzeSkillSafety("Read config from ~/.ssh/config")
    expect(warnings).toContainEqual<SkillSafetyWarning>({
      severity: "warning",
      message: "This skill may access files outside your project",
    })
  })

  it("warns on /etc/ references", () => {
    const warnings = analyzeSkillSafety("Check /etc/hosts for custom entries.")
    expect(warnings).toContainEqual<SkillSafetyWarning>({
      severity: "warning",
      message: "This skill may access files outside your project",
    })
  })

  it("warns on /usr/ references", () => {
    const warnings = analyzeSkillSafety(
      "Look in /usr/local/bin for the binary.",
    )
    expect(warnings).toContainEqual<SkillSafetyWarning>({
      severity: "warning",
      message: "This skill may access files outside your project",
    })
  })

  it("warns on $HOME references", () => {
    const warnings = analyzeSkillSafety("Check $HOME/.config/app for settings.")
    expect(warnings).toContainEqual<SkillSafetyWarning>({
      severity: "warning",
      message: "This skill may access files outside your project",
    })
  })

  // ── Info: file mutation tools ─────────────────────────

  it("informs when Write tool is allowed", () => {
    const warnings = analyzeSkillSafety("Generate a report file.", ["Write"])
    expect(warnings).toContainEqual<SkillSafetyWarning>({
      severity: "info",
      message: "This skill can modify files in your project",
    })
  })

  it("informs when Edit tool is allowed", () => {
    const warnings = analyzeSkillSafety("Refactor the module.", [
      "Read",
      "Edit",
    ])
    expect(warnings).toContainEqual<SkillSafetyWarning>({
      severity: "info",
      message: "This skill can modify files in your project",
    })
  })

  // ── Clean content ─────────────────────────────────────

  it("returns empty array for safe content with no tools", () => {
    const warnings = analyzeSkillSafety("Summarize the README file.", [])
    expect(warnings).toHaveLength(0)
  })

  it("returns empty array when allowedTools is undefined", () => {
    const warnings = analyzeSkillSafety("Summarize the README file.")
    expect(warnings).toHaveLength(0)
  })

  // ── Ordering ──────────────────────────────────────────

  it("orders warnings by severity: danger → warning → info", () => {
    const warnings = analyzeSkillSafety(
      "rm -rf dist && curl https://evil.com && read ~/.bashrc",
      ["Bash", "Write"],
    )
    const severities = warnings.map((w) => w.severity)
    const dangerIdx = severities.indexOf("danger")
    const warningIdx = severities.indexOf("warning")
    const infoIdx = severities.indexOf("info")

    // danger before warning before info
    expect(dangerIdx).toBeLessThan(warningIdx)
    expect(warningIdx).toBeLessThan(infoIdx)
  })

  // ── Mixed scenarios ───────────────────────────────────

  it("detects multiple categories simultaneously", () => {
    const content = [
      "rm -rf /tmp/old",
      "curl https://api.example.com/notify",
      "Check ~/Documents for reference files.",
    ].join("\n")
    const warnings = analyzeSkillSafety(content, ["Bash", "Edit"])

    const severities = new Set(warnings.map((w) => w.severity))
    expect(severities).toContain("danger")
    expect(severities).toContain("warning")
    expect(severities).toContain("info")
    expect(warnings.length).toBeGreaterThanOrEqual(4)
  })
})
