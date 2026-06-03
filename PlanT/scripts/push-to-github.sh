#!/usr/bin/env bash
# Sync this folder to https://github.com/alex870715/PlanT and push main.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="${PLANT_GITHUB_REPO:-https://github.com/alex870715/PlanT.git}"
WORKDIR="${TMPDIR:-/tmp}/plant-github-push-$$"

cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

echo "→ Cloning $REPO …"
git clone --depth 1 -b main "$REPO" "$WORKDIR"

echo "→ Syncing $ROOT …"
rsync -a --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude .env \
  --exclude '.env.*' \
  --exclude .vercel \
  --exclude .git \
  "$ROOT/" "$WORKDIR/"

cd "$WORKDIR"
if git diff --quiet && [ -z "$(git status --porcelain)" ]; then
  echo "✓ PlanT repo already up to date."
  exit 0
fi

git add -A
git commit -m "${1:-chore: sync from local PlanT}"
git push origin main
echo "✓ Pushed to $REPO (main)"
