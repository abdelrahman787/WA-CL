# OpenWA - Open Source WhatsApp API Gateway

> 🚀 Free, Open Source, Self-Hosted WhatsApp HTTP API

![License](https://img.shields.io/badge/license-MIT-green.svg)
![Node](https://img.shields.io/badge/node-20_LTS-brightgreen.svg)
![NestJS](https://img.shields.io/badge/NestJS-10.x-red.svg)
![Docker](https://img.shields.io/badge/docker-ready-blue.svg)

## 📚 Documentation Index

OpenWA planning documentation is organized into separate documents for easier reading:

### Core Planning Documents

| No | Document | Description | Status |
|----|----------|-------------|--------|
| 01 | [Project Overview](./01-project-overview.md) | Vision, mission, goals, and scope | ✅ |
| 02 | [Requirements Specification](./02-requirements-specification.md) | Functional & non-functional requirements | ✅ |
| 03 | [System Architecture](./03-system-architecture.md) | High-level & detailed architecture design | ✅ |
| 04 | [API Specification](./04-api-specification.md) | REST API & WebSocket endpoints | ✅ |
| 05 | [Database Design](./05-database-design.md) | Data model & schema design | ✅ |
| 06 | [Security Design](./06-security-design.md) | Security architecture & best practices | ✅ |
| 07 | [DevOps & Infrastructure](./07-devops-infrastructure.md) | CI/CD, Docker, monitoring & observability | ✅ |
| 08 | [Development Guidelines](./08-development-guidelines.md) | Coding standards, Git workflow, troubleshooting | ✅ |
| 09 | [Project Roadmap](./09-project-roadmap.md) | Milestones, timeline, & release plan | ✅ |
| 10 | [Risk Management](./10-risk-management.md) | Risk analysis & mitigation strategies | ✅ |
| 11 | [Testing Strategy](./11-testing-strategy.md) | Unit, integration, E2E & performance testing | ✅ |

### Technical Implementation

| No | Document | Description | Status |
|----|----------|-------------|--------|
| 12 | [Migration Guide](./12-migration-guide.md) | Database migration, version upgrades, data transfer | ✅ |
| 13 | [Troubleshooting FAQ](./13-troubleshooting-faq.md) | Common issues, diagnostics, solutions | ✅ |
| 14 | [API Collection](./14-api-collection.md) | Complete API reference with examples | ✅ |
| 15 | [SDK Design](./15-sdk-design.md) | TypeScript, Python, PHP SDK specifications | ✅ |
| 16 | [Dashboard Design](./16-dashboard-design.md) | Web dashboard wireframes & components | ✅ |
| 17 | [Plugin Architecture](./17-plugin-architecture.md) | Plugin system design & SDK | ✅ |

### Operations & Community

| No | Document | Description | Status |
|----|----------|-------------|--------|
| 18 | [Operational Runbooks](./18-operational-runbooks.md) | SOPs for incidents, maintenance, backups | ✅ |
| 19 | [Glossary](./19-glossary.md) | Terms, abbreviations, definitions | ✅ |
| 20 | [Community Guidelines](./20-community-guidelines.md) | Contributing, code of conduct, governance | ✅ |

## 🚀 Quick Start

### Option A: Minimal Setup (SQLite, no Docker services)

```bash
# Clone repository
git clone https://github.com/rmyndharis/OpenWA.git
cd openwa

# Install & configure
npm install
cp .env.minimal .env    # SQLite + Local Storage + In-Memory Cache

# Run
npm run migration:run
npm run start:dev

# Access
# API: http://localhost:3000
# Swagger: http://localhost:3000/api/docs
```

### Option B: Standard Setup (PostgreSQL + Redis)

```bash
# Clone repository
git clone https://github.com/rmyndharis/OpenWA.git
cd openwa

# Start with Docker (recommended)
docker compose up -d

# OR start manually
npm install
cp .env.example .env
docker compose up -d postgres redis
npm run migration:run
npm run start:dev

# Access
# API: http://localhost:3000
# Swagger: http://localhost:3000/api/docs
# Dashboard: http://localhost:5173
```

## 📡 API Example

```bash
# Create a session
curl -X POST http://localhost:3000/api/sessions \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: req_1706868000000" \
  -d '{"name": "my-bot"}'

# Response contains: data.id (sessionId), e.g., sess_abc123

# Send a message
curl -X POST http://localhost:3000/api/sessions/sess_abc123/messages/send-text \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: req_1706868000001" \
  -d '{"chatId": "628123456789@c.us", "text": "Hello from OpenWA!"}'
```

## 🔌 WebSocket Example

```javascript
const ws = new WebSocket('ws://localhost:3000/ws?apiKey=your-api-key');
let pingInterval = null;

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'subscribe',
    payload: {
      sessionId: 'sess_abc123',
      events: ['message.received', 'session.status']
    },
    requestId: 'req_001'
  }));

  pingInterval = setInterval(() => {
    ws.send(JSON.stringify({ type: 'ping', requestId: `ping_${Date.now()}` }));
  }, 30000);
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'event') {
    console.log('Event:', msg.payload.event, msg.payload.data);
  }
};

ws.onclose = () => {
  if (pingInterval) clearInterval(pingInterval);
};
```

## 🎯 Features

**OpenWA** is an open-source alternative to WAHA that provides:

| Feature | Status |
|---------|--------|
| REST API for WhatsApp | 📝 Planned |
| WebSocket Real-time Events | 📝 Planned |
| Multi-session Support | 📝 Planned |
| Web Dashboard | 📝 Planned |
| Docker Support | 📝 Planned |
| Webhook with HMAC Signature | 📝 Planned |
| PostgreSQL/SQLite Storage | 📝 Planned |
| Rate Limiting | 📝 Planned |
| API Key Authentication | 📝 Planned |
| IP Whitelisting | 📝 Planned |
| Prometheus Metrics | 📝 Planned |
| Grafana Dashboards | 📝 Planned |

## 🛠 Tech Stack

| Layer | Technology | Options |
|-------|------------|---------|
| **Runtime** | Node.js 20 LTS | - |
| **Framework** | NestJS 10.x | - |
| **WA Engine** | whatsapp-web.js | Baileys (alternative) |
| **Database** | SQLite / PostgreSQL | Choose based on needs |
| **Storage** | Local / S3 / MinIO | Choose based on needs |
| **Cache/Queue** | In-Memory / Redis | Choose based on needs |
| **Dashboard** | React + Vite + Tailwind + shadcn/ui | - |
| **Container** | Docker + Docker Compose | - |
| **Monitoring** | Prometheus + Grafana + Loki | Optional |

### 📦 Deployment Profiles

OpenWA can be tailored to the available resources:

| Profile | Database | Storage | Cache | Best For |
|---------|----------|---------|-------|----------|
| **🪶 Minimal** | SQLite | Local | In-Memory | Personal bot, 512MB VPS |
| **⚡ Standard** | PostgreSQL | Local | Redis | Small business, 5-10 sessions |
| **🏢 Enterprise** | PostgreSQL | S3/MinIO | Redis | Agency, horizontal scaling |

> 📖 Configuration details: [System Architecture - Pluggable Adapters](./03-system-architecture.md#312-pluggable-adapters)

## 📁 Project Structure

```
openwa/
├── src/                    # Backend source code
│   ├── modules/            # Feature modules (session, message, webhook)
│   ├── engine/             # WhatsApp engine abstraction
│   ├── common/             # Shared utilities
│   └── config/             # Configuration
├── dashboard/              # Frontend React app
├── docker/                 # Docker configurations
├── monitoring/             # Prometheus, Grafana configs
├── test/                   # Unit, integration, E2E tests
└── _docs/                  # This documentation
```

## 🤝 Contributing

See [Development Guidelines](./08-development-guidelines.md) for:
- Environment setup
- Coding standards
- Git workflow
- Testing guidelines
- Debugging tips

See [Community Guidelines](./20-community-guidelines.md) for:
- Code of conduct
- Contributing guidelines
- Pull request process
- RFC process
- Security policy

## 📄 License

MIT License - Free for personal and commercial use.

---

<div align="center">

**[Start Reading: 01 - Project Overview →](./01-project-overview.md)**

---

*OpenWA Documentation · Last updated: 2026-02-02*

</div>
