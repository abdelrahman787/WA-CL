---
description: Initial setup for OpenWA development environment
---

# Development Environment Setup

Complete setup guide for new developers.

## Prerequisites

- **Docker Desktop** (required) - for running OpenWA with Chromium
- **Git** - for version control
- **Node.js 20 LTS** (optional) - only needed for bare development

## Quick Start (Docker) ✅

This is the recommended setup - everything runs in Docker.

1. Clone repository:
```bash
git clone https://github.com/rmyndharis/OpenWA.git
cd OpenWA
```

2. Create data directories:
```bash
mkdir -p data/sessions data/media
```

// turbo
3. Start the development container:
```bash
docker compose -f docker-compose.dev.yml up --build -d
```

// turbo
4. Verify it's running:
```bash
docker ps
```

5. Access Swagger UI:
- Open http://localhost:3000/api/docs in browser

6. Test with test-client:
```bash
start test-client.html
```

---

## Alternative: Bare Node.js Setup

Use this only if you prefer local development without Docker.

// turbo
1. Install dependencies:
```bash
npm install --legacy-peer-deps
```

2. Copy environment file:
```bash
copy .env.minimal .env
```

3. Install Puppeteer browsers:
```bash
npx puppeteer browsers install chrome
```

// turbo
4. Start development server:
```bash
npm run start:dev
```

---

## Environment Profiles

### Minimal Profile (Default for Development)
- **Database**: SQLite (zero config, file: `./data/openwa.sqlite`)
- **Storage**: Local filesystem (`./data/media`)
- **Container**: Single Docker container

### Production Profile
- **Database**: PostgreSQL
- **Storage**: S3 compatible
- **Container**: Multiple services via docker-compose.yml

---

## VS Code Recommended Extensions

Install these for better development experience:
- ESLint
- Prettier
- Docker
- REST Client
