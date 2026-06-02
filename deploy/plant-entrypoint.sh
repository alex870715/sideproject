#!/bin/sh
set -e

echo "[PlanT] Waiting for PostgreSQL…"
until npx prisma db push --skip-generate 2>/dev/null; do
  sleep 2
done
echo "[PlanT] Database ready."

exec npx next start -H 0.0.0.0 -p 3000
