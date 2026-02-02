---
description: Git workflow and commit conventions for OpenWA
---

# Git Workflow

Follow the Git workflow conventions for contributing to OpenWA.

## Branch Naming

```
main            # Production-ready code
develop         # Integration branch
feature/*       # New features
bugfix/*        # Bug fixes
hotfix/*        # Production hotfixes
release/*       # Release preparation
```

**Examples:**
- `feature/session-management`
- `feature/webhook-retry`
- `bugfix/qr-code-timeout`
- `hotfix/security-patch`
- `release/1.0.0`

## Creating a New Feature Branch

// turbo
1. Checkout develop:
```bash
git checkout develop
```

// turbo
2. Pull latest changes:
```bash
git pull origin develop
```

// turbo
3. Create feature branch:
```bash
git checkout -b feature/your-feature-name
```

## Commit Message Convention

Format:
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`:     New feature
- `fix`:      Bug fix
- `docs`:     Documentation
- `style`:    Formatting (no code change)
- `refactor`: Code refactoring
- `test`:     Adding tests
- `chore`:    Maintenance

**Examples:**
```
feat(session): add multi-session support

- Implement session manager for multiple sessions
- Add session limit configuration
- Update documentation

Closes #123
```

```
fix(webhook): handle timeout errors gracefully

Previously, webhook timeouts would crash the worker.
Now they are caught and logged properly.

Fixes #456
```

## Pre-commit Checklist

// turbo
4. Run linter:
```bash
npm run lint
```

// turbo
5. Run tests:
```bash
npm test
```

// turbo
6. Stage changes:
```bash
git add .
```

// turbo
7. Commit with message:
```bash
git commit -m "feat(scope): add amazing feature"
```

// turbo
8. Push to remote:
```bash
git push origin feature/your-feature-name
```

## Pull Request Checklist

- [ ] Code follows project style guide
- [ ] Tests added/updated and passing
- [ ] Documentation updated
- [ ] Lint passes
- [ ] Self-reviewed
- [ ] No console.log statements
- [ ] Error handling is proper
- [ ] No hardcoded values
