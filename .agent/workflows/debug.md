---
description: Debugging guide for OpenWA development
---

# Debugging Workflow

Debug OpenWA application and troubleshoot common issues.

## View Container Logs

// turbo
1. View logs (follow mode):
```bash
docker logs -f openwa-dev
```

// turbo
2. View last 100 lines:
```bash
docker logs openwa-dev --tail 100
```

// turbo
3. View logs with timestamps:
```bash
docker logs openwa-dev --timestamps --tail 50
```

---

## Access Container Shell

// turbo
4. Open shell inside container:
```bash
docker exec -it openwa-dev sh
```

// turbo
5. Check WhatsApp session files:
```bash
docker exec openwa-dev ls -la /app/data/sessions
```

---

## Local Development Debugging

// turbo
6. Start with debug mode (local Node.js):
```bash
npm run start:debug
```

// turbo
7. Check TypeScript errors:
```bash
npm run build -- --noEmit
```

---

## VS Code Debugging

1. Open `.vscode/launch.json` and select "Debug NestJS"
2. Set breakpoints in your code
3. Press F5 to start debugging

---

## Common Issues & Solutions

### "Couldn't Link Device" (QR Scan Failed)

// turbo
8. Clear session data and restart:
```bash
docker exec openwa-dev rm -rf /app/data/sessions/*
docker restart openwa-dev
```

Tips:
- Generate QR and scan within 20 seconds
- Ensure phone and PC on same network
- Try with different WhatsApp account

### QR Code Not Generated

// turbo
9. Check container is running:
```bash
docker ps
```

// turbo
10. Check for Puppeteer errors:
```bash
docker logs openwa-dev 2>&1 | Select-String -Pattern "puppeteer|chrome|error"
```

### Session Disconnects Randomly

// turbo
11. Monitor container resources:
```bash
docker stats openwa-dev
```

Solutions:
- Increase shared memory: `shm_size: '2gb'` in docker-compose
- Add random delays between messages (avoid rate limiting)
- Check WebSocket connection stability

### Port Already in Use

// turbo
12. Kill Node.js processes:
```bash
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
```

// turbo
13. Find process using port 3000:
```bash
netstat -ano | findstr :3000
```

### Database Issues (SQLite)

// turbo
14. Check database file:
```bash
docker exec openwa-dev ls -la /app/data/openwa.sqlite
```

// turbo
15. Reset database (CAUTION: deletes all data):
```bash
docker exec openwa-dev rm -f /app/data/openwa.sqlite
docker restart openwa-dev
```

### Chrome Crashes in Docker

Add shared memory in docker-compose.dev.yml:
```yaml
services:
  openwa:
    shm_size: '2gb'
```

---

## WhatsApp Engine Debugging (Advanced)

For detailed Puppeteer debugging, modify `.env`:
```
PUPPETEER_HEADLESS=false
```

Then rebuild container (this won't work in Docker, only local dev).

For local development only:
```typescript
const client = new Client({
  puppeteer: {
    headless: false, // See browser window
    devtools: true,  // Open DevTools automatically
  },
});
```
