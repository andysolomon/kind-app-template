import type { Config } from './config.ts'

export const buildInfo = {
  target: 'node24',
  runtime: 'node',
} as const

export interface RuntimeHealth {
  ready: boolean
}

export interface StatusReport {
  readonly app: string
  readonly version: string
  readonly status: 'ready' | 'draining'
  readonly node: string
  readonly pid: number
  readonly uptimeSeconds: number
  readonly build: typeof buildInfo
}

export function statusReport(config: Config, health: RuntimeHealth): StatusReport {
  return {
    app: config.appName,
    version: config.version,
    status: health.ready ? 'ready' : 'draining',
    node: process.version,
    pid: process.pid,
    uptimeSeconds: Math.round(process.uptime()),
    build: buildInfo,
  }
}

export function statusHtml(report: StatusReport): string {
  const ready = report.status === 'ready'
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(report.app)}</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, sans-serif;
      background: #f3efe6;
      color: #1d1a16;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #141311; color: #f3efe6; }
    }
    main { max-width: 38rem; margin: 0 auto; padding: 3.5rem 1.25rem; }
    p { line-height: 1.5; }
    .mark {
      display: inline-block;
      margin: 0 0 1rem;
      padding: 0.15rem 0.5rem;
      border-radius: 999px;
      font-size: 0.8rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      background: ${ready ? '#1f7a4d' : '#8a5a12'};
      color: #fff;
    }
    h1 { font-size: 2rem; margin: 0 0 0.5rem; font-weight: 600; }
    dl { display: grid; grid-template-columns: 8rem 1fr; gap: 0.4rem 1rem; margin: 2rem 0; }
    dt { color: #6d675e; }
    a { color: inherit; }
  </style>
</head>
<body>
  <main>
    <p class="mark">${ready ? 'Ready' : 'Draining'}</p>
    <h1>${escapeHtml(report.app)}</h1>
    <p>Replace <code>apps/server</code> with the real process. This one only reports whether it is up.</p>
    <dl>
      <dt>Version</dt><dd>${escapeHtml(report.version)}</dd>
      <dt>Build</dt><dd>${escapeHtml(report.build.runtime)} / ${escapeHtml(report.build.target)}</dd>
      <dt>Node</dt><dd>${escapeHtml(report.node)}</dd>
      <dt>PID</dt><dd>${report.pid}</dd>
      <dt>Uptime</dt><dd>${report.uptimeSeconds}s</dd>
    </dl>
    <p><a href="/healthz">/healthz</a> · <a href="/readyz">/readyz</a></p>
  </main>
</body>
</html>
`
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
