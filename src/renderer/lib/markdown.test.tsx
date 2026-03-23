import type { ComponentProps } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ReactMarkdown from "react-markdown"
import { describe, expect, it } from "vitest"
import { DEFAULT_MARKDOWN_PROPS, sanitizeMarkdownHref } from "./markdown"

function renderMarkdown(markdown: string) {
  const props = DEFAULT_MARKDOWN_PROPS as ComponentProps<typeof ReactMarkdown>
  return renderToStaticMarkup(
    <ReactMarkdown {...props}>{markdown}</ReactMarkdown>,
  )
}

describe("sanitizeMarkdownHref", () => {
  it("allows safe external and relative links", () => {
    expect(sanitizeMarkdownHref("https://example.com/docs")).toBe(
      "https://example.com/docs",
    )
    expect(
      sanitizeMarkdownHref("/Users/vlad/Code/projects/chain-runner/README.md"),
    ).toBe("/Users/vlad/Code/projects/chain-runner/README.md")
    expect(sanitizeMarkdownHref("./references/guide.md")).toBe(
      "./references/guide.md",
    )
  })

  it("blocks dangerous protocols and malformed links", () => {
    expect(sanitizeMarkdownHref(" javascript:alert(1) ")).toBeNull()
    expect(
      sanitizeMarkdownHref("data:text/html,<script>alert(1)</script>"),
    ).toBeNull()
    expect(sanitizeMarkdownHref("//evil.example.com")).toBeNull()
  })
})

describe("renderer markdown sanitization", () => {
  it("does not render inline html as live DOM nodes", () => {
    const html = renderMarkdown("<script>alert(1)</script><div>unsafe</div>")

    expect(html).not.toContain("<script")
    expect(html).not.toContain("<div>unsafe</div>")
    expect(html === "" || html.includes("alert(1)")).toBe(true)
  })

  it("removes javascript hrefs from rendered links", () => {
    const html = renderMarkdown("[open me](javascript:alert(1))")

    expect(html).toContain(">open me</a>")
    expect(html).not.toContain("javascript:alert(1)")
    expect(html).not.toContain("href=")
  })

  it("keeps malformed code-fence payloads inert while preserving highlighting markup", () => {
    const html = renderMarkdown(
      "```html\n</code><script>alert(1)</script>\n```",
    )

    expect(html).not.toContain("<script>alert(1)</script>")
    expect(html).toContain("hljs")
    expect(html).toContain("alert(1)")
    expect(html).toContain("&lt;")
  })
})
