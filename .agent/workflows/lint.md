---
description: Run linting and formatting checks for OpenWA
---

# Linting & Formatting Workflow

Check and fix code quality issues using ESLint and Prettier.

## Linting

// turbo
1. Check for lint errors:
```bash
npm run lint
```

// turbo
2. Auto-fix lint errors:
```bash
npm run lint -- --fix
```

## TypeScript Type Checking

// turbo
3. Check for TypeScript errors without building:
```bash
npm run build -- --noEmit
```

## Formatting

// turbo
4. Format code with Prettier:
```bash
npm run format
```

## Code Quality Rules

Key rules from `.eslintrc.js`:
- `@typescript-eslint/explicit-function-return-type`: warn
- `@typescript-eslint/no-explicit-any`: warn
- `@typescript-eslint/no-unused-vars`: error (except `_` prefix)
- `no-console`: warn
