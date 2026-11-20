import assert from 'node:assert/strict'
import { createServer as createNodeServer, type Server } from 'node:http'
import net from 'node:net'
import { once } from 'node:events'
import { describe, it } from 'node:test'
import { createShutdown, drainServer } from '../src/shutdown.ts'
import type { RuntimeHealth } from '../src/status.ts'

describe('drainServer', () => {
  it('lets an in-flight request finish', async () => {
    let release = (): void => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let accepted = false
    const server = createNodeServer((_request, response) => {
      accepted = true
      void held.then(() => {
        response.writeHead(200, { 'content-type': 'text/plain' })
        response.end('ok')
      })
    })
    const port = await listen(server)
    const pending = fetch(`http://127.0.0.1:${port}/`)
    while (!accepted) await delay(5)

    const draining = drainServer(server, 1_000)
    release()
    const [result, response] = await Promise.all([draining, pending])
    assert.equal(response.status, 200)
    assert.equal(await response.text(), 'ok')
    assert.equal(result, 'drained')
    await assert.rejects(fetch(`http://127.0.0.1:${port}/`))
  })

  it('drops a connection that never finishes once the drain elapses', async () => {
    const server = createNodeServer(() => {
      // The handler never responds. The drain has to give up.
    })
    const port = await listen(server)
    const socket = net.connect(port, '127.0.0.1')
    socket.on('error', () => undefined)
    await once(socket, 'connect')
    socket.write('GET / HTTP/1.1\r\nHost: local\r\n\r\n')
    const started = Date.now()
    const result = await drainServer(server, 200)
    assert.equal(result, 'forced')
    assert.ok(Date.now() - started >= 180)
    socket.destroy()
  })
})

describe('createShutdown', () => {
  it('flips readiness, drains once, and exits once', async () => {
    const server = createNodeServer((_request, response) => {
      response.writeHead(204)
      response.end()
    })
    await listen(server)
    const health: RuntimeHealth = { ready: true }
    const exits: number[] = []
    const logs: string[] = []
    const shutdown = createShutdown({
      server,
      health,
      drainMs: 1_000,
      log: (message) => logs.push(message),
      exit: (code) => exits.push(code),
    })

    shutdown.stop('SIGTERM')
    shutdown.stop('SIGINT')
    await once(server, 'close')
    await new Promise((resolve) => setTimeout(resolve, 20))

    assert.equal(health.ready, false)
    assert.deepEqual(exits, [0])
    assert.deepEqual(logs, ['SIGTERM, draining', 'drained'])
  })
})

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('expected a TCP port')
      resolve(address.port)
    })
  })
}
