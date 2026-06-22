#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${LIFEBEE_EXCEL_REMOTE:?Set LIFEBEE_EXCEL_REMOTE to user@host before deploying.}"
REMOTE="$LIFEBEE_EXCEL_REMOTE"
REMOTE_APP_DIR="${LIFEBEE_EXCEL_REMOTE_APP_DIR:-/opt/lifebee-excel-convert}"
REMOTE_SERVICE="${LIFEBEE_EXCEL_REMOTE_SERVICE:-lifebee-excel-convert.service}"
REMOTE_NODE_BIN_DIR="${LIFEBEE_EXCEL_REMOTE_NODE_BIN_DIR:-/home/ubuntu/.nvm/versions/node/v20.20.2/bin}"
REMOTE_HEALTH_URL="${LIFEBEE_EXCEL_REMOTE_HEALTH_URL:-http://127.0.0.1:4174/excel-convert/api/health}"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

archive="$tmp_dir/lifebee-excel-convert.tgz"
remote_archive="/tmp/lifebee-excel-convert-$(date +%Y%m%d-%H%M%S).tgz"

cd "$ROOT_DIR"

COPYFILE_DISABLE=1 tar -czf "$archive" \
  server.js \
  converter.py \
  package.json \
  package-lock.json \
  README.md \
  public \
  scripts \
  tests \
  desktop/runtime-config.js \
  electron-builder.remote.json

scp "$archive" "$REMOTE:$remote_archive"

ssh "$REMOTE" \
  "set -euo pipefail
   mkdir -p '$REMOTE_APP_DIR'
   tar -xzf '$remote_archive' -C '$REMOTE_APP_DIR'
   find '$REMOTE_APP_DIR' -name '._*' -delete
   export PATH='$REMOTE_NODE_BIN_DIR':\"\$PATH\"
   cd '$REMOTE_APP_DIR'
   npm ci --omit=dev
   npm test
   sudo systemctl restart '$REMOTE_SERVICE'
   curl -fsS '$REMOTE_HEALTH_URL'
   echo"
