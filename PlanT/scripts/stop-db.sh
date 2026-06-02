#!/usr/bin/env bash
set -euo pipefail

PG_DATA="/opt/homebrew/var/postgresql@16"
PG_BIN="/opt/homebrew/opt/postgresql@16/bin"

"$PG_BIN/pg_ctl" -D "$PG_DATA" stop -m fast 2>/dev/null || true
echo "PostgreSQL stopped."
