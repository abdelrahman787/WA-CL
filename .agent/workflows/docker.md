---
description: Docker commands for OpenWA development and deployment
---

# Docker Workflow

Manage Docker containers for OpenWA.

## Development Container

// turbo
1. Start development environment:
```bash
docker compose -f docker-compose.dev.yml up -d
```

// turbo
2. Start with rebuild (after code changes):
```bash
docker compose -f docker-compose.dev.yml up --build -d
```

// turbo
3. View logs (follow mode):
```bash
docker logs -f openwa-dev
```

// turbo
4. Stop development container:
```bash
docker compose -f docker-compose.dev.yml down
```

---

## Production Deployment

// turbo
5. Start production stack:
```bash
docker compose up -d
```

// turbo
6. Stop production stack:
```bash
docker compose down
```

// turbo
7. Stop and remove volumes (CAUTION: deletes data):
```bash
docker compose down -v
```

---

## Building Images

// turbo
8. Build production image:
```bash
docker build -t openwa:latest .
```

// turbo
9. Build development image:
```bash
docker build -f Dockerfile.dev -t openwa:dev .
```

---

## Container Management

// turbo
10. View running containers:
```bash
docker ps
```

// turbo
11. View all containers (including stopped):
```bash
docker ps -a
```

// turbo
12. Restart container:
```bash
docker restart openwa-dev
```

// turbo
13. Monitor resource usage:
```bash
docker stats
```

// turbo
14. Execute command inside container:
```bash
docker exec -it openwa-dev sh
```

---

## Session Data Management

// turbo
15. Clear session data (forces new QR scan):
```bash
docker exec openwa-dev rm -rf /app/data/sessions/*
docker restart openwa-dev
```

// turbo
16. Backup session data:
```bash
docker cp openwa-dev:/app/data ./backup-data
```

---

## Troubleshooting

### Container Won't Start

// turbo
17. Check container logs:
```bash
docker logs openwa-dev --tail 100
```

### Port Already in Use

// turbo
18. Find and kill process on port 3000:
```bash
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
```

### Chrome/Puppeteer Issues

The container uses Chromium with these settings:
- `--no-sandbox`
- `--disable-setuid-sandbox`
- `--disable-dev-shm-usage`

If you see memory errors, increase shared memory:
```yaml
# In docker-compose.dev.yml
services:
  openwa:
    shm_size: '2gb'
```

### "Couldn't Link Device" Error

1. Clear session data (step 15)
2. Restart container
3. Generate new QR code quickly
4. Scan within 20 seconds
