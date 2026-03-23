import type { ComponentProps } from "react"
import ReactMarkdown, {
  type Components as MarkdownComponents,
} from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import rehypeSanitize, { defaultSchema } from "rehype-sanitize"
import remarkGfm from "remark-gfm"

const MARKDOWN_PROTOCOL_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/u
const MARKDOWN_CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/u

const MARKDOWN_SANITIZE_SCHEMA = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [
      ...(defaultSchema.attributes?.code || []),
      ["className", "hljs", /^language-/u],
    ],
    span: [
      ...(defaultSchema.attributes?.span || []),
      ["className", /^hljs(?:-[\w-]+)*$/u],
    ],
  },
}

export function sanitizeMarkdownHref(href: string | undefined): string | null {
  if (typeof href !== "string") return null

  const trimmedHref = href.trim()
  if (!trimmedHref || MARKDOWN_CONTROL_CHARACTER_PATTERN.test(trimmedHref)) {
    return null
  }

  if (trimmedHref.startsWith("//")) {
    return null
  }

  if (MARKDOWN_PROTOCOL_PATTERN.test(trimmedHref)) {
    try {
      const protocol = new URL(trimmedHref).protocol
      return protocol === "http:" ||
        protocol === "https:" ||
        protocol === "mailto:" ||
        protocol === "tel:"
        ? trimmedHref
        : null
    } catch {
      return null
    }
  }

  return trimmedHref
}

export const MARKDOWN_COMPONENTS: MarkdownComponents = {
  a: ({ href, children, ...props }) => {
    const safeHref = sanitizeMarkdownHref(href)

    return (
      <a
        {...props}
        {...(safeHref ? { href: safeHref } : {})}
        target="_blank"
        rel="noreferrer noopener"
        onClick={(event) => {
          if (!safeHref) {
            event.preventDefault()
          }
        }}
      >
        {children}
      </a>
    )
  },
}

export const MARKDOWN_REMARK_PLUGINS = [remarkGfm]

export const MARKDOWN_REHYPE_PLUGINS = [
  rehypeHighlight,
  [rehypeSanitize, MARKDOWN_SANITIZE_SCHEMA],
] as const

/** Mutable copy for ReactMarkdown prop compatibility */
const MARKDOWN_REHYPE_PLUGINS_MUTABLE = [
  ...MARKDOWN_REHYPE_PLUGINS,
] as unknown as ComponentProps<typeof ReactMarkdown>["rehypePlugins"]

export const DEFAULT_MARKDOWN_PROPS = {
  remarkPlugins: MARKDOWN_REMARK_PLUGINS,
  rehypePlugins: MARKDOWN_REHYPE_PLUGINS_MUTABLE,
  components: MARKDOWN_COMPONENTS,
} satisfies Pick<
  ComponentProps<typeof ReactMarkdown>,
  "components" | "rehypePlugins" | "remarkPlugins"
>
