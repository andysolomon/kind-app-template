import { loadConfig } from './config.ts'
import { createServer } from './http.ts'
import { createShutdown } from './shutdown.ts'
import type { RuntimeHealth } from './status.ts'

const config = loadConfig()
const health: RuntimeHealth = { ready: true }
const server = createServer(config, health)
const shutdown = createShutdown({
  server,
  health,
  drainMs: config.drainMs,
  log: (message) => console.log(`[${config.appName}] ${message}`),
})

server.listen(config.port, config.host, () => {
  console.log(`[${config.appName}] listening on ${config.host}:${config.port}`)
})

process.on('SIGTERM', () => shutdown.stop('SIGTERM'))
process.on('SIGINT', () => shutdown.stop('SIGINT'))
