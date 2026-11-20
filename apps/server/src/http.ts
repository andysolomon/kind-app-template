import { createServer as createNodeServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { Config } from './config.ts'
import { statusHtml, statusReport, type RuntimeHealth } from './status.ts'

export function createServer(config: Config, health: RuntimeHealth): Server {
  return createNodeServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://local')
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendJson(request, response, 405, { error: 'Method not allowed' })
      return
    }

    if (url.pathname === '/healthz') {
      // Liveness is the process answering. No dependencies, so a slow disk or
      // a drain cannot restart the pod in a loop.
      sendJson(request, response, 200, { ok: true })
      return
    }

    if (url.pathname === '/readyz') {
      sendJson(request, response, health.ready ? 200 : 503, { ok: health.ready })
      return
    }

    if (url.pathname === '/') {
      const report = statusReport(config, health)
      if (wantsJson(request) || url.searchParams.get('format') === 'json') {
        sendJson(request, response, 200, report)
        return
      }
      const html = statusHtml(report)
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-length': Buffer.byteLength(html),
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      })
      response.end(request.method === 'HEAD' ? undefined : html)
      return
    }

    sendJson(request, response, 404, { error: 'Not found' })
  })
}

function wantsJson(request: IncomingMessage): boolean {
  const accept = request.headers.accept ?? ''
  return accept.includes('application/json') && !accept.includes('text/html')
}

function sendJson(
  request: IncomingMessage,
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  response.end(request.method === 'HEAD' ? undefined : payload)
}
