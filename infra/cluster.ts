import * as Kubernetes from '@alchemy.run/kubernetes'
import * as Alchemy from 'alchemy'
import * as Effect from 'effect/Effect'
import type { AppConfig } from './app.config.ts'

const PROD_SEAM = [
  "stage 'prod' is a seam, not a cluster.",
  'Replace Kubernetes.LocalCluster with Kubernetes.KubeConfig (or a hosted',
  'cluster resource), point it at a registry the nodes can pull, and set',
  "publish to 'named'.",
  'Stop reading secret values on this machine: mount them with External',
  'Secrets from AWS Parameter Store (or Secrets Manager). Do not copy the',
  'laptop .env into the hosted cluster.',
].join(' ')

/**
 * `live` is a kind cluster on this machine, one per app, registry included.
 * The host port is bound to loopback; the public path is the tunnel, when
 * one is configured.
 *
 * Prod is intentionally unimplemented. The swap is:
 *
 *   return Kubernetes.KubeConfig({
 *     context: 'prod',
 *     registry: { server: 'ghcr.io/acme/kind-app' },
 *     architecture: 'arm64',
 *   })
 *
 * `KubeConfig` is not a resource. It only describes a context kubectl can
 * already use, so it is returned rather than yielded.
 */
export const provideCluster = (config: AppConfig) =>
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage
    if (stage === 'prod') return yield* Effect.die(new Error(PROD_SEAM))

    return yield* Kubernetes.LocalCluster('Cluster', {
      name: config.name,
      registryPort: config.registryPort,
      nodes: [
        {
          role: 'control-plane',
          extraPortMappings: [
            {
              containerPort: config.nodePort,
              hostPort: config.hostPort,
              listenAddress: '127.0.0.1',
              protocol: 'TCP',
            },
          ],
        },
      ],
    })
  })
