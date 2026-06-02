#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE="$ROOT/mobile"

# 常見安裝路徑（若你的 npm 在別處，請先 export PATH 再執行本腳本）
export PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.volta/bin:${HOME}/.fnm:${PATH}"

if ! command -v npm >/dev/null 2>&1; then
  echo "找不到 npm。請先安裝 Node.js（https://nodejs.org/ 或 brew install node）後再執行："
  echo "  bash scripts/run-mobile.sh"
  exit 1
fi

cd "$MOBILE"
echo "==> npm install"
npm install
echo "==> npx expo start"
exec npx expo start
