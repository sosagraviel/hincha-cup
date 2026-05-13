# Getting Started

A more detailed walkthrough than the top-level README.

## Prerequisites

- Node 22
- pnpm 10.2.1
- Docker (with compose v2)

## Bootstrap

```bash
pnpm install
make setup       # docker compose up + migrations + seed
make dev         # start backend + frontend
```

## Verification

Once `make dev` is running, point your browser at:

- Backend API: http://localhost:3050/health
- Web frontend: http://localhost:5173
- Keycloak admin: http://localhost:7080
