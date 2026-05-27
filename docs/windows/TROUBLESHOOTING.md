# Troubleshooting

## Service won't start

```powershell
Get-EventLog -LogName Application -Source 'OpenWA-API' -Newest 20
Get-Content .\logs\service-api.err.log -Tail 200
```

Most common causes:

- **Port already in use.** `Get-NetTCPConnection -LocalPort 2785` shows
  the owner. Change `API_PORT` in `.env` or stop the conflicting process.
- **Missing `dist/`.** Run `.\scripts\windows\build.ps1`.
- **Bad `.env`.** Delete `.env` and re-run `setup.ps1 -Force`.

## Dashboard loads but API calls fail with CORS

Open the browser console — if you see
`Access-Control-Allow-Origin` errors, your `CORS_ORIGINS` in `.env`
doesn't list the URL you're hitting. Add it (comma-separated) and
restart.

## QR code never appears

Chromium (Puppeteer) on Windows Server headless needs `--no-sandbox` and
a writable temp dir. Check `logs/error.log` for `Failed to launch the
browser`. If you see it:

1. Confirm `C:\Users\<svc-user>\AppData\Local\Temp` is writable by the
   service account.
2. Install the Chromium runtime deps:
   `npx puppeteer browsers install chrome`.

## Tailscale connection drops

`status.ps1` prints the current Tailscale IP. If it's blank:

```powershell
tailscale status
tailscale up
```

After re-auth, re-run `.\scripts\windows\tailscale-info.ps1` to refresh
`tailscale-info.txt`.

## RAR import says "extractor unavailable"

The default skeleton ships without `node-unrar-js`. Either install it
(`npm i node-unrar-js`) or place `7z.exe` on PATH (the extractor
auto-detects it). See `docs/windows/PLAN.md` for the deferred work.

## Chat parser produced wrong dates

The parser auto-detects format from the first 20 timestamped lines. If
your export only contains a handful of messages and the detection
landed on the wrong format, re-export the chat *with media* (which
forces full headers), or open the job's preview JSON and report a bug
with the offending `_chat.txt` first lines.
