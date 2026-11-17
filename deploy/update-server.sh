#!/usr/bin/env bash
# Update the SpotMe API on the VPS: git pull → server deps → restart → health check.
# Called by deploy/deploy-from-mac.sh over ssh; can also be run by hand on the VPS as doston:
#   bash /opt/doston/spotme/deploy/update-server.sh
# Stops at the first failing step.
set -euo pipefail

APP_DIR=/opt/doston/spotme
HEALTH_URL=http://127.0.0.1:8020/api/health

# Everything runs inside main(), which bash reads in full before starting:
# `git pull` may rewrite this very file, and that must not change the steps mid-run.
main() {
  cd "$APP_DIR"

  echo "==> Pulling the latest code"
  git pull --ff-only

  echo "==> Installing server dependencies"
  server/.venv/bin/pip install --quiet -r server/requirements.txt

  echo "==> Restarting the API"
  sudo systemctl restart spotme-api

  echo "==> Health check: $HEALTH_URL"
  # The workers need a moment to import numpy/pandas/scipy after a restart.
  for attempt in $(seq 1 15); do
    if curl --fail --silent --max-time 2 "$HEALTH_URL"; then
      echo
      echo "API healthy (attempt $attempt)."
      return 0
    fi
    sleep 1
  done

  echo "Health check failed after restart." >&2
  sudo systemctl status spotme-api --no-pager >&2 || true
  return 1
}

main "$@"
