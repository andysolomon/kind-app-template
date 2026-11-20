#!/usr/bin/env bash
# Share the loopback port with the tailnet. Nothing here opens the public
# internet, and `down` removes only this HTTPS port (not every serve on the
# machine). Port 443 is reserved for T3 Code.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
# shellcheck disable=SC1091
source "$root/scripts/app.env"

usage() {
  echo "usage: scripts/tailscale-serve.sh up|down|status [https-port]" >&2
  exit 2
}

action=${1:-}
if [ $# -gt 0 ]; then
  shift
fi
port=${1:-${TAILSCALE_HTTPS_PORT}}

case $action in
  up | down | status) ;;
  *) usage ;;
esac

if [ "$port" = "443" ]; then
  echo "Port 443 is reserved for T3 Code. This app uses ${TAILSCALE_HTTPS_PORT}." >&2
  exit 1
fi

command -v tailscale >/dev/null 2>&1 || {
  echo "tailscale is not on PATH" >&2
  exit 1
}
command -v python3 >/dev/null 2>&1 || {
  echo "python3 is not on PATH" >&2
  exit 1
}

self=$(tailscale status --json)
host=$(SELF="$self" python3 - <<'PY'
import json, os, sys
status = json.loads(os.environ["SELF"])
backend = status.get("BackendState")
if backend != "Running":
    print(f"tailscale is {backend}, not Running", file=sys.stderr)
    sys.exit(1)
dns = status.get("Self", {}).get("DNSName", "").rstrip(".")
if not dns:
    print("tailscale status has no Self.DNSName", file=sys.stderr)
    sys.exit(1)
print(dns)
PY
)

target="http://127.0.0.1:${HOST_PORT}"

serve_json() {
  tailscale serve status --json 2>/dev/null || printf '%s' '{}'
}

# Prints the proxy target on this node's https port, or an empty line.
# Exits non-zero when that port is on a different hostname or on Funnel.
inspect() {
  local json
  json=$(serve_json)
  HOST="$host" PORT="$port" JSON="$json" python3 - <<'PY'
import json, os, sys
host = os.environ["HOST"]
port = os.environ["PORT"]
serve = json.loads(os.environ["JSON"] or "{}")
web = serve.get("Web") or {}
funnel = serve.get("AllowFunnel") or {}
own = f"{host}:{port}"
foreign = [key for key in web if key.endswith(f":{port}") and key != own]
if foreign:
    print(f"https port {port} is served on {foreign[0]}, not {own}", file=sys.stderr)
    sys.exit(1)
if funnel.get(own):
    print(f"{own} is on Funnel. This helper is tailnet-only.", file=sys.stderr)
    sys.exit(1)
handlers = (web.get(own) or {}).get("Handlers") or {}
print((handlers.get("/") or {}).get("Proxy", ""))
PY
}

case $action in
  up)
    tailscale serve --bg --https="$port" "$target"
    proxy=$(inspect)
    if [ "$proxy" != "$target" ]; then
      echo "tailscale serve on ${host}:${port} points at '${proxy}', not ${target}" >&2
      exit 1
    fi
    echo "Tailnet: https://${host}:${port}"
    ;;
  down)
    tailscale serve --https="$port" off
    proxy=$(inspect)
    if [ -n "$proxy" ]; then
      echo "https port ${port} is still serving ${proxy}" >&2
      exit 1
    fi
    echo "Tailnet: https://${host}:${port} off"
    ;;
  status)
    proxy=$(inspect)
    if [ -n "$proxy" ]; then
      echo "https://${host}:${port} -> ${proxy}"
    else
      echo "https://${host}:${port} is not served"
    fi
    ;;
esac
