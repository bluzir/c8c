import { open, rename, unlink } from "node:fs/promises"
import { basename, dirname, join } from "node:path"

function makeTempFilePath(filePath: string): string {
  return join(
    dirname(filePath),
    `.${basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
  )
}

export async function writeFileAtomic(
  filePath: string,
  content: string,
  options?: { mode?: number },
): Promise<void> {
  const tempFilePath = makeTempFilePath(filePath)
  try {
    const handle = await open(tempFilePath, "w", options?.mode)
    try {
      await handle.writeFile(content, { encoding: "utf-8" })
      await handle.datasync()
    } finally {
      await handle.close()
    }
    await rename(tempFilePath, filePath)
  } finally {
    await unlink(tempFilePath).catch(() => undefined)
  }
}
