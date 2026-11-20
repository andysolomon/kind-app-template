#!/usr/bin/env bash
# Runs a command with access to the Docker socket.
#
# Group membership is fixed at login, so a shell that started before its user
# joined the `docker` group can't reach the socket even though the account can.
# In that case the command is re-run under `newgrp docker`.
set -euo pipefail

if docker info >/dev/null 2>&1; then
  exec "$@"
fi

if getent group docker | tr ',:' '\n\n' | grep -qx "$(id -un)"; then
  printf -v command '%q ' "$@"
  exec newgrp docker <<EOF_NEWGRP
$command
EOF_NEWGRP
fi

echo "Docker isn't reachable: start it, or add $(id -un) to the docker group." >&2
exit 1
