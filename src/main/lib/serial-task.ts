const serialQueues = new Map<string, Promise<void>>()

export async function runSerialTask<T>(
  key: string,
  task: () => Promise<T>,
): Promise<T> {
  const previous = serialQueues.get(key) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  const queued = previous.then(() => current)

  serialQueues.set(key, queued)

  await previous
  try {
    return await task()
  } finally {
    release()
    if (serialQueues.get(key) === queued) {
      serialQueues.delete(key)
    }
  }
}

export function __resetSerialTaskQueuesForTests(): void {
  serialQueues.clear()
}

export function __getSerialTaskQueueSizeForTests(): number {
  return serialQueues.size
}
