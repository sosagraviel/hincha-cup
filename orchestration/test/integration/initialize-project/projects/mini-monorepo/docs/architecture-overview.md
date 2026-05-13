# Architecture overview

Mini-monorepo is a thin demo of the gira topology. Five services:

```
┌───────────────┐    REST     ┌───────────────┐
│ web-frontend  │ ──────────► │ backend       │
│ (Vite+React)  │ ◄──────JWT─ │ (NestJS 11)   │
└──────┬────────┘             └────┬──────────┘
       │                           │
       │  redirects                ▼
       └──────► ┌───────────┐  ┌────────────┐
               │ keycloak  │  │ postgres   │
               │ (auth)    │  │ + typeorm  │
               └───────────┘  └────────────┘
                              │
                              ▼
                          ┌────────────┐
                          │ redis      │
                          │ (bullmq)   │
                          └────────────┘
```

The `shared` package houses cross-service types. The `seeds` CLI runs
once during `make setup` to populate dev data.

## Request lifecycle (backend)

1. HTTP request hits NestJS controller (e.g. `UsersController.create`).
2. `AuthGuard` verifies the JWT against Keycloak's JWKS endpoint.
3. Controller delegates to the service (e.g. `UsersService.create`).
4. Service writes to Postgres via TypeORM repository.
5. Outbox event published; cron flushes to Redis Streams.
