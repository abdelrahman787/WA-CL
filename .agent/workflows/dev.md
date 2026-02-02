---
description: Start the development server for OpenWA
---

# Development Server

Start OpenWA development environment using Docker (recommended) or bare Node.js.

## Option A: Docker (Recommended) ✅

Docker provides a clean environment with all dependencies including Chrome/Puppeteer.

### Prerequisites
- Docker Desktop running
- No other service using port 3000

### Steps

// turbo
1. Start development container:
```bash
docker compose -f docker-compose.dev.yml up -d
```

// turbo
2. View logs:
```bash
docker logs -f openwa-dev
```

// turbo
3. Stop container:
```bash
docker compose -f docker-compose.dev.yml down
```

### After Code Changes

// turbo
4. Rebuild and restart:
```bash
docker compose -f docker-compose.dev.yml up --build -d
```

---

## Option B: Bare Node.js (Alternative)

Use this for faster iteration when not using WhatsApp features.

### Prerequisites
1. Node.js 20 LTS installed
2. Chrome/Chromium installed (for Puppeteer)
3. `.env` file exists

### Steps

// turbo
5. Install dependencies:
```bash
npm install --legacy-peer-deps
```

// turbo
6. Start development server:
```bash
npm run start:dev
```

---

## Access Points

- **API**: http://localhost:3000/api
- **Swagger Docs**: http://localhost:3000/api/docs
- **Health Check**: http://localhost:3000/api/health

## Test Client

Open `test-client.html` in browser for quick testing:
```bash
start test-client.html
```
