#!/usr/bin/env bash
# Prints the app's address.
#
# Loopback is always there. A quick tunnel gets a new random hostname whenever
# its pod starts, so that address is read live from cloudflared through the
# Kubernetes API server. A named tunnel keeps the hostname configured in
# Cloudflare; this script cannot see it.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
# shellcheck disable=SC1091
source "$root/scripts/app.env"

echo "Local: http://127.0.0.1:${HOST_PORT}"

publish=$(sed -n "s/^  publish: '\\([^']*\\)'.*/\\1/p" "$root/infra/app.config.ts")
if [ "$publish" != "quick" ]; then
  if [ "$publish" = "named" ]; then
    echo "Public: the hostname on the named Cloudflare tunnel"
  fi
  exit 0
fi

path="/api/v1/namespaces/${NAMESPACE}/services/http:${TUNNEL_NAME}:metrics/proxy/quicktunnel"

# Up to a minute: a fresh tunnel takes a few seconds to be given its hostname.
for _ in $(seq 1 30); do
  host=$(kubectl --context "$KUBE_CONTEXT" get --raw "$path" 2>/dev/null |
    sed -n 's/.*"hostname":"\([^"]*\)".*/\1/p' || true)
  if [ -n "$host" ]; then
    echo "Public: https://${host}"
    exit 0
  fi
  sleep 2
done

echo "The tunnel has no public address yet. Check it with:" >&2
echo "  kubectl --context ${KUBE_CONTEXT} -n ${NAMESPACE} logs deploy/${TUNNEL_NAME}" >&2
exit 1
