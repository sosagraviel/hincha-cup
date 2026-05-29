# Cross-Service Analysis Notes

A non-standard top-level doc that mimics gira's `ANALYSIS.md`. Exercises
the framework's "unknown markdown" path — the README-extraction logic
must skip this even though it has level-2 headings, because none of the
canonical "Getting Started / Setup / Installation / …" run-section
headings match.

## Outbox event flow

The backend writes events to the `outbox_events` table inside the same
transaction as the business write. A cron-driven `OutboxPublisher`
flushes them to Redis Streams.

## Keycloak token verification

The backend's `AuthGuard` verifies JWTs against Keycloak's JWKS
endpoint. Tokens cached 10 min in Redis to absorb spikes.
