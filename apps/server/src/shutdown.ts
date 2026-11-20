import type { Server } from 'node:http'
import type { RuntimeHealth } from './status.ts'

export type DrainResult = 'drained' | 'forced'

/**
 * Stop accepting connections and wait for the ones already inside a handler.
 * Idle keep-alives are closed immediately so they cannot hold the pod open.
 * Anything still running when `drainMs` elapses is dropped.
 */
export function drainServer(server: Server, drainMs: number): Promise<DrainResult> {
  server.closeIdleConnections()
  return new Promise((resolve) => {
    let settled = false
    const finish = (result: DrainResult): void => {
      if (settled) return
      settled = true
      clearInterval(idleSweep)
      clearTimeout(timer)
      resolve(result)
    }
    // A request that finishes after close() leaves a keep-alive socket.
    // Those are idle, and they would hold the process until the deadline.
    const idleSweep = setInterval(() => server.closeIdleConnections(), 20)
    idleSweep.unref()
    const timer = setTimeout(() => {
      finish('forced')
      server.closeAllConnections()
    }, drainMs)
    timer.unref()
    server.close(() => finish('drained'))
  })
}

export interface ShutdownController {
  /** Idempotent. A second signal does not start a second drain. */
  stop: (signal: string) => void
}

/**
 * Mark the process not-ready, drain the HTTP server, then exit. Readiness
 * flips first so `/readyz` fails while in-flight requests still finish.
 */
export function createShutdown(options: {
  readonly server: Server
  readonly health: RuntimeHealth
  readonly drainMs: number
  readonly log?: (message: string) => void
  readonly exit?: (code: number) => void
}): ShutdownController {
  const log = options.log ?? (() => undefined)
  const exit = options.exit ?? ((code: number) => process.exit(code))
  let stopping = false

  return {
    stop(signal: string): void {
      if (stopping) return
      stopping = true
      options.health.ready = false
      log(`${signal}, draining`)
      void drainServer(options.server, options.drainMs).then((result) => {
        log(result)
        exit(0)
      })
    },
  }
}
