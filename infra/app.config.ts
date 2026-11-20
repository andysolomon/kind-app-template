/**
 * Everything that changes when this template becomes a new app.
 * `pnpm init:app -- --name <name> --host-port <port>` rewrites the literals.
 *
 * Single-writer (in-memory rooms, one SQLite file): `replicas: 1` and
 * `strategy: "Recreate"`, so the old pod is gone before the new one starts.
 * Stateless: raise `replicas` and set `strategy: "RollingUpdate"`.
 *
 * `publish`:
 *   "none"  — loopback only, http://127.0.0.1:<hostPort>
 *   "quick" — Cloudflare quick tunnel (new hostname whenever the tunnel pod starts)
 *   "named" — `cloudflared tunnel run` with CLOUDFLARE_TUNNEL_TOKEN from .env
 */

export type PublishMode = 'none' | 'quick' | 'named'
export type RolloutStrategy = 'Recreate' | 'RollingUpdate'

export interface AppConfig {
  readonly name: string
  readonly stackName: string
  readonly appPort: number
  readonly nodePort: number
  readonly hostPort: number
  readonly registryPort: number
  readonly replicas: number
  readonly strategy: RolloutStrategy
  readonly publish: PublishMode
  readonly env: Readonly<Record<string, string>>
  readonly secretKeys: readonly string[]
  readonly resources: {
    readonly requests: { readonly cpu: string; readonly memory: string }
    readonly limits: { readonly memory: string }
  }
}

export const appConfig = {
  name: 'kind-app',
  stackName: 'KindApp',
  appPort: 3000,
  nodePort: 30200,
  hostPort: 4200,
  registryPort: 5020,
  replicas: 1,
  strategy: 'Recreate',
  publish: 'none',
  env: {
    APP_NAME: 'kind-app',
    APP_VERSION: '0.1.0',
  },
  secretKeys: [] as readonly string[],
  resources: {
    requests: { cpu: '50m', memory: '64Mi' },
    limits: { memory: '256Mi' },
  },
} satisfies AppConfig

const dnsLabel = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/
const envKey = /^[A-Z][A-Z0-9_]*$/

if (!dnsLabel.test(appConfig.name) || appConfig.name.length > 40) {
  throw new Error(`app name must be a DNS label of at most 40 characters, got ${appConfig.name}`)
}
for (const [label, port] of [
  ['appPort', appConfig.appPort],
  ['hostPort', appConfig.hostPort],
  ['registryPort', appConfig.registryPort],
] as const) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${label} is out of range: ${port}`)
  }
}
if (!Number.isInteger(appConfig.nodePort) || appConfig.nodePort < 30000 || appConfig.nodePort > 32767) {
  throw new Error(`nodePort must be 30000-32767, got ${appConfig.nodePort}`)
}
if (appConfig.replicas < 1) throw new Error('replicas must be at least 1')
if (new Set(appConfig.secretKeys).size !== appConfig.secretKeys.length) {
  throw new Error('secretKeys contains a duplicate')
}
for (const key of appConfig.secretKeys) {
  if (!envKey.test(key)) throw new Error(`secret key is not an env var name: ${key}`)
}
