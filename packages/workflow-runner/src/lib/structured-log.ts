type LogLevel = "info" | "warn" | "error"

type LogContext = Record<string, unknown>

function safeSerialize(payload: Record<string, unknown>): string {
  try {
    return JSON.stringify(payload)
  } catch {
    return JSON.stringify({
      ts: new Date().toISOString(),
      level: payload.level,
      component: payload.component,
      event: payload.event,
      message: "failed to serialize log payload",
    })
  }
}

function emit(
  level: LogLevel,
  component: string,
  event: string,
  context?: LogContext,
): void {
  const payload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    component,
    event,
    ...(context || {}),
  }
  const line = safeSerialize(payload)
  if (level === "error") {
    console.error(line)
    return
  }
  if (level === "warn") {
    console.warn(line)
    return
  }
  console.log(line)
}

export function logInfo(
  component: string,
  event: string,
  context?: LogContext,
): void {
  emit("info", component, event, context)
}

export function logWarn(
  component: string,
  event: string,
  context?: LogContext,
): void {
  emit("warn", component, event, context)
}

export function logError(
  component: string,
  event: string,
  context?: LogContext,
): void {
  emit("error", component, event, context)
}
