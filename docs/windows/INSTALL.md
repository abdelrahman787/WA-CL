# Installing OpenWA on Windows Server (Tailscale-only)

## Prerequisites

| Component | Version | Notes |
|-----------|---------|-------|
| Windows Server | 2019 or 2022 | Datacenter or Standard |
| Node.js | 22 LTS | https://nodejs.org/ — choose the MSI installer |
| Git | latest | https://git-scm.com/download/win |
| Tailscale | latest | https://tailscale.com/download — run `tailscale up` after install |
| NSSM *(optional)* | latest | https://nssm.cc/ — extract `nssm.exe` to `C:\Windows\System32\` to enable service install |

## One-shot install

Open **PowerShell as Administrator**, then:

```powershell
git clone <repo-url> C:\openwa
cd C:\openwa
git checkout claude/openwa-whatsapp-gateway-RL7AN
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\windows\setup.ps1
```

`setup.ps1` will:

1. Verify Node 22, Git, Tailscale.
2. Create `data/`, `data/sessions/`, `data/media/`, `data/imports/`, `logs/`.
3. Generate a secure `.env` (preserves existing keys on re-run).
4. Run `npm ci` for the backend and the dashboard.
5. Create Windows Firewall rules **scoped to the Tailscale adapter only**
   (your tailnet can reach the API; the public internet cannot).
6. Write `tailscale-info.txt` with your tailnet URLs.
7. Install `OpenWA-API` as a Windows service (if NSSM is on PATH).

After it finishes:

```powershell
.\scripts\windows\start.ps1
.\scripts\windows\status.ps1
```

## First-time QR scan from your phone

1. Make sure your phone has Tailscale installed and is signed into the
   same tailnet as the server.
2. On your phone, open `http://<tailscale-ip>:2886` (see `tailscale-info.txt`).
3. Log in with the API key printed at the end of `setup.ps1` (also stored
   in `.env` as `API_KEY`).
4. **Sessions → Create Session →** scan the QR with WhatsApp on the phone
   that will host the gateway.

## Common scripts

| Script | What it does |
|--------|--------------|
| `start.ps1` | Starts both services (or runs foreground if NSSM is absent). |
| `stop.ps1` | Stops both services gracefully. |
| `restart.ps1` | Stop + start. |
| `status.ps1` | Service status + listening ports + Tailscale IP. |
| `build.ps1` | `npm run build` for backend and dashboard. |
| `update.ps1` | `git pull` + reinstall + rebuild + restart. |
| `backup.ps1` | Compresses `data/`, `logs/`, `.env` to a timestamped ZIP. |
| `firewall-setup.ps1` | Re-applies Tailscale-scoped firewall rules. |
| `tailscale-info.ps1` | Regenerates `tailscale-info.txt`. |

All scripts are idempotent — re-running is safe.

## Without NSSM (foreground mode)

If you don't install NSSM, `start.ps1` falls back to `npm run start:prod`
in the current console. Use `Ctrl+C` to stop. This is fine for testing
but not recommended for a long-running deployment — restart-on-crash and
log rotation come from NSSM.
