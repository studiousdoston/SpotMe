#!/usr/bin/env bash
# Deploy SpotMe from the Mac (the VPS has no Node.js, so the web app is built here):
#   build web/dist → rsync it to the VPS → run deploy/update-server.sh on the VPS.
# Run from anywhere:  deploy/deploy-from-mac.sh
# Stops at the first failing step.
set -euo pipefail

VPS_HOST="${VPS_HOST:-doston@72.60.208.46}"
APP_DIR=/opt/doston/spotme

# Work from the repo root, wherever the script is called from.
cd "$(dirname "$0")/.."

# The VPS gets its server code from `git pull`, but the web build comes from this folder.
# Refuse to deploy uncommitted or unpushed work, so both halves are the same version.
# (SKIP_GIT_CHECK=1 deploy/deploy-from-mac.sh skips this, e.g. for a frontend-only hotfix.)
if [[ "${SKIP_GIT_CHECK:-0}" != "1" ]]; then
  echo "==> Checking the code is committed and pushed"
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "Uncommitted changes. Commit and push first (or SKIP_GIT_CHECK=1)." >&2
    exit 1
  fi
  git fetch --quiet
  if [[ "$(git rev-parse HEAD)" != "$(git rev-parse '@{u}')" ]]; then
    echo "This branch and its remote differ. Push (or pull) first (or SKIP_GIT_CHECK=1)." >&2
    exit 1
  fi
fi

echo "==> Building the web app"
(cd web && npm ci && npm run build)

echo "==> Uploading web/dist to $VPS_HOST"
# --delete removes files of older builds (old hashed assets) from the server.
rsync -az --delete web/dist/ "$VPS_HOST:$APP_DIR/web/dist/"

echo "==> Updating the server on the VPS"
ssh "$VPS_HOST" "bash $APP_DIR/deploy/update-server.sh"

echo "==> Done: https://spotme.72-60-208-46.sslip.io"
