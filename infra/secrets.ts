import * as Kubernetes from '@alchemy.run/kubernetes'
import type { LocalCluster } from '@alchemy.run/kubernetes'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import type { AppConfig } from './app.config.ts'

export interface ResolvedSecrets {
  /** Set only when at least one configured key was present. */
  readonly appSecretName: string | undefined
  /** Set only for `publish: "named"`. */
  readonly tunnelSecretName: string | undefined
}

/**
 * Copy opted-in keys from the local environment into a Kubernetes Secret.
 * Missing keys are skipped, so a checkout with no `.env` still deploys.
 * Values are `Redacted`: the applier unwraps them on the wire and state,
 * logs, and errors keep the placeholder.
 *
 * A named tunnel reads `CLOUDFLARE_TUNNEL_TOKEN` into its own Secret, which
 * is not mounted into the app.
 */
export const provideSecrets = (
  cluster: LocalCluster,
  namespace: string,
  config: AppConfig,
) =>
  Effect.gen(function* () {
    const pairs: Array<readonly [string, Redacted.Redacted<string>]> = []
    for (const key of config.secretKeys) {
      const value = yield* Config.option(Config.Redacted(key))
      if (Option.isNone(value)) continue
      if (Redacted.value(value.value).length === 0) continue
      pairs.push([key, value.value])
    }

    const appSecretName = pairs.length === 0 ? undefined : `${config.name}-env`
    if (appSecretName !== undefined) {
      yield* Kubernetes.Manifest('AppSecret', {
        cluster,
        manifest: {
          apiVersion: 'v1',
          kind: 'Secret',
          metadata: { name: appSecretName, namespace },
          type: 'Opaque',
          stringData: Object.fromEntries(pairs),
        },
      })
    }

    if (config.publish !== 'named') {
      return { appSecretName, tunnelSecretName: undefined } satisfies ResolvedSecrets
    }

    const token = yield* Config.Redacted('CLOUDFLARE_TUNNEL_TOKEN')
    if (Redacted.value(token).length === 0) {
      return yield* Effect.die(new Error('CLOUDFLARE_TUNNEL_TOKEN is empty'))
    }
    const tunnelSecretName = `${config.name}-tunnel`
    yield* Kubernetes.Manifest('TunnelSecret', {
      cluster,
      manifest: {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: { name: tunnelSecretName, namespace },
        type: 'Opaque',
        stringData: { CLOUDFLARE_TUNNEL_TOKEN: token },
      },
    })
    return { appSecretName, tunnelSecretName } satisfies ResolvedSecrets
  })
