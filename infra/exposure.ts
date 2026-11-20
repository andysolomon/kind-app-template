import * as Kubernetes from '@alchemy.run/kubernetes'
import type { LocalCluster } from '@alchemy.run/kubernetes'
import * as Effect from 'effect/Effect'
import type { AppConfig } from './app.config.ts'
import type { ResolvedSecrets } from './secrets.ts'
import type { Workload } from './workload.ts'

/** Pinned. `latest` would let a restart change the tunnel client. */
const TUNNEL_IMAGE = 'cloudflare/cloudflared:2026.11.1'
/** `/ready` for probes, `/quicktunnel` for the public hostname. */
const TUNNEL_METRICS_PORT = 2000
const TUNNEL_UID = 65532

/**
 * Loopback NodePort is always there. `publish` adds a tunnel beside it:
 * `quick` dials trycloudflare.com with no account, `named` runs a token
 * from the tunnel Secret for a hostname you own.
 */
export const provideExposure = (
  cluster: LocalCluster,
  namespace: string,
  config: AppConfig,
  workload: Workload,
  secrets: ResolvedSecrets,
) =>
  Effect.gen(function* () {
    yield* Kubernetes.Manifest('Service', {
      cluster,
      manifest: {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: { name: workload.serviceName, namespace },
        spec: {
          type: 'ClusterIP',
          selector: { 'app.kubernetes.io/name': workload.deploymentName },
          ports: [{ name: 'http', port: config.appPort, targetPort: config.appPort }],
        },
      },
    })

    yield* Kubernetes.Manifest('NodePort', {
      cluster,
      manifest: {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: { name: `${config.name}-nodeport`, namespace },
        spec: {
          type: 'NodePort',
          selector: { 'app.kubernetes.io/name': workload.deploymentName },
          ports: [
            {
              name: 'http',
              port: config.appPort,
              targetPort: config.appPort,
              nodePort: config.nodePort,
            },
          ],
        },
      },
    })

    if (config.publish === 'none') return

    const tunnelName = `${config.name}-tunnel`
    const labels = { 'app.kubernetes.io/name': tunnelName }
    const tokenEnv =
      config.publish === 'named'
        ? [
            {
              name: 'TUNNEL_TOKEN',
              valueFrom: {
                secretKeyRef: {
                  name: requiredTunnelSecret(secrets),
                  key: 'CLOUDFLARE_TUNNEL_TOKEN',
                },
              },
            },
          ]
        : []

    yield* Kubernetes.Manifest('Tunnel', {
      cluster,
      manifest: {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name: tunnelName, namespace, labels },
        spec: {
          replicas: 1,
          strategy: { type: 'Recreate' },
          selector: { matchLabels: labels },
          template: {
            metadata: { labels },
            spec: {
              automountServiceAccountToken: false,
              terminationGracePeriodSeconds: 15,
              securityContext: {
                runAsNonRoot: true,
                runAsUser: TUNNEL_UID,
                runAsGroup: TUNNEL_UID,
                seccompProfile: { type: 'RuntimeDefault' },
              },
              containers: [
                {
                  name: 'cloudflared',
                  image: TUNNEL_IMAGE,
                  args: tunnelArgs(config),
                  ...(tokenEnv.length === 0 ? {} : { env: tokenEnv }),
                  ports: [{ name: 'metrics', containerPort: TUNNEL_METRICS_PORT }],
                  readinessProbe: {
                    httpGet: { path: '/ready', port: 'metrics' },
                    periodSeconds: 5,
                  },
                  // A restart of a quick tunnel changes the public hostname,
                  // so only give up after five minutes of failing probes.
                  livenessProbe: {
                    httpGet: { path: '/ready', port: 'metrics' },
                    initialDelaySeconds: 30,
                    periodSeconds: 30,
                    failureThreshold: 10,
                  },
                  resources: {
                    requests: { cpu: '20m', memory: '32Mi' },
                    limits: { memory: '128Mi' },
                  },
                  securityContext: {
                    allowPrivilegeEscalation: false,
                    readOnlyRootFilesystem: true,
                    capabilities: { drop: ['ALL'] },
                  },
                },
              ],
            },
          },
        },
      },
    })

    yield* Kubernetes.Manifest('TunnelMetrics', {
      cluster,
      manifest: {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: { name: tunnelName, namespace, labels },
        spec: {
          type: 'ClusterIP',
          selector: labels,
          ports: [{ name: 'metrics', port: TUNNEL_METRICS_PORT, targetPort: 'metrics' }],
        },
      },
    })
  })

function tunnelArgs(config: AppConfig): string[] {
  const metrics = ['tunnel', '--no-autoupdate', '--metrics', `0.0.0.0:${TUNNEL_METRICS_PORT}`]
  if (config.publish === 'named') {
    // cloudflared reads TUNNEL_TOKEN from the environment, so the token
    // never appears in args or `kubectl describe`.
    return [...metrics, 'run']
  }
  return [...metrics, '--url', `http://${config.name}:${config.appPort}`]
}

function requiredTunnelSecret(secrets: ResolvedSecrets): string {
  if (secrets.tunnelSecretName === undefined) {
    throw new Error('named publish requires the tunnel Secret')
  }
  return secrets.tunnelSecretName
}
