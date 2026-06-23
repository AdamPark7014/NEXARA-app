#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "This project now uses Docker-only deploy flow."
echo "Legacy PM2 deploy was removed to avoid mixed runtime states."
echo ""
echo "Running: $ROOT_DIR/deploy/update.sh --with-migrate"
exec "$ROOT_DIR/deploy/update.sh" --with-migrate "$@"
