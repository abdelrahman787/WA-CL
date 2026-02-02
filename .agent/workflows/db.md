---
description: Database migrations and management for OpenWA
---

# Database Management Workflow

Manage database migrations and TypeORM operations.

## Migrations

// turbo
1. Show migration status:
```bash
npm run migration:show
```

// turbo
2. Run pending migrations:
```bash
npm run migration:run
```

// turbo
3. Revert last migration:
```bash
npm run migration:revert
```

// turbo
4. Generate migration from entity changes:
```bash
npm run migration:generate -- -n MigrationName
```

// turbo
5. Create empty migration:
```bash
npm run migration:create -- -n MigrationName
```

## Docker Database Services

// turbo
6. Start PostgreSQL and Redis:
```bash
docker compose up -d postgres redis
```

// turbo
7. Stop services:
```bash
docker compose down
```

// turbo
8. View database logs:
```bash
docker compose logs -f postgres
```

## Debugging Queries

Enable TypeORM query logging by adding to `.env`:
```
DEBUG=typeorm:query
```

## Troubleshooting

### Connection Pool Exhausted
If you see "too many clients already" error, adjust pool settings in TypeORM config:
- `max: 20` (default is 10)
- `connectionTimeoutMillis: 5000`
- `idleTimeoutMillis: 30000`

### Migration Fails ("relation already exists")
1. Check migration status: `npm run migration:show`
2. Revert if needed: `npm run migration:revert`
3. Regenerate: `npm run migration:generate -- -n FixMigration`
