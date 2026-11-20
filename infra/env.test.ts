import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, it } from 'node:test'
import { loadLocalEnv, parseEnv, stageFromArgv } from './env.ts'

describe('parseEnv', () => {
  it('reads comments, exports, and quotes', () => {
    const parsed = parseEnv(
      ['# comment', '', 'export APP_NAME=kind-app', 'EXAMPLE_TOKEN="keep me"', "QUOTED='x'"].join('\n'),
      '.env',
    )
    assert.equal(parsed.get('APP_NAME'), 'kind-app')
    assert.equal(parsed.get('EXAMPLE_TOKEN'), 'keep me')
    assert.equal(parsed.get('QUOTED'), 'x')
  })

  it('rejects a bad line without echoing the value', () => {
    assert.throws(
      () => parseEnv('EXAMPLE_TOKEN super-secret', '.env'),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.match(error.message, /Invalid \.env line 1/)
        assert.equal(error.message.includes('super-secret'), false)
        return true
      },
    )
  })
})

describe('loadLocalEnv', () => {
  it('lets the repo root override infra/.env, and the shell override both', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'kind-app-env-'))
    const infra = resolve(dir, 'infra')
    mkdirSync(infra)
    writeFileSync(resolve(dir, '.env'), 'FROM_ROOT=root\nFROM_SHELL=file\n')
    writeFileSync(resolve(infra, '.env'), 'FROM_ROOT=infra\nFROM_INFRA=infra\n')
    const previousShell = process.env.FROM_SHELL
    const previousRoot = process.env.FROM_ROOT
    const previousInfra = process.env.FROM_INFRA
    process.env.FROM_SHELL = 'shell'
    delete process.env.FROM_ROOT
    delete process.env.FROM_INFRA
    try {
      loadLocalEnv(infra)
      assert.equal(process.env.FROM_ROOT, 'root')
      assert.equal(process.env.FROM_INFRA, 'infra')
      assert.equal(process.env.FROM_SHELL, 'shell')
    } finally {
      restore('FROM_SHELL', previousShell)
      restore('FROM_ROOT', previousRoot)
      restore('FROM_INFRA', previousInfra)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

describe('stageFromArgv', () => {
  it('reads --stage and otherwise defaults to live', () => {
    assert.equal(stageFromArgv(['node', 'alchemy', '--stage', 'prod']), 'prod')
    assert.equal(stageFromArgv(['node', 'alchemy']), 'live')
  })
})
