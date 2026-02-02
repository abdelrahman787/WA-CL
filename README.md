# OpenWA - Open Source WhatsApp API Gateway

> 🚀 Free, Open Source, Self-Hosted WhatsApp HTTP API

![License](https://img.shields.io/badge/license-MIT-green.svg)
![Node](https://img.shields.io/badge/node-20_LTS-brightgreen.svg)
![NestJS](https://img.shields.io/badge/NestJS-11.x-red.svg)
![Docker](https://img.shields.io/badge/docker-ready-blue.svg)

## 🎯 Features

**OpenWA** is an open-source alternative to WAHA that provides:

| Feature | Status |
|---------|--------|
| REST API for WhatsApp | ✅ Ready |
| Multi-session Support | ✅ Ready |
| Webhook with HMAC Signature | ✅ Ready |
| SQLite Storage | ✅ Ready |
| Docker Support | ✅ Ready |
| Swagger API Docs | ✅ Ready |
| Health Check Endpoints | ✅ Ready |
| Web Dashboard | 📝 Phase 2 |
| PostgreSQL Support | 📝 Phase 2 |
| API Key Authentication | � Phase 2 |
| Rate Limiting | 📝 Phase 2 |
| Prometheus Metrics | 📝 Phase 3 |

## � Quick Start

### Option A: Minimal Setup (SQLite, no Docker)

```bash
# Clone repository
git clone https://github.com/rmyndharis/OpenWA.git
cd OpenWA

# Install & configure
npm install
cp .env.minimal .env

# Create data directory
mkdir -p data/sessions data/media

# Run
npm run start:dev

# Access
# API: http://localhost:3000/api
# Swagger: http://localhost:3000/api/docs
# Health: http://localhost:3000/api/health
```

### Option B: Docker Deployment

```bash
# Clone repository
git clone https://github.com/rmyndharis/OpenWA.git
cd OpenWA

# Build and run
docker compose up -d

# Access
# API: http://localhost:3000/api
# Swagger: http://localhost:3000/api/docs
```

## 📡 API Examples

### Create a Session

```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"name": "my-bot"}'

# Response:
# {
#   "success": true,
#   "data": {
#     "id": "uuid...",
#     "name": "my-bot",
#     "status": "created"
#   }
# }
```

### Start Session & Get QR Code

```bash
# Start the session
curl -X POST http://localhost:3000/api/sessions/{sessionId}/start

# Get QR code (scan with WhatsApp)
curl http://localhost:3000/api/sessions/{sessionId}/qr

# Response contains base64 QR code image
```

### Send a Message

```bash
curl -X POST http://localhost:3000/api/sessions/{sessionId}/messages/send-text \
  -H "Content-Type: application/json" \
  -d '{
    "chatId": "628123456789@c.us",
    "text": "Hello from OpenWA!"
  }'
```

### Setup Webhook

```bash
curl -X POST http://localhost:3000/api/sessions/{sessionId}/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-server.com/webhook",
    "events": ["message.received", "session.status"],
    "secret": "your-hmac-secret"
  }'
```

## 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| **Runtime** | Node.js 20 LTS |
| **Framework** | NestJS 11.x |
| **Language** | TypeScript 5.x |
| **WA Engine** | whatsapp-web.js |
| **Database** | SQLite (default) / PostgreSQL |
| **ORM** | TypeORM |
| **Container** | Docker |

## 📁 Project Structure

```
openwa/
├── src/
│   ├── main.ts                 # Application entry point
│   ├── app.module.ts           # Root module
│   ├── config/                 # Configuration
│   ├── common/                 # Shared utilities
│   ├── engine/                 # WhatsApp engine abstraction
│   └── modules/
│       ├── session/            # Session management
│       ├── message/            # Message handling
│       ├── webhook/            # Webhook management
│       └── health/             # Health checks
├── _docs/                      # Documentation
├── docker-compose.yml
├── Dockerfile
└── package.json
```

## 📚 Documentation

See the `_docs/` folder for complete documentation:

- [Project Overview](./_docs/01-project-overview.md)
- [Requirements Specification](./_docs/02-requirements-specification.md)
- [System Architecture](./_docs/03-system-architecture.md)
- [API Specification](./_docs/04-api-specification.md)
- [Database Design](./_docs/05-database-design.md)

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

See [Development Guidelines](./_docs/08-development-guidelines.md) for coding standards.

## 📄 License

MIT License - Free for personal and commercial use.

---

<div align="center">

**OpenWA** - Free, Open Source WhatsApp API Gateway

[Documentation](./_docs/README.md) · [API Docs](http://localhost:3000/api/docs) · [Report Bug](https://github.com/rmyndharis/OpenWA/issues)

</div>
