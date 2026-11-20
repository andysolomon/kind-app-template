# Ports

One host port, one node port, and one registry port per app. Two kind clusters
cannot share a registry port or a host port.

| App | Host | NodePort | Registry | Tailscale HTTPS |
| --- | --- | --- | --- | --- |
| arc-reader | 4179 | 30179 |  |  |
| high-school-outlook | 4180 | 30180 |  | 8470 |
| roll-call | 4190 | 30190 | 5011 |  |
| kind-app (this template) | 4200 | 30200 | 5020 | 8443 |
| T3 Code |  |  |  | 443 reserved |

`nodePort = hostPort + 26000`. Node ports have to sit between 30000 and 32767,
so keep host ports in the 41xx–62xx range. `registryPort = hostPort + 820`
for this series (4200 becomes 5020). Pick the next free host port, usually the
next ten, and pass it to `pnpm init:app`.

Tailscale port 443 is reserved for T3 Code. Do not serve another app there.
High School Outlook already uses 8470. This template uses 8443, which is
tailnet-only (`scripts/tailscale-serve.sh`), not Funnel.
