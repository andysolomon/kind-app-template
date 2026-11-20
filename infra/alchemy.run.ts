/**
 * One app, one kind cluster:
 *
 *   kind cluster (+ local image registry, loopback NodePort)
 *     └─ namespace
 *          ├─ image Deployment (scaled to zero; builds and pushes the image)
 *          ├─ serving Deployment / Service
 *          └─ optional cloudflared tunnel
 *
 *   pnpm infra:up      create or update everything
 *   pnpm infra:plan    show what would change
 *   pnpm infra:down    tear it all down, cluster included
 *   pnpm url           print the local address, and the quick-tunnel address
 *
 * Change the app in app.config.ts. The modules next to this file are the
 * pieces: cluster, secrets, workload, exposure.
 */
import * as Kubernetes from '@alchemy.run/kubernetes'
import * as Alchemy from 'alchemy'
import * as Effect from 'effect/Effect'
import { appConfig } from './app.config.ts'
import { provideCluster } from './cluster.ts'
import { loadLocalEnv, stageFromArgv } from './env.ts'
import { provideExposure } from './exposure.ts'
import { provideSecrets } from './secrets.ts'
import { provideWorkload } from './workload.ts'

if (stageFromArgv() !== 'prod') loadLocalEnv()

export default Alchemy.Stack(
  appConfig.stackName,
  {
    providers: Kubernetes.providers(),
    state: Alchemy.localState(),
    secrets: ({ stage }) => (stage === 'prod' ? [] : [Alchemy.Secrets.DotEnv()]),
  },
  Effect.gen(function* () {
    const cluster = yield* provideCluster(appConfig)
    yield* Kubernetes.Manifest('Namespace', {
      cluster,
      manifest: {
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: { name: appConfig.name },
      },
    })

    const secrets = yield* provideSecrets(cluster, appConfig.name, appConfig)
    const workload = yield* provideWorkload(cluster, appConfig.name, appConfig, secrets)
    yield* provideExposure(cluster, appConfig.name, appConfig, workload, secrets)

    return {
      local: `http://127.0.0.1:${appConfig.hostPort}`,
      publish: appConfig.publish,
      kubeContext: cluster.context,
      namespace: appConfig.name,
      image: workload.imageUri,
    }
  }),
)
