# Configuration

## Single-port deployment (recommended on Windows)

The API process serves the compiled dashboard directly, so **one port
(`API_PORT`, default 2785) serves both the UI and the API**. There is no
second static server, no reverse proxy, and no CORS to configure:

- Dashboard: `http://<tailscale-ip>:2785/`
- API:       `http://<tailscale-ip>:2785/api`
- Swagger:   `http://<tailscale-ip>:2785/api/docs`

The frontend calls the API at the relative path `/api`, so it always
talks to the same origin it was served from — no hardcoded IP, ever.
`build.ps1` copies `dashboard/dist` into `dist/public`, which the backend
serves (SPA deep links fall back to `index.html`). To disable static
serving and run the API headless, set `SERVE_DASHBOARD=false`.

`DASHBOARD_PORT` is only relevant if you choose to run a separate static
server for the UI; the single-port setup ignores it.

### The API key

On first boot OpenWA seeds an admin key. Precedence:

1. `API_KEY` from `.env` (recommended — pins a stable, known key so the
   dashboard login and `.env` always agree);
2. a predictable dev key when `NODE_ENV` is not `production`;
3. a random `owa_k1_...` key in production.

The seeded key is also written to `data/.api-key` and printed in the
startup banner. To rotate it, stop the service, delete the `api_keys`
row (or the whole `data/main.sqlite`) plus `data/.api-key`, set the new
`API_KEY` in `.env`, and restart.

---

OpenWA reads configuration in this priority order (highest wins):

1. **Real process environment** (set by Windows service / shell)
2. **`.env`** in the repo root (managed by you)
3. **`data/.env.generated`** (managed by the Dashboard)

`setup.ps1` writes to `.env`. Sensitive values (`API_KEY`, `JWT_SECRET`,
`WEBHOOK_SECRET`, `SESSION_SECRET`) are generated with
`RandomNumberGenerator` on first run and preserved on re-run. Pass
`-Force` to regenerate.

## Key variables

| Key | Default | Purpose |
|-----|---------|---------|
| `NODE_ENV` | `production` | Disables verbose errors, enables HSTS. |
| `API_PORT` | `2785` | Backend HTTP/WS port. |
| `DASHBOARD_PORT` | `2886` | Dashboard static port. |
| `API_HOST` | `0.0.0.0` | Bind address. Keep `0.0.0.0` so Tailscale can reach it; the firewall rules restrict who can connect. |
| `API_KEY` | random hex | Default API key for the dashboard login. |
| `JWT_SECRET` | random hex | JWT signing. |
| `WEBHOOK_SECRET` | random hex | Outbound webhook HMAC. |
| `SESSION_SECRET` | random hex | Reserved for future cookie sessions. |
| `DATABASE_TYPE` | `sqlite` | `sqlite` (default) or `postgres`. |
| `STORAGE_TYPE` | `local` | `local` or `s3`. |
| `STORAGE_PATH` | `./data/media` | Local storage root. |
| `SESSIONS_PATH` | `./data/sessions` | WhatsApp session files. |
| `LOG_LEVEL` | `info` | `error` `warn` `info` `debug`. |
| `LOG_PATH` | `./logs` | Where the logger writes. |
| `TAILSCALE_IP` | auto-detected | Surfaced for `tailscale-info.txt`. |
| `CORS_ORIGINS` | `http://<ts-ip>:2886,http://localhost:2886` | Comma-separated allow-list. `*` disables the check (not recommended on a public box). |

## Tailscale

The firewall rules added by `firewall-setup.ps1` are scoped to the
adapter named `Tailscale`. If you renamed it (e.g. via Hyper-V virtual
switch), re-run:

```powershell
.\scripts\windows\firewall-setup.ps1 -AdapterAlias 'Your-Adapter-Name'
```

The Tailscale IP usually stays stable for the lifetime of the node. If
it ever changes (re-auth on a new tailnet, MagicDNS rename, etc.),
re-run `setup.ps1 -Force` to refresh `.env` and `tailscale-info.txt`.

## Switching SQLite → Postgres

1. Stop the service: `.\scripts\windows\stop.ps1`
2. Edit `.env`:
   ```
   DATABASE_TYPE=postgres
   POSTGRES_HOST=...
   POSTGRES_PORT=5432
   POSTGRES_USER=...
   POSTGRES_PASSWORD=...
   DATABASE_SYNCHRONIZE=false
   ```
3. Run migrations: `npm run migration:run:prod`
4. `.\scripts\windows\start.ps1`

## Webhook secret

When you create a webhook, the API signs outbound requests with
`WEBHOOK_SECRET` using HMAC-SHA256. Validate the `X-OpenWA-Signature`
header on your receiver. See `docs/06-api-specification.md`.
