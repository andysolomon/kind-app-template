import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { afterEach, describe, it } from 'node:test'
import { loadConfig } from '../src/config.ts'
import { createServer } from '../src/http.ts'
import type { RuntimeHealth } from '../src/status.ts'

const servers: Server[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => close(server)))
})

describe('HTTP', () => {
  it('serves liveness, readiness, and a status document', async () => {
    const health: RuntimeHealth = { ready: true }
    const config = loadConfig({ APP_NAME: 'kind-app', APP_VERSION: '0.1.0' })
    const { port } = await listen(createServer(config, health))

    const live = await fetch(`http://127.0.0.1:${port}/healthz`)
    assert.equal(live.status, 200)
    assert.deepEqual(await live.json(), { ok: true })

    const ready = await fetch(`http://127.0.0.1:${port}/readyz`)
    assert.equal(ready.status, 200)
    assert.deepEqual(await ready.json(), { ok: true })

    const status = await fetch(`http://127.0.0.1:${port}/`, {
      headers: { accept: 'application/json' },
    })
    assert.equal(status.status, 200)
    const body = (await status.json()) as { app: string; version: string; status: string; build: { target: string } }
    assert.equal(body.app, 'kind-app')
    assert.equal(body.version, '0.1.0')
    assert.equal(body.status, 'ready')
    assert.equal(body.build.target, 'node24')

    const page = await fetch(`http://127.0.0.1:${port}/`)
    assert.match(page.headers.get('content-type') ?? '', /text\/html/)
    assert.match(await page.text(), /kind-app/)
  })

  it('reports not ready while draining and escapes the status page', async () => {
    const health: RuntimeHealth = { ready: false }
    const config = loadConfig({ APP_NAME: 'kind<script>', APP_VERSION: '0.1.0' })
    const { port } = await listen(createServer(config, health))

    const ready = await fetch(`http://127.0.0.1:${port}/readyz`)
    assert.equal(ready.status, 503)
    assert.deepEqual(await ready.json(), { ok: false })

    const live = await fetch(`http://127.0.0.1:${port}/healthz`)
    assert.equal(live.status, 200)

    const page = await fetch(`http://127.0.0.1:${port}/`)
    const html = await page.text()
    assert.match(html, /kind&lt;script&gt;/)
    assert.doesNotMatch(html, /<script/i)
    assert.match(html, /Draining/)
  })

  it('rejects unknown paths and methods', async () => {
    const { port } = await listen(createServer(loadConfig({}), { ready: true }))
    const missing = await fetch(`http://127.0.0.1:${port}/missing`)
    assert.equal(missing.status, 404)
    const posted = await fetch(`http://127.0.0.1:${port}/healthz`, { method: 'POST' })
    assert.equal(posted.status, 405)
  })
})

async function listen(server: Server): Promise<{ port: number }> {
  servers.push(server)
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('expected a TCP port')
  return { port: address.port }
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve())
  })
}
