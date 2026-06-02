#!/usr/bin/env bash
# Start local PostgreSQL@16 (Homebrew) when brew services / launchctl fails.
set -euo pipefail

PG_DATA="/opt/homebrew/var/postgresql@16"
PG_BIN="/opt/homebrew/opt/postgresql@16/bin"

if [[ ! -x "$PG_BIN/pg_isready" ]]; then
  echo "PostgreSQL@16 not found. Install with: brew install postgresql@16"
  exit 1
fi

if "$PG_BIN/pg_isready" -h localhost -p 5432 -q 2>/dev/null; then
  echo "PostgreSQL is already running on localhost:5432"
  exit 0
fi

echo "Starting PostgreSQL..."
"$PG_BIN/pg_ctl" -D "$PG_DATA" -l /opt/homebrew/var/log/postgresql@16.log start -w

if ! "$PG_BIN/pg_isready" -h localhost -p 5432 -q; then
  echo "Failed to start PostgreSQL. Check: /opt/homebrew/var/log/postgresql@16.log"
  exit 1
fi

if ! "$PG_BIN/psql" -h localhost -p 5432 -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw plant; then
  echo "Creating database 'plant'..."
  "$PG_BIN/createdb" plant
fi

echo "Ready: postgresql://$(whoami)@localhost:5432/plant"
