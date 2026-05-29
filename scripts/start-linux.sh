#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="pm-app"
CONTAINER_NAME="pm-app"
DATA_DIR="$ROOT_DIR/backend/data"

cd "$ROOT_DIR"
mkdir -p "$DATA_DIR"

docker build -t "$IMAGE_NAME" .

EXISTING_CONTAINER="$(docker ps -aq --filter "name=^/${CONTAINER_NAME}$")"
if [ -n "$EXISTING_CONTAINER" ]; then
  docker rm -f "$CONTAINER_NAME" >/dev/null
fi

docker run -d --env-file ".env" -p 8000:8000 -v "$DATA_DIR:/app/backend/data" --name "$CONTAINER_NAME" "$IMAGE_NAME" >/dev/null

echo "App running at http://127.0.0.1:8000"
