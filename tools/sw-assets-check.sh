#!/bin/bash
# sw-assets-check.sh
# ------------------------------------------------------------
# Verify every versioned asset loaded by index.html is also
# precached by sw.js. Prevents the recurring "added a new
# script tag, forgot to add it to ASSETS" bug (occurred twice
# in the same session on 2026-04-13).
#
# Exit codes:
#   0 — index.html and sw.js ASSETS are in sync
#   1 — drift: at least one index.html asset is missing from
#       sw.js ASSETS, or one of the files cannot be read
#
# Usage:
#   ./tools/sw-assets-check.sh
#
# Already wired into .git/hooks/pre-commit on this machine.
# When cloning the repo on a new machine, copy the relevant
# block out of CLAUDE.md or call this script from the new
# pre-commit hook directly.
# ------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

INDEX="$ROOT/index.html"
SW="$ROOT/sw.js"

if [ ! -f "$INDEX" ]; then
  echo "[sw-assets-check] $INDEX not found" >&2
  exit 1
fi
if [ ! -f "$SW" ]; then
  echo "[sw-assets-check] $SW not found" >&2
  exit 1
fi

INDEX_ASSETS=$(grep -oE '(src|href)="[A-Za-z0-9_/\.\-]+\.(js|css)\?v=[0-9.]+"' "$INDEX" \
  | sed -E 's/^(src|href)="//; s/"$//' | sort -u)
SW_ASSETS=$(grep -oE "'[A-Za-z0-9_/\.\-]+\.(js|css)\?v=[0-9.]+'" "$SW" \
  | sed "s/^'//; s/'$//" | sort -u)

MISSING=$(comm -23 <(echo "$INDEX_ASSETS") <(echo "$SW_ASSETS"))

if [ -n "$MISSING" ]; then
  echo ""
  echo "============================================"
  echo " sw.js ASSETS DRIFT DETECTED"
  echo "============================================"
  echo ""
  echo " These assets are loaded by index.html but missing from sw.js ASSETS:"
  echo "$MISSING" | sed 's/^/   - /'
  echo ""
  echo " Fix: add the missing entries to the ASSETS array in sw.js,"
  echo "      then re-stage with 'git add sw.js'."
  echo " Why: PWA users would hit cache-miss on these URLs and the app"
  echo "      could fail to start offline. Recurrence of 2026-04-13 bug."
  echo "============================================"
  exit 1
fi

echo "[sw-assets-check] OK — $(echo "$INDEX_ASSETS" | wc -l | tr -d ' ') index.html assets all present in sw.js"
exit 0
