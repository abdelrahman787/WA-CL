---
description: Build the OpenWA project for production
---

# Build Workflow

Build the OpenWA application for production deployment.

## Docker Build (Recommended) ✅

// turbo
1. Build production Docker image:
```bash
docker build -t openwa:latest .
```

// turbo
2. Test the production image locally:
```bash
docker run -p 3000:3000 -v ./data:/app/data openwa:latest
```

// turbo
3. Tag for registry (e.g., GitHub Container Registry):
```bash
docker tag openwa:latest ghcr.io/rmyndharis/openwa:latest
```

// turbo
4. Push to registry:
```bash
docker push ghcr.io/rmyndharis/openwa:latest
```

---

## TypeScript Build (for debugging)

// turbo
5. Build TypeScript to JavaScript:
```bash
npm run build
```

This outputs to `./dist` directory.

// turbo
6. Verify build output:
```bash
dir dist
```

// turbo
7. Start production server locally:
```bash
npm run start:prod
```

---

## Docker Compose Deployment

// turbo
8. Deploy with Docker Compose:
```bash
docker compose up -d
```

// turbo
9. Deploy with rebuild:
```bash
docker compose up --build -d
```

// turbo
10. Check deployment status:
```bash
docker compose ps
```

---

## CI/CD Build

The GitHub Actions workflow (`.github/workflows/ci.yml`) automatically:
1. Runs lint and tests
2. Builds the Docker image
3. Pushes to GitHub Container Registry

To trigger manually:
- Push to `main` or `develop` branch
- Create a Pull Request
