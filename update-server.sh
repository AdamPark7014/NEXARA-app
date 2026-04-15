#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Docker-only deploy is enabled for this project."
echo "Legacy PM2 updater was removed to prevent mixed runtime mode."
echo ""
echo "Running: $ROOT_DIR/deploy/update.sh --with-migrate"
exec "$ROOT_DIR/deploy/update.sh" --with-migrate "$@"
