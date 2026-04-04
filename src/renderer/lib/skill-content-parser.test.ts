import { describe, expect, it } from "vitest"
import { parseSkillContent } from "./skill-content-parser"

describe("parseSkillContent", () => {
  it("splits frontmatter and body", () => {
    const raw = `---
name: my-skill
model: sonnet
---
# Hello

Body text here.`
    const result = parseSkillContent(raw)
    expect(result.frontmatter).toBe("name: my-skill\nmodel: sonnet")
    expect(result.body).toBe("# Hello\n\nBody text here.")
  })

  it("returns null frontmatter when none present", () => {
    const raw = "# Just markdown\n\nNo frontmatter."
    const result = parseSkillContent(raw)
    expect(result.frontmatter).toBeNull()
    expect(result.body).toBe(raw)
  })

  it("handles empty body after frontmatter", () => {
    const raw = `---
name: empty
---
`
    const result = parseSkillContent(raw)
    expect(result.frontmatter).toBe("name: empty")
    expect(result.body).toBe("")
  })

  it("handles CRLF line endings", () => {
    const raw = "---\r\nname: crlf\r\n---\r\nBody."
    const result = parseSkillContent(raw)
    expect(result.frontmatter).toBe("name: crlf")
    expect(result.body).toBe("Body.")
  })

  it("does not match mid-file triple dashes", () => {
    const raw = "Some text\n---\nnot frontmatter\n---\nmore text"
    const result = parseSkillContent(raw)
    expect(result.frontmatter).toBeNull()
    expect(result.body).toBe(raw)
  })
})
