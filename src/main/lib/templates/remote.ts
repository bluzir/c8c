import { net } from "electron"
import type { WorkflowTemplate } from "@shared/types"
import { parseTemplate } from "./parse"

const HUB_BASE_URL = "https://c8c.app/hub/"
const MAX_BODY_SIZE = 512 * 1024 // 512 KB
const FETCH_TIMEOUT_MS = 10_000

async function fetchTemplateFromUrl(
  url: string,
  notFoundMessage: string,
): Promise<WorkflowTemplate> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let response: Response
  try {
    response = await net.fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(notFoundMessage)
    }
    throw new Error(`Network error (${response.status})`)
  }

  const contentLength = response.headers.get("content-length")
  if (contentLength && Number(contentLength) > MAX_BODY_SIZE) {
    throw new Error("Library flow file is too large")
  }

  const body = await response.text()
  if (body.length > MAX_BODY_SIZE) {
    throw new Error("Library flow file is too large")
  }

  try {
    return parseTemplate(body)
  } catch {
    throw new Error("Invalid library flow format")
  }
}

export async function fetchRemoteTemplate(
  templateId: string,
): Promise<WorkflowTemplate> {
  return fetchTemplateFromUrl(
    `${HUB_BASE_URL}${templateId}.yaml`,
    "Library flow not found on hub",
  )
}

export async function fetchRemoteTemplateByUrl(
  url: string,
): Promise<WorkflowTemplate> {
  return fetchTemplateFromUrl(url, "Library flow not found")
}
