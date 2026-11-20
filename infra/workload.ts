import * as Kubernetes from '@alchemy.run/kubernetes'
import type { LocalCluster } from '@alchemy.run/kubernetes'
import * as Effect from 'effect/Effect'
import type { AppConfig } from './app.config.ts'
import type { ResolvedSecrets } from './secrets.ts'

const APP_UID = 1000

export interface Workload {
  /** Content-addressed image reference. An Alchemy `Output` until deploy. */
  readonly imageUri: unknown
  readonly serviceName: string
  readonly deploymentName: string
}

/**
 * Two objects, on purpose.
 *
 * `Kubernetes.Deployment` builds the Dockerfile and pushes it to the kind
 * registry, tagged by a hash of the build context. Its pod template cannot
 * express probes, a container securityContext, or a rollout strategy: arrays
 * in `podTemplate` replace the generated container, and `strategy` is not a
 * prop. That Deployment is scaled to zero. It publishes the image and does
 * not serve traffic.
 *
 * The serving Deployment is a manifest, so those fields stay explicit.
 */
export const provideWorkload = (
  cluster: LocalCluster,
  namespace: string,
  config: AppConfig,
  secrets: ResolvedSecrets,
) =>
  Effect.gen(function* () {
    const image = yield* Kubernetes.Deployment('Image', {
      cluster,
      name: `${config.name}-image`,
      namespace,
      context: '..',
      port: config.appPort,
      replicas: 0,
      serviceType: 'ClusterIP',
      resources: config.resources,
      podTemplate: {
        spec: {
          automountServiceAccountToken: false,
          terminationGracePeriodSeconds: 30,
          securityContext: podSecurity(),
        },
      },
    })

    const labels = { 'app.kubernetes.io/name': config.name }
    yield* Kubernetes.Manifest('App', {
      cluster,
      manifest: {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name: config.name, namespace, labels },
        spec: {
          replicas: config.replicas,
          strategy: rollout(config),
          selector: { matchLabels: labels },
          template: {
            metadata: { labels },
            spec: {
              serviceAccountName: image.serviceAccountName,
              automountServiceAccountToken: false,
              terminationGracePeriodSeconds: 30,
              securityContext: podSecurity(),
              containers: [
                {
                  name: config.name,
                  image: image.imageUri,
                  imagePullPolicy: 'IfNotPresent',
                  ports: [{ name: 'http', containerPort: config.appPort }],
                  env: containerEnv(config),
                  ...(secrets.appSecretName === undefined
                    ? {}
                    : { envFrom: [{ secretRef: { name: secrets.appSecretName } }] }),
                  resources: config.resources,
                  securityContext: {
                    allowPrivilegeEscalation: false,
                    capabilities: { drop: ['ALL'] },
                    runAsNonRoot: true,
                    runAsUser: APP_UID,
                    runAsGroup: APP_UID,
                    seccompProfile: { type: 'RuntimeDefault' },
                  },
                  startupProbe: probe('/healthz', config.appPort, {
                    periodSeconds: 2,
                    failureThreshold: 30,
                  }),
                  readinessProbe: probe('/readyz', config.appPort, { periodSeconds: 5 }),
                  livenessProbe: probe('/healthz', config.appPort, {
                    periodSeconds: 10,
                    failureThreshold: 3,
                  }),
                },
              ],
            },
          },
        },
      },
    })

    return {
      imageUri: image.imageUri,
      serviceName: config.name,
      deploymentName: config.name,
    }
  })

function podSecurity(): Record<string, unknown> {
  return {
    runAsNonRoot: true,
    runAsUser: APP_UID,
    runAsGroup: APP_UID,
    fsGroup: APP_UID,
    seccompProfile: { type: 'RuntimeDefault' },
  }
}

function rollout(config: AppConfig): Record<string, unknown> {
  if (config.strategy === 'Recreate') return { type: 'Recreate' }
  return { type: 'RollingUpdate', rollingUpdate: { maxUnavailable: 0, maxSurge: 1 } }
}

function containerEnv(config: AppConfig): Array<{ name: string; value: string }> {
  const values = new Map<string, string>([
    ['HOST', '0.0.0.0'],
    ['PORT', String(config.appPort)],
    ...Object.entries(config.env),
  ])
  return [...values].map(([name, value]) => ({ name, value }))
}

function probe(
  path: string,
  port: number,
  timing: { periodSeconds: number; failureThreshold?: number },
): Record<string, unknown> {
  return {
    httpGet: { path, port },
    timeoutSeconds: 2,
    periodSeconds: timing.periodSeconds,
    ...(timing.failureThreshold === undefined ? {} : { failureThreshold: timing.failureThreshold }),
  }
}
