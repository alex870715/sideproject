# Quant Pilot cloud deployment

The public portfolio is hosted on GitHub Pages. The Python trading service needs an always-on host; GitHub Pages, Vercel request functions and sleeping free services cannot run this continuous loop.

## Render (prepared; applying this creates a paid service)

Use a **new Blueprint** connected to this repository, with Blueprint path `bot/render.yaml` and **root directory `bot`**. Do not apply the repository-root Blueprint: that deploys unrelated apps. Alternatively create a Docker Web Service with root directory `bot`, Dockerfile `./Dockerfile`, Starter instance, one replica, and a 1 GB disk mounted at `/var/data`.

Review current [compute pricing](https://render.com/pricing) and [persistent disk pricing](https://render.com/docs/disks) in the provider before creating the service. Use a non-sleeping instance. Keep automatic deploys off so an unrelated monorepo commit does not restart a trading engine.

Set these private environment variables in the service:

- `BOT_CLOUD=true`
- `BOT_PUBLIC_ORIGIN=https://<actual-service-name>.onrender.com` (exact public origin; no path)
- `BOT_DATA_DIR=/var/data`
- `BOT_ADMIN_USER=alex`
- `BOT_ADMIN_PASSWORD`: generate a random password of at least 32 characters (the Blueprint generates one).
- `OKX_DEMO=true`
- `OKX_API_KEY`, `OKX_API_SECRET`, `OKX_PASSPHRASE`: use the existing **Demo** account credentials, never repository files or Pages secrets.

The Docker entrypoint binds `$PORT` and trusts the hosting TLS proxy. Do not expose its raw HTTP port directly to the internet; only a controlled reverse proxy may supply forwarded headers. All account, trading, research and asset routes require HTTP Basic authentication over HTTPS. `/healthz` only reports process/loop health; it deliberately does not reveal account status or credentials. It is not proof that OKX is reachable. Check the dashboard's account timestamp and connection state as well.

Render's disk permits one instance and stops the old instance before starting the new one. A filesystem lock also prevents duplicate workers on the same disk. **These locks do not coordinate independent hosts. Never run local and cloud traders simultaneously on the same account.**

## Move an existing ledger

1. Pause new entries in the local UI; wait for owned positions and pending orders to finish, then stop the local process. Confirm OKX has no unresolved orders/positions before migration.
2. Deploy with credentials; a fresh ledger starts paused. Do not press Start yet. Stop the cloud service before replacing its ledger.
3. Securely transfer `data/autopilot/state.json` to `/var/data/autopilot/state.json` using provider SSH/SFTP. Copy completed research/history folders too if needed. Do not commit this directory or reset account binding. Preserve the paused state during transfer.
4. Start the single cloud instance; compare budget, trade count, realized P&L, open orders and current OKX balances with the local record. Start only after account reconciliation succeeds.
5. Close the browser and verify the timestamp/events continue to update after reopening. Restart the service once while paused and flat; confirm the same ledger/history persists.

An enabled state is restored on subsequent restarts. Unknown order outcomes are reconciled rather than resubmitted. A cumulative loss halt remains set after restart. Backtests still running during a deployment are interrupted; completed results survive on disk.

## Local validation (does not trade)

```sh
python -m unittest discover -v
```

## Re-run the public research example (no account key)

```sh
python scripts/backtest_portfolio.py --budget 1000 --leverage 10 --style active
```

This saves complete results privately in `BOT_DATA_DIR/autopilot/backtests`. To deliberately update the public, allowlisted research snapshot, add `--export ../portfolio/data/quant-pilot.json`. The export contains historical simulation settings and results only, never an account snapshot or ledger. The public site does not contact the private service.

After the cloud URL is verified, set `window.QUANT_PILOT_OWNER_URL` in `portfolio/owner-config.js` to the HTTPS origin. The case study will show an owner-login link. Leave it empty until deployment is live. This does not make account APIs public.
