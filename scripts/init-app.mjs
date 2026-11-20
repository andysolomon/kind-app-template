#!/usr/bin/env node
// Stamp a new app name and ports into this checkout.
//
//   pnpm init:app -- --name my-app --host-port 4210
//
// nodePort defaults to hostPort + 26000. registryPort defaults to
// hostPort + 820 (4200 -> 5020). Then run `pnpm install` so the lockfile
// matches the renamed packages.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = parseArgs(process.argv.slice(2))
const name = required(args, 'name')
const hostPort = number(required(args, 'host-port'), 'host-port')
const nodePort = args['node-port'] === undefined ? hostPort + 26_000 : number(args['node-port'], 'node-port')
const registryPort =
  args['registry-port'] === undefined ? hostPort + 820 : number(args['registry-port'], 'registry-port')
const tailscalePort =
  args['tailscale-port'] === undefined ? 8443 : number(args['tailscale-port'], 'tailscale-port')

if (!/^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/.test(name) || name.length > 40) {
  fail('name must be a DNS label of at most 40 characters')
}
if (hostPort < 1024 || hostPort > 65535) fail('host-port must be 1024-65535')
if (nodePort < 30000 || nodePort > 32767) fail('node-port must be 30000-32767')
if (registryPort < 1024 || registryPort > 65535) fail('registry-port must be 1024-65535')
if (tailscalePort === 443) fail('tailscale port 443 is reserved for T3 Code')
if (new Set([hostPort, nodePort, registryPort]).size !== 3) fail('host, node, and registry ports must differ')

const configPath = resolve(root, 'infra/app.config.ts')
const config = readFileSync(configPath, 'utf8')
const currentName = match(config, /name: '([^']+)'/, 'app name')
const currentStack = match(config, /stackName: '([^']+)'/, 'stack name')
const currentHost = match(config, /hostPort: (\d+)/, 'hostPort')
const stackName = pascal(name)

const nameFiles = [
  'infra/app.config.ts',
  'infra/cluster.ts',
  'apps/server/src/config.ts',
  'package.json',
  'apps/server/package.json',
  'infra/package.json',
  'Dockerfile',
  'README.md',
  'PORTS.md',
  'scripts/app.env',
]

for (const relative of nameFiles) {
  const path = resolve(root, relative)
  const text = readFileSync(path, 'utf8')
  if (!text.includes(currentName)) continue
  writeFileSync(path, text.replaceAll(currentName, name))
}

let stamped = readFileSync(configPath, 'utf8')
stamped = stamped.replace(`stackName: '${currentStack}'`, `stackName: '${stackName}'`)
stamped = replaceField(stamped, 'hostPort', hostPort)
stamped = replaceField(stamped, 'nodePort', nodePort)
stamped = replaceField(stamped, 'registryPort', registryPort)
writeFileSync(configPath, stamped)

const envPath = resolve(root, 'scripts/app.env')
let env = readFileSync(envPath, 'utf8')
env = env.replace(/^HOST_PORT=\d+$/m, `HOST_PORT=${hostPort}`)
env = env.replace(/^NODE_PORT=\d+$/m, `NODE_PORT=${nodePort}`)
env = env.replace(/^REGISTRY_PORT=\d+$/m, `REGISTRY_PORT=${registryPort}`)
env = env.replace(/^KUBE_CONTEXT=.*$/m, `KUBE_CONTEXT=kind-${name}`)
env = env.replace(/^NAMESPACE=.*$/m, `NAMESPACE=${name}`)
env = env.replace(/^TUNNEL_NAME=.*$/m, `TUNNEL_NAME=${name}-tunnel`)
env = env.replace(/^TAILSCALE_HTTPS_PORT=\d+$/m, `TAILSCALE_HTTPS_PORT=${tailscalePort}`)
writeFileSync(envPath, env)

const readmePath = resolve(root, 'README.md')
writeFileSync(
  readmePath,
  readFileSync(readmePath, 'utf8')
    .replaceAll(`http://127.0.0.1:${currentHost}`, `http://127.0.0.1:${hostPort}`)
    .replace(
      /http:\/\/127\.0\.0\.1:\d+ \(node port \d+, registry \d+\)/g,
      `http://127.0.0.1:${hostPort} (node port ${nodePort}, registry ${registryPort})`,
    ),
)

const portsPath = resolve(root, 'PORTS.md')
writeFileSync(
  portsPath,
  readFileSync(portsPath, 'utf8').replace(
    /\| ([^|]+) \(this template\) \| \d+ \| \d+ \| \d+ \| \d+ \|/,
    `| $1 (this template) | ${hostPort} | ${nodePort} | ${registryPort} | ${tailscalePort} |`,
  ),
)

console.log(`${name}`)
console.log(`  stack     ${stackName}`)
console.log(`  local     http://127.0.0.1:${hostPort}`)
console.log(`  nodePort  ${nodePort}`)
console.log(`  registry  ${registryPort}`)
console.log(`  tailscale ${tailscalePort}`)
console.log('Run pnpm install so the lockfile matches the renamed packages.')

function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const out = {}
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index] ?? ''
    if (!token.startsWith('--')) fail(`unexpected argument ${token}`)
    const key = token.slice(2)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) fail(`missing value for --${key}`)
    out[key] = value
    index += 1
  }
  return out
}

function required(map, key) {
  const value = map[key]
  if (value === undefined) fail(`missing --${key}`)
  return value
}

function number(value, label) {
  if (!/^[0-9]+$/.test(value)) fail(`${label} must be an integer`)
  return Number(value)
}

function match(text, pattern, label) {
  const found = pattern.exec(text)
  if (found?.[1] === undefined) fail(`could not find ${label} in infra/app.config.ts`)
  return found[1]
}

function replaceField(text, field, value) {
  const pattern = new RegExp(`(${field}: )\\d+`)
  if (!pattern.test(text)) fail(`could not find ${field}`)
  return text.replace(pattern, `$1${value}`)
}

function pascal(value) {
  const parts = value.split(/[^a-z0-9]+/).filter((part) => part.length > 0)
  const words = parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  return words.join('') || 'App'
}

function fail(message) {
  console.error(`init-app: ${message}`)
  process.exit(1)
}
