import { app, type BrowserWindow } from "electron"
import { resolve } from "path"
import { errorMessage } from "./lib/error-utils"
import {
  fetchRemoteTemplate,
  fetchRemoteTemplateByUrl,
} from "./lib/templates/remote"

const TEMPLATE_ID_RE = /^\/([a-zA-Z0-9_-]+)$/
const TEMPLATE_FILE_RE = /\.ya?ml$/i
const TRUSTED_TEMPLATE_INSTALL_HOSTS = new Set([
  "c8c.app",
  "www.c8c.app",
  "raw.githubusercontent.com",
])

interface ParsedTemplateDeepLink {
  templateId: string
  templateUrl?: string
}

export function configureDeepLinkProtocol(): void {
  if (!app.isPackaged && process.argv[1]) {
    app.setAsDefaultProtocolClient("c8c", process.execPath, [
      resolve(process.argv[1]),
    ])
    return
  }

  app.setAsDefaultProtocolClient("c8c")
}

export function extractDeepLinkUrl(argv: string[]): string | null {
  return argv.find((arg) => arg.startsWith("c8c://")) || null
}

function parseHubDeepLink(parsed: URL): ParsedTemplateDeepLink | null {
  if (parsed.hostname !== "hub") {
    return null
  }

  const match = parsed.pathname.match(TEMPLATE_ID_RE)
  if (!match) {
    return null
  }

  return { templateId: match[1] }
}

function deriveTemplateIdFromUrl(url: URL): string | null {
  const lastSegment = url.pathname.split("/").filter(Boolean).pop()
  if (!lastSegment) {
    return null
  }

  return lastSegment.replace(TEMPLATE_FILE_RE, "") || null
}

function parseInstallDeepLink(parsed: URL): ParsedTemplateDeepLink | null {
  if (parsed.hostname !== "install") {
    return null
  }

  const rawTemplateUrl = parsed.searchParams.get("url")
  if (!rawTemplateUrl) {
    return null
  }

  let templateUrl: URL
  try {
    templateUrl = new URL(rawTemplateUrl)
  } catch {
    return null
  }

  if (
    templateUrl.protocol !== "https:" ||
    !TRUSTED_TEMPLATE_INSTALL_HOSTS.has(templateUrl.hostname.toLowerCase()) ||
    !TEMPLATE_FILE_RE.test(templateUrl.pathname)
  ) {
    return null
  }

  const templateId = deriveTemplateIdFromUrl(templateUrl)
  if (!templateId) {
    return null
  }

  return {
    templateId,
    templateUrl: templateUrl.toString(),
  }
}

export function parseTemplateDeepLink(
  rawUrl: string,
): ParsedTemplateDeepLink | null {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return null
  }

  if (parsed.protocol !== "c8c:") {
    return null
  }

  return parseHubDeepLink(parsed) ?? parseInstallDeepLink(parsed)
}

export async function handleDeepLink(
  rawUrl: string,
  window: BrowserWindow | null,
): Promise<void> {
  const parsed = parseTemplateDeepLink(rawUrl)
  if (!parsed) {
    console.warn("[main] unsupported deep link:", rawUrl)
    return
  }

  if (!window || window.isDestroyed()) {
    console.warn("[main] no window available for deep link")
    return
  }

  try {
    const template = parsed.templateUrl
      ? await fetchRemoteTemplateByUrl(parsed.templateUrl)
      : await fetchRemoteTemplate(parsed.templateId)
    window.webContents.send("template:deep-link", template)
  } catch (error) {
    const message = errorMessage(error)
    window.webContents.send("template:deep-link-error", {
      templateId: parsed.templateId,
      error: message,
    })
  }

  window.show()
  window.focus()
  if (process.platform === "darwin" && app.dock) {
    app.dock.bounce("informational")
  }
}
