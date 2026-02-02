---
description: Run tests for OpenWA project (unit, integration, e2e)
---

# Testing Workflow

Run various test suites for the OpenWA project.

## Running Tests in Docker (Recommended)

// turbo
1. Run tests inside container:
```bash
docker exec openwa-dev npm run test
```

// turbo
2. Run tests with coverage:
```bash
docker exec openwa-dev npm run test:cov
```

---

## Running Tests Locally

Requires `npm install` to be run first.

// turbo
3. Run all unit tests:
```bash
npm run test
```

// turbo
4. Run tests with coverage report:
```bash
npm run test:cov
```

// turbo
5. Run tests in watch mode (during development):
```bash
npm run test:watch
```

// turbo
6. Run a specific test file:
```bash
npm test -- <filename>.spec.ts
```

---

## E2E Tests

// turbo
7. Run end-to-end tests:
```bash
npm run test:e2e
```

---

## Manual API Testing

Use the test-client.html for quick manual testing:

```bash
start test-client.html
```

Or use Swagger UI at http://localhost:3000/api/docs

### Quick API Tests with PowerShell

// turbo
8. Test health endpoint:
```bash
Invoke-WebRequest -Uri http://localhost:3000/api/health -UseBasicParsing | Select-Object -ExpandProperty Content
```

// turbo
9. List sessions:
```bash
Invoke-WebRequest -Uri http://localhost:3000/api/sessions -UseBasicParsing | Select-Object -ExpandProperty Content
```

---

## Test Coverage Requirements

| Type             | Minimum Coverage |
|------------------|------------------|
| Unit Tests       | 80%              |
| Integration Tests| 60%              |
| E2E Tests        | Critical paths   |
