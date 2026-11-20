# kind-app

A local Kubernetes app: one [kind](https://kind.sigs.k8s.io/) cluster, described
only in Alchemy, and a small Node server you can replace. The cluster binds
its port to loopback. A Cloudflare tunnel or Tailscale is optional.

```
apps/server     Node HTTP server. /healthz, /readyz, and a status page.
infra           Alchemy stack. Edit app.config.ts, not the modules, for a new app.
scripts         Docker wrapper, URL, smoke, Tailscale, and init-app.
```

## Prerequisites

Node 24 or newer, pnpm 12.9.1 (`corepack enable` picks it up from
`packageManager`), Docker, [kind](https://kind.sigs.k8s.io/docs/user/quick-start/#installation),
and kubectl. Tailscale and a Cloudflare account are only needed for those
publish modes.

`pnpm infra:up` was not run in a machine without Docker. Plan and deploy need
a local Docker daemon.

## A new app

```sh
pnpm install
pnpm init:app -- --name my-app --host-port 4210
pnpm install
```

`init:app` rewrites the name, the stack name, and the ports. Host 4210 becomes
node port 30210 and registry port 5030. Record the row in `PORTS.md` (the
script updates the template row). Do not reuse a port from the table.

## Daily commands

```sh
pnpm dev          # server on :3000, TypeScript run by Node
pnpm test
pnpm typecheck
pnpm build && pnpm start

pnpm infra:plan   # what would change
pnpm infra:up     # create or update the cluster, then print the address
pnpm infra:down   # delete the cluster too
pnpm url          # print the address again
pnpm smoke        # /healthz, /readyz, and /
pnpm smoke -- https://the-tunnel.example
```

After `infra:up` the process is at http://127.0.0.1:4200 (node port 30200, registry 5020).

```sh
kubectl --context kind-kind-app -n kind-app get pods
kubectl --context kind-kind-app -n kind-app logs deploy/kind-app -f
```

State lives in `infra/.alchemy/`, which is gitignored.

## Publish

Set `publish` in `infra/app.config.ts`. Loopback stays on in every mode.

| Mode | What you get |
| --- | --- |
| `none` | http://127.0.0.1:4200 (node port 30200, registry 5020) only. The default. |
| `quick` | A `cloudflared` pod (`cloudflare/cloudflared:2026.11.1`) dials out to a random `trycloudflare.com` hostname. `pnpm url` reads it from the pod. The hostname changes when that pod restarts. |
| `named` | The same pod runs `tunnel run` with `TUNNEL_TOKEN` from a Kubernetes Secret. Put `CLOUDFLARE_TUNNEL_TOKEN` in `.env`. The public hostname is the DNS name on that tunnel. |

Tailscale is not a `publish` value. It shares the loopback port with your
tailnet and does not open it to the internet:

```sh
scripts/tailscale-serve.sh up       # https://<this-machine>.ts.net:8443
scripts/tailscale-serve.sh status
scripts/tailscale-serve.sh down     # removes only this HTTPS port
```

Port 443 is reserved for T3 Code. The script refuses it.

## Secrets

```sh
cp .env.example .env
```

`.env` is gitignored. For the `live` stage, Alchemy loads it (and `infra/.env`)
and does not print values. A key is copied into a Kubernetes Secret only when
it is listed in `secretKeys` and actually set. With `secretKeys` empty and no
token, the stack creates no Secret.

`CLOUDFLARE_TUNNEL_TOKEN` is read only when `publish` is `named`, and it is
mounted into cloudflared, not into the app. Do not also list it in
`secretKeys` unless the app itself needs the token.

The `prod` stage does not load `.env`. See below.

## What the stack creates

| Resource | Role |
| --- | --- |
| `Cluster` | kind cluster `<name>`, registry on `localhost:<registryPort>`, host port bound to `127.0.0.1` |
| `Namespace` | The app name |
| `Image` | Builds `Dockerfile` and pushes it to the kind registry. Scaled to zero. Alchemy's Deployment helper cannot set probes or a rollout strategy, so this object only publishes the image. |
| `App` | The serving Deployment. Non-root uid 1000, dropped capabilities, seccomp, requests and a memory limit, startup `/healthz`, readiness `/readyz`, liveness `/healthz`. |
| `Service` / `NodePort` | ClusterIP for the tunnel, and node port mapped to loopback |
| `Tunnel` | Only when `publish` is `quick` or `named` |

`replicas: 1` and `strategy: "Recreate"` are the single-writer default: the old
pod is gone before the new one starts. A stateless app can raise `replicas`
and switch to `"RollingUpdate"`.

The image is hashed from the Docker build context. `.dockerignore` leaves out
`node_modules`, `dist`, `.alchemy`, `infra`, `scripts`, tests, and markdown, so
editing the stack does not rebuild the image.

## Hosted cluster, later

`infra/cluster.ts` dies on `--stage prod` with the swap written next to the
check. Replace `Kubernetes.LocalCluster` with `Kubernetes.KubeConfig` (a
context kubectl can already use, plus a registry the nodes can pull). Set
`publish` to `named`. Stop shipping secret values from the laptop: mount them
with External Secrets from AWS Parameter Store or Secrets Manager. That stage
is not implemented, and this repo has no Terraform, Helm, or Argo CD.
