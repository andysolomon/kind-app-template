#!/usr/bin/env bash
# Checks /healthz, /readyz, and / against the loopback port, or against a URL
# passed as the first argument (a quick tunnel, a tailnet hostname).
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
# shellcheck disable=SC1091
source "$root/scripts/app.env"

base=${1:-http://127.0.0.1:${HOST_PORT}}
base=${base%/}

fetch() {
  local path=$1
  shift
  curl --silent --show-error --fail --max-time 10 "$@" "${base}${path}"
}

live=$(fetch /healthz)
ready=$(fetch /readyz)
status=$(fetch / -H 'accept: application/json')

case $live in
  *'"ok":true'*) ;;
  *)
    echo "smoke: /healthz was not ok: ${live}" >&2
    exit 1
    ;;
esac
case $ready in
  *'"ok":true'*) ;;
  *)
    echo "smoke: /readyz was not ok: ${ready}" >&2
    exit 1
    ;;
esac
case $status in
  *"\"app\":\"${APP_NAME}\""*) ;;
  *)
    echo "smoke: / did not name ${APP_NAME}: ${status}" >&2
    exit 1
    ;;
esac

echo "smoke: ${base} ok"
