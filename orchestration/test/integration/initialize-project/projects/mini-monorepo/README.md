# mini-monorepo

A small monorepo fixture mimicking a typical project shape: NestJS backend +
Vite/React frontend + Keycloak auth + shared workspace package + DB
seeds CLI. Deliberately small in source code (≤ 30 src files) but
production-realistic in surrounding configuration.

## Getting Started

```bash
# install + spin up infra + seed
make setup

# run backend + frontend together
make dev

# run tests
make test

# run e2e against running services
make test.e2e
```

## Services

| id           | path                       | type           | language    | port |
| ------------ | -------------------------- | -------------- | ----------- | ---- |
| backend      | services/backend           | backend        | typescript  | 3050 |
| web-frontend | services/web-frontend      | frontend       | typescript  | 5173 |
| shared       | services/shared            | library        | typescript  | —    |
| keycloak     | services/keycloak          | infrastructure | —           | 7080 |
| seeds        | services/seeds             | cli            | typescript  | —    |

See `docs/architecture-overview.md` for cross-service flows.
