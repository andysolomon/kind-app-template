/** Default stamped by scripts/init-app.mjs. Keep the literal on its own line. */
export const defaultAppName = 'kind-app'
export const defaultAppVersion = '0.1.0'

const DEFAULT_PORT = 3000
const DEFAULT_DRAIN_MS = 10_000

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

export interface Config {
  readonly appName: string
  readonly version: string
  readonly host: string
  readonly port: number
  readonly drainMs: number
}

/**
 * Read the process environment. Empty strings count as unset, which is what
 * an empty Kubernetes env value looks like. Unknown keys are ignored.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const present = new Map<string, string>()
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && value !== '') present.set(key, value)
  }

  return {
    appName: readName(present.get('APP_NAME') ?? defaultAppName),
    version: readVersion(present.get('APP_VERSION') ?? defaultAppVersion),
    host: readHost(present.get('HOST') ?? '0.0.0.0'),
    port: readPort(present.get('PORT') ?? String(DEFAULT_PORT)),
    drainMs: readDrain(present.get('SHUTDOWN_DRAIN_MS') ?? String(DEFAULT_DRAIN_MS)),
  }
}

function readName(value: string): string {
  const name = value.trim()
  if (name.length === 0) throw new ConfigError('APP_NAME is empty')
  return name
}

function readVersion(value: string): string {
  const version = value.trim()
  if (version.length === 0) throw new ConfigError('APP_VERSION is empty')
  return version
}

function readHost(value: string): string {
  const host = value.trim()
  if (host.length === 0) throw new ConfigError('HOST is empty')
  return host
}

function readPort(value: string): number {
  if (!/^[0-9]+$/.test(value)) throw new ConfigError(`PORT must be an integer, got ${value}`)
  const port = Number(value)
  if (port < 1 || port > 65535) throw new ConfigError(`PORT must be between 1 and 65535, got ${port}`)
  return port
}

function readDrain(value: string): number {
  if (!/^[0-9]+$/.test(value)) {
    throw new ConfigError(`SHUTDOWN_DRAIN_MS must be an integer, got ${value}`)
  }
  const drainMs = Number(value)
  if (drainMs > 120_000) {
    throw new ConfigError(`SHUTDOWN_DRAIN_MS must be at most 120000, got ${drainMs}`)
  }
  return drainMs
}
