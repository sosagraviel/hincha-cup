# Environment management

Three places for env data:

1. `env.json.template` — Firebase secrets, populated via `firebase functions:secrets`.
2. `.env.development.example` — local Firebase emulator hosts.
3. Per-service `.env` (gitignored) — runtime overrides.

The `env-handlers/` package centralises loading + validation. See
`env-handlers/index.ts` for the shape.
