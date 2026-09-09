import { createServer } from "node:net"

interface FindAvailablePortOptions {
  maxPort?: number
  maxAttempts?: number
}

function closeServerQuietly(
  server: ReturnType<typeof createServer>,
  onDone: () => void,
) {
  try {
    server.close(() => {
      onDone()
    })
  } catch {
    onDone()
  }
}

function checkPortAvailability(port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const server = createServer()

    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE" || err.code === "EACCES") {
        closeServerQuietly(server, () => {
          resolve(false)
        })
        return
      }

      closeServerQuietly(server, () => {
        reject(err)
      })
    })

    server.once("listening", () => {
      closeServerQuietly(server, () => {
        resolve(true)
      })
    })

    server.listen(port)
  })
}

/**
 * Finds an available port starting from the given port, stops searching when
 * maxPort or maxAttempts is reached
 */
export async function findAvailablePort(
  startPort = 5173,
  options: FindAvailablePortOptions = {},
): Promise<number> {
  const maxPort = options.maxPort ?? 65535
  const maxAttempts = options.maxAttempts ?? maxPort - startPort + 1

  if (startPort < 0 || startPort > 65535) {
    throw new Error(
      `Invalid start port: ${startPort}. Port must be between 0 and 65535.`,
    )
  }

  if (maxPort < startPort || maxPort > 65535) {
    throw new Error(
      `Invalid max port: ${maxPort}. It must be between ${startPort} and 65535.`,
    )
  }

  if (maxAttempts < 1) {
    throw new Error(
      `Invalid maxAttempts: ${maxAttempts}. It must be at least 1.`,
    )
  }

  let attempts = 0
  let port = startPort

  while (port <= maxPort && attempts < maxAttempts) {
    attempts += 1

    const isAvailable = await checkPortAvailability(port)
    if (isAvailable) {
      return port
    }

    port += 1
  }

  throw new Error(
    `Unable to find an available port between ${startPort} and ${maxPort} after ${attempts} attempt(s).`,
  )
}
