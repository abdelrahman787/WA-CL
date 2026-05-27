# Windows / Tailscale Deployment + WhatsApp Chat Import — Implementation Plan

This document is the roadmap for the work scoped in the
`claude/openwa-whatsapp-gateway-RL7AN` branch. It records what was
delivered as a skeleton and what remains for follow-up sessions.

> **Status legend:** ✅ implemented · 🟡 skeleton (compiles, stubs marked
> `TODO`) · ⏳ not yet started · ✳️ already present in upstream codebase.

---

## Snapshot of the existing codebase

Before adding anything, the audit found these features were **already**
in place — the original prompt over-specified work that's done:

| Area | State | Notes |
|---|---|---|
| Helmet + CSP | ✳️ | `src/main.ts` |
| CORS w/ allow-list | ✳️ | `CORS_ORIGINS` env, `src/main.ts` |
| Health endpoints | ✳️ | `/api/health`, `/api/health/live`, `/api/health/ready` |
| Swagger | ✳️ | `/api/docs` with `X-API-Key` auth |
| WebSocket gateway | ✳️ | `src/modules/events/events.gateway.ts` |
| Auth + API keys | ✳️ | `src/modules/auth` |
| Rate limiting | ✳️ | `@nestjs/throttler` configured |
| TypeORM (sqlite/pg) | ✳️ | Dual datasource: `main` (auth/audit), `data` (app) |
| Dashboard responsive layout | ✳️ | `dashboard/src/components/Layout.tsx` |
| Dark mode + i18n | ✳️ | `useTheme`, `react-i18next` |
| Dashboard pages | ✳️ | Sessions / Webhooks / Logs / Infra / Plugins / MessageTester |
| Graceful shutdown | ✳️ | `ShutdownService` |
| Plugin system | ✳️ | `src/core/plugins` |

**What was genuinely missing** and is delivered (or scaffolded) here:

1. Windows-native operations: PowerShell scripts, NSSM/node-windows
   service install, firewall rules scoped to Tailscale adapter.
2. Tailscale-aware bootstrap (IP detection, CORS hint, info file).
3. WhatsApp **Chat Import** module (backend) — full type model + parser +
   media matcher logic; extractors stubbed pending optional deps.
4. Chat Import wizard pages on the dashboard (skeleton).

---

## Delivered in this branch

### Windows operations (✅)

`scripts/windows/`
- `setup.ps1` — master setup (Node check, deps, dirs, `.env`, firewall, service)
- `start.ps1` / `stop.ps1` / `restart.ps1` / `status.ps1`
- `build.ps1` — backend + dashboard build
- `update.ps1` — `git pull` + rebuild + restart
- `backup.ps1` — SQLite + sessions + media archive
- `firewall-setup.ps1` — Tailscale-scoped inbound rules
- `install-service.ps1` — NSSM-based Windows service install
- `tailscale-info.ps1` — emit `tailscale-info.txt`

Docs in `docs/windows/`:
- `INSTALL.md`, `CONFIGURATION.md`, `TROUBLESHOOTING.md`, `API-QUICKSTART.md`

### Backend: Import module (🟡 skeleton)

`src/modules/import/` — wired into `AppModule`, builds, endpoints
respond. Heavy lifting (RAR/ZIP extraction) is stubbed and gated on
optional deps.

| File | State |
|---|---|
| `import.module.ts` | ✅ |
| `import.controller.ts` | ✅ all endpoints declared, validated DTOs |
| `import.service.ts` | 🟡 orchestrates job lifecycle; commit step `TODO` |
| `import.gateway.ts` | ✅ WebSocket room `import:{jobId}` |
| `parsers/date-parser.util.ts` | ✅ auto-detect US / EU / ISO / Arabic-Indic digits |
| `parsers/chat-parser.service.ts` | ✅ streaming line parser, multi-line, system msgs |
| `parsers/media-matcher.service.ts` | ✅ 4 strategies (exact / date / sequence / type) |
| `extractors/zip-extractor.service.ts` | 🟡 stub — needs `unzipper` |
| `extractors/rar-extractor.service.ts` | 🟡 stub — shells out to `7z.exe` if present |
| `entities/*.entity.ts` | ✅ ImportJob, ImportedMessage |
| `dto/*.dto.ts` | ✅ all DTOs class-validator-decorated |
| `interfaces/*.ts` | ✅ |

