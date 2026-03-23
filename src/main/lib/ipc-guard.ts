type IpcHandler = (event: any, ...args: any[]) => any

function parseAllowedRendererOrigin(
  rendererUrl: string | undefined,
): string | null {
  if (!rendererUrl) return null
  try {
    const url = new URL(rendererUrl)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url.origin
  } catch {
    return null
  }
}

export function isTrustedRendererFrame(event: {
  senderFrame?: { url?: string; routingId?: number } | null
  sender?: {
    getURL?: () => string
    mainFrame?: { routingId?: number } | null
  } | null
}): boolean {
  const senderFrame = event.senderFrame
  const sender = event.sender
  if (!senderFrame?.url || !sender?.getURL) {
    return false
  }

  const senderUrl = sender.getURL()
  if (!senderUrl || senderFrame.url !== senderUrl) {
    return false
  }

  const mainFrameRoutingId = sender.mainFrame?.routingId
  if (
    typeof mainFrameRoutingId === "number" &&
    typeof senderFrame.routingId === "number" &&
    senderFrame.routingId !== mainFrameRoutingId
  ) {
    return false
  }

  try {
    const frameUrl = new URL(senderFrame.url)
    if (frameUrl.protocol === "file:") {
      return frameUrl.pathname.toLowerCase().endsWith("/index.html")
    }

    const allowedOrigin = parseAllowedRendererOrigin(
      process.env.ELECTRON_RENDERER_URL,
    )
    return Boolean(allowedOrigin) && frameUrl.origin === allowedOrigin
  } catch {
    return false
  }
}

export function guardIpcInvokeHandler(
  channel: string,
  handler: IpcHandler,
): IpcHandler {
  return async (event, ...args) => {
    if (!isTrustedRendererFrame(event)) {
      throw new Error(
        `Blocked IPC call from unexpected renderer frame: ${channel}`,
      )
    }
    return handler(event, ...args)
  }
}

export function withGuardedIpcRegistration(
  ipcMainLike: { handle: (channel: string, handler: IpcHandler) => void },
  register: () => void,
): void {
  const originalHandle = ipcMainLike.handle.bind(ipcMainLike)
  ipcMainLike.handle = ((channel: string, handler: IpcHandler) => {
    originalHandle(channel, guardIpcInvokeHandler(channel, handler))
  }) as typeof ipcMainLike.handle

  try {
    register()
  } finally {
    ipcMainLike.handle = originalHandle
  }
}
