import type { WorkflowInput } from "@shared/types"

const URL_PATTERN = /^https?:\/\/\S+$/i
const DIRECTORY_PATTERN = /^(~\/|\/|\.\/|\.\.\/|[A-Za-z]:\\)/

function isDirectoryCandidate(value: string): boolean {
  return !value.includes("\n") && DIRECTORY_PATTERN.test(value)
}

export function detectWorkflowInputType(value: string): WorkflowInput["type"] {
  const trimmed = value.trim()

  if (URL_PATTERN.test(trimmed)) {
    return "url"
  }

  if (isDirectoryCandidate(trimmed)) {
    return "directory"
  }

  return "text"
}

export function validateInput(
  type: WorkflowInput["type"],
  value: string,
): { valid: boolean; message?: string } {
  const trimmed = value.trim()
  if (!trimmed) {
    return { valid: false, message: "Input is required" }
  }

  if (type === "url" && !URL_PATTERN.test(trimmed)) {
    return { valid: false, message: "Expected a valid URL (http/https)" }
  }

  if (type === "directory" && !isDirectoryCandidate(trimmed)) {
    return { valid: false, message: "Expected a directory path" }
  }

  return { valid: true }
}

export interface InputValidationConfig {
  inputType?: "auto" | WorkflowInput["type"]
  required?: boolean
  defaultValue?: string
}

export interface ResolvedWorkflowInput {
  type: WorkflowInput["type"]
  value: string
  usedDefault: boolean
  valid: boolean
  message?: string
}

export function resolveWorkflowInput(
  rawValue: string,
  config: InputValidationConfig = {},
): ResolvedWorkflowInput {
  const userTrimmed = rawValue.trim()
  const defaultValue = config.defaultValue || ""
  const defaultTrimmed = defaultValue.trim()
  const required = config.required ?? true

  const usedDefault = userTrimmed.length === 0 && defaultTrimmed.length > 0
  const resolvedValue = usedDefault ? defaultValue : rawValue
  const resolvedTrimmed = resolvedValue.trim()
  const forcedType =
    config.inputType && config.inputType !== "auto"
      ? config.inputType
      : undefined
  const resolvedType = forcedType || detectWorkflowInputType(resolvedValue)

  if (!resolvedTrimmed) {
    if (!required) {
      return {
        type: forcedType || "text",
        value: resolvedValue,
        usedDefault,
        valid: true,
      }
    }
    return {
      type: resolvedType,
      value: resolvedValue,
      usedDefault,
      valid: false,
      message: "Input is required",
    }
  }

  const baseValidation = validateInput(resolvedType, resolvedValue)
  return {
    type: resolvedType,
    value: resolvedValue,
    usedDefault,
    valid: baseValidation.valid,
    message: baseValidation.message,
  }
}
