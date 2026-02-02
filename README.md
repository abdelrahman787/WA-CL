# OpenWA - Open Source WhatsApp API Gateway

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT">
  <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg" alt="Node.js Version">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome">
</p>

**OpenWA** is a free, self-hosted WhatsApp HTTP API gateway that enables developers to integrate WhatsApp messaging capabilities into their applications through a simple REST API.

## ✨ Features

- 🚀 **Simple REST API** - Easy-to-use HTTP endpoints for sending messages
- 📱 **Multi-Session Support** - Manage multiple WhatsApp sessions
- 🔄 **Webhook Callbacks** - Real-time notifications for incoming messages
- 🔐 **Secure by Design** - API key authentication and encryption
- 📊 **Dashboard** - Web-based admin panel for session management
- 🐳 **Docker Ready** - Easy deployment with Docker & Docker Compose

## 📋 Requirements

- Node.js 20 LTS or higher
- npm 10+
- Docker & Docker Compose (optional, for containerized deployment)

## 🚀 Quick Start

```bash
# Clone repository
git clone https://github.com/rmyndharis/OpenWA.git
cd openwa

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start infrastructure services (optional for development)
docker compose up -d postgres redis

# Run database migrations
npm run migration:run

# Start development server
npm run start:dev
```

## 📁 Project Structure

```
openwa/
├── src/                    # Source code
│   ├── common/             # Shared utilities
│   ├── config/             # Configuration
│   ├── modules/            # Feature modules
│   ├── engine/             # WhatsApp engine
│   ├── queue/              # Job queues
│   └── database/           # Database
├── test/                   # Tests
├── dashboard/              # Frontend dashboard
├── docs/                   # Documentation
├── docker/                 # Docker files
└── _docs/                  # Planning documentation
```

## 📚 Documentation

Detailed documentation is available in the `_docs/` directory:

- [Requirements Specification](./_docs/02-requirements-specification.md)
- [API Specification](./_docs/03-api-specification.md)
- [System Architecture](./_docs/04-system-architecture.md)
- [Database Design](./_docs/05-database-design.md)
- [Security Design](./_docs/06-security-design.md)
- [DevOps & Infrastructure](./_docs/07-devops-infrastructure.md)
- [Development Guidelines](./_docs/08-development-guidelines.md)

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Make changes following our [development guidelines](./_docs/08-development-guidelines.md)
4. Write/update tests
5. Commit: `git commit -m 'feat(scope): add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Open Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This project is not affiliated, associated, authorized, endorsed by, or in any way officially connected with WhatsApp or any of its subsidiaries or affiliates. Use at your own risk.

---

<p align="center">
  Made with ❤️ by Yudhi Armyndharis and the OpenWA Community
</p>
