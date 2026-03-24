import { execFileSync } from "node:child_process"

const SECRET_PATTERNS = [
  {
    name: "private key",
    test: (line) => /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(line),
  },
  {
    name: "credential assignment",
    test: (line) => {
      const match = line.match(
        /\b(?:api[_-]?key|secret|token|password|private[_-]?key|access[_-]?key)\b\s*[:=]\s*(.+)$/i,
      )
      if (!match) return false
      const value = match[1].trim().replace(/^['"]|['"]$/g, "")
      if (value.startsWith("(") || value.includes("=>")) return false
      if (
        /^(?:process|import)\.env\b/i.test(value) ||
        /^Promise</.test(value)
      ) {
        return false
      }
      if (value.length < 12) return false
      if (
        /^(?:example|placeholder|changeme|your[_-]?value|your[_-]?key|replace[_-]?me|<.+>|x+|\*+)$/i.test(
          value,
        )
      ) {
        return false
      }
      return true
    },
  },
  {
    name: "known token prefix",
    test: (line) =>
      /\b(?:phc_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b/.test(
        line,
      ),
  },
]

function getStagedFiles() {
  const output = execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACM", "-z", "--"],
    { encoding: "utf8" },
  )
  return output
    .split("\u0000")
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function getStagedFileContent(filePath) {
  return execFileSync("git", ["show", `:${filePath}`], { encoding: "utf8" })
}

const findings = []

for (const filePath of getStagedFiles()) {
  if (filePath === ".env.example") continue
  let content = ""
  try {
    content = getStagedFileContent(filePath)
  } catch {
    continue
  }

  const lines = content.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line || line.trim().startsWith("#")) continue
    const matchedPattern = SECRET_PATTERNS.find((pattern) => pattern.test(line))
    if (!matchedPattern) continue
    findings.push({
      filePath,
      lineNumber: index + 1,
      pattern: matchedPattern.name,
    })
  }
}

if (findings.length > 0) {
  console.error("Potential secrets detected in staged changes:")
  for (const finding of findings) {
    console.error(
      `- ${finding.filePath}:${finding.lineNumber} (${finding.pattern})`,
    )
  }
  process.exit(1)
}