### Dashboard: Import wizard (🟡 skeleton)

`dashboard/src/pages/Import/`
- `ImportWizard.tsx` — step state machine
- `steps/Step1Upload.tsx` — drag/drop + plain file input
- `steps/Step2Processing.tsx` — live progress via socket
- `steps/Step3Preview.tsx` — message list (no virtualization yet)
- `steps/Step4MapUsers.tsx` — per-participant mapping cards
- `steps/Step5Settings.tsx`
- `steps/Step6Importing.tsx`
- `steps/Step7Done.tsx`
- `ChatViewer.tsx` (`/chats/:chatId`) — WhatsApp-style bubble list
- `ImportHistory.tsx` (`/import/history`)

Route + nav entry added in `App.tsx` and `Layout.tsx`.

---

## Deferred (next sessions)

1. **Wire optional native deps** — `unzipper`, `node-unrar-js`, `multer`,
   `fuse.js`, `react-window`, `react-dropzone`, `sharp`, `fluent-ffmpeg`.
   Each gated behind capability checks so the build stays green without
   them.
2. **Real extraction** — implement `ZipExtractor` w/ `unzipper` streaming,
   `RarExtractor` via `node-unrar-js` (fallback to `7z.exe` on Windows).
3. **Commit step** — `ImportService.confirm()` currently records the job
   as complete without writing to the live chat tables. Needs a
   transformer that emits real Message rows under a synthetic Session.
4. **Virtualization** — preview list + chat viewer need `react-window`
   for 10k+ message performance.
5. **PWA** — manifest, service worker, icons. Layout is already
   responsive but no installability yet.
6. **Pull-to-refresh + swipe nav** on mobile.
7. **NSSM auto-download** — `install-service.ps1` currently expects
   NSSM on PATH; add a bootstrap that downloads it from `nssm.cc`.
8. **Tests** — `chat-parser.service.spec.ts` is stubbed with one date
   case; needs the full matrix (US/EU/ISO, Arabic-Indic, multi-line,
   omitted media, system messages).
9. **Arabic RTL** in chat viewer — detection helper exists in parser;
   UI needs to apply `dir="rtl"` per-bubble.

---

## File index (created or modified)

```
docs/windows/
  PLAN.md                          (this file)
  INSTALL.md
  CONFIGURATION.md
  TROUBLESHOOTING.md
  API-QUICKSTART.md

scripts/windows/
  setup.ps1
  start.ps1 stop.ps1 restart.ps1 status.ps1
  build.ps1 update.ps1 backup.ps1
  firewall-setup.ps1
  install-service.ps1
  tailscale-info.ps1

src/modules/import/
  import.module.ts
  import.controller.ts
  import.service.ts
  import.gateway.ts
  parsers/date-parser.util.ts
  parsers/chat-parser.service.ts
  parsers/media-matcher.service.ts
  extractors/zip-extractor.service.ts
  extractors/rar-extractor.service.ts
  entities/import-job.entity.ts
  entities/imported-message.entity.ts
  dto/upload-import.dto.ts
  dto/confirm-import.dto.ts
  dto/user-mapping.dto.ts
  interfaces/parsed-message.interface.ts
  interfaces/import-progress.interface.ts
  chat-parser.spec.ts

src/app.module.ts                  (+ ImportModule)

dashboard/src/pages/Import/
  ImportWizard.tsx + ImportWizard.css
  steps/Step1Upload.tsx … Step7Done.tsx
  ChatViewer.tsx
  ImportHistory.tsx

dashboard/src/App.tsx              (+ routes)
dashboard/src/components/Layout.tsx (+ nav entry)
```
