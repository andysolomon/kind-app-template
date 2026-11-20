import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Load dotenv files into `process.env` without printing values.
 *
 * Commands run with cwd `infra/`. The repo-root `.env` wins over `infra/.env`,
 * and anything already exported in the shell wins over both. The `prod` stage
 * does not call this: hosted secrets belong in External Secrets, not a laptop file.
 */
export function loadLocalEnv(cwd = process.cwd()): void {
  const shellKeys = new Set(Object.keys(process.env))
  // infra/.env first, then the repo root, which overrides it. Keys already
  // exported in the shell are left alone.
  applyFile(resolve(cwd, '.env'), shellKeys)
  applyFile(resolve(cwd, '../.env'), shellKeys)
}

export function parseEnv(text: string, file: string): ReadonlyMap<string, string> {
  const entries = new Map<string, string>()
  const lines = text.split(/\r?\n/)
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index] ?? ''
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const body = line.startsWith('export ') ? line.slice('export '.length).trim() : line
    const eq = body.indexOf('=')
    if (eq <= 0) throw new Error(`Invalid .env line ${index + 1} in ${file}`)
    const key = body.slice(0, eq).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(`Invalid .env line ${index + 1} in ${file}`)
    }
    let value = body.slice(eq + 1)
    const quoted =
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    if (quoted) value = value.slice(1, -1)
    entries.set(key, value)
  }
  return entries
}

export function stageFromArgv(argv: readonly string[] = process.argv): string {
  const index = argv.indexOf('--stage')
  const next = index === -1 ? undefined : argv[index + 1]
  if (next !== undefined && !next.startsWith('-')) return next
  return process.env.ALCHEMY_STAGE ?? 'live'
}

function applyFile(file: string, shellKeys: ReadonlySet<string>): void {
  if (!existsSync(file)) return
  for (const [key, value] of parseEnv(readFileSync(file, 'utf8'), file)) {
    if (shellKeys.has(key)) continue
    process.env[key] = value
  }
}
