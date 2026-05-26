#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="pm-app"
EXISTING_CONTAINER="$(docker ps -aq --filter "name=^/${CONTAINER_NAME}$")"

if [ -n "$EXISTING_CONTAINER" ]; then
  docker rm -f "$CONTAINER_NAME" >/dev/null
  echo "Stopped $CONTAINER_NAME"
else
  echo "$CONTAINER_NAME is not running"
fi
