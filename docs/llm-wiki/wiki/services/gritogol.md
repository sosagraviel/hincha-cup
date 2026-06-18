---
document_type: service
summary: Vite + React SPA where soccer fans record and share short "festejo" video clips when their team scores, backed by Firebase Auth, Firestore, Cloud Storage, and Cloud Functions v2.
last_updated: '2026-06-18T16:30:00.000Z'
tags: [service, typescript, react, firebase, vite]
related: [../ARCHITECTURE.md, ../SERVICES.md]
service_id: gritogol
---
# gritogol

## Purpose

GritoGol is a soccer highlight celebration app. During a live Copa tournament match, when a goal is scored a timed recording window opens and authenticated fans can capture a short video clip (their "festejo"). The clip is uploaded to Cloud Storage, auto-moderated by a Cloud Function, and if approved is published to a shared live feed where other fans can watch, react, and vote. The app also tracks tangible real-world impact per match: each published video converts into pelotitas, becas, or escuelas donated to a beneficiary organisation by the match sponsor.

The app does not communicate with the `orchestration` or `website` services; all runtime data flows through Firebase backends.

## Public API / Surface

The app exposes no HTTP API of its own. Its public entry points are the React Router routes and the two callable Cloud Functions:

**React Router v6 routes (`gritogol/src/router.tsx`):**

| Path | Component | Role |
|---|---|---|
| `/` | `AppPage` | Main feed + tab bar (home tab) |
| `/impacto` | `AppPage` | Impact/metrics tab |
| `/perfil` | `AppPage` | User profile tab |
| `/estado/:id` | `EstadoVideoPage` | Post-recording status screen for video `id` |
| `/ganadores` | `GanadoresPage` | Winners / leaderboard |
| `/admin` | `AdminPage` | Admin control panel (restricted) |
| `*` | `NotFoundPage` | 404 catch-all |

**Cloud Functions v2 (`gritogol/functions/src/index.ts`):**

| Export | Trigger | Role |
|---|---|---|
| `onVideoSubido` | `onObjectFinalized` — Storage `videos-crudos/**` | Assigns global `gritoNumero`, transitions video `estado` → `publicado`, increments impact counters on `partidos` doc |
| `syncCopaScores` | Scheduled HTTP (`onSchedule`) | Fetches live + today's Copa fixtures from api-football.com; upserts `copa_fixtures` collection |
| `triggerCopaSync` | Callable HTTP (`onCall`) | Manual trigger for `syncCopaScores` logic |
| `simulateGoal` | Callable HTTP (`onCall`) | Injects a synthetic goal event for demo / QA use |

All Cloud Functions are deployed to region `us-central1`.

## Internal Architecture

**Frontend layer (`gritogol/src/`):**

```
App.tsx (root)
├── router.tsx          React Router v6 createBrowserRouter
├── context/            React Context providers (injected at app root)
│   ├── AuthContext     Firebase Auth state + Google Sign-In helpers
│   ├── PartidoContext  Live Firestore subscription to current match
│   ├── CopaContext     Copa fixture data (copa_fixtures collection)
│   └── ToastContext    Global notification queue
├── pages/              Route-level components (one per route)
├── components/         Atomic UI; grouped by domain:
│   ├── feed/           Video feed cards (FeedCard)
│   ├── goal/           Goal overlay + recording trigger (GoalOverlay)
│   ├── impact/         Impact metrics display
│   ├── layout/         Shell, tab bar, nav
│   ├── ui/             Shared primitives
│   ├── video/          Recording component, sponsor overlay
│   └── views/          Composite view wrappers
├── services/           Firebase façades (pure functions, no class instances)
│   ├── videoService.ts upload blob + Firestore setDoc, URL caching via Map
│   ├── authService.ts  auth state helpers
│   ├── copaService.ts  copa_fixtures reads
│   ├── impactoService  impact-counter reads
│   └── partidoService  partidos doc reads
├── hooks/
│   └── useMediaRecorder.ts  getUserMedia + MediaRecorder orchestration
├── types/
│   └── firestore.ts    TypeScript interfaces for all Firestore collections
├── constants.ts        EquipoHinchada enum + app-wide constants
└── firebase.ts         Firebase SDK init; emulator shims via VITE_USE_EMULATORS
```

**Cloud Functions layer (`gritogol/functions/src/`):**

```
index.ts                exports: onVideoSubido, syncCopaScores, triggerCopaSync, simulateGoal
onVideoSubido.ts        Storage trigger — moderates + publishes video
syncCopaScores.ts       Scheduled sync from api-football.com
providers/
│   ├── apiFootball.ts  ScoresProvider backed by api-football.com (requires API_FOOTBALL_KEY secret)
│   └── mockScores.ts   ScoresProvider backed by Firestore mock data (USE_MOCK_SCORES=true)
sync/
│   └── syncLogic.ts    mergeFixturesById, processFixtureSnapshot, todayUtcDate
mappers/                Data-shape adapters between provider payloads and Firestore schema
types/copa.ts           ScoresProvider interface + Copa data types
utils/                  Shared utilities
```

## Request Lifecycle

**Typical fan flow — recording and submitting a "festejo":**

1. `PartidoContext` holds an active Firestore `onSnapshot` subscription to the current `partidos` doc.
2. When a goal is detected, an `eventos` document is written (by admin or `simulateGoal`). `AppPage` subscribes via `onSnapshot` on `eventos` where `ventanaAbreEn ≤ now ≤ ventanaCierraEn`.
3. `GoalOverlay` renders when a live evento is detected; user taps "Gritar".
4. `useMediaRecorder` calls `getUserMedia({ video, audio })` → starts `MediaRecorder` → collects chunks → produces a `Blob` on stop.
5. `videoService.crearFestejo()` uploads the Blob to `videos-crudos/{partidoId}/{videoId}.{ext}` via `uploadBytes` (Firebase Storage SDK), then `setDoc` creates a `videos/{videoId}` document with `estado: "revisando"`.
6. User is navigated to `/estado/{videoId}`. `EstadoVideoPage` opens a `onSnapshot` subscription on that doc and polls `estado`.
7. `onVideoSubido` Cloud Function fires on the Storage `onObjectFinalized` event. Inside a Firestore transaction it: reads `counters/videos` to determine the next `gritoNumero`, updates `videos/{videoId}` to `estado: "publicado"`, and increments `partidos/{partidoId}.festejosPublicados`.
8. `EstadoVideoPage` detects `estado === "publicado"` and navigates back to the feed.

**Score sync flow:**

1. `syncCopaScores` runs on schedule; `triggerCopaSync` is the manual equivalent.
2. `ApiFootballProvider` (or `MockScoresProvider`) fetches live + today's fixtures from api-football.com.
3. `mergeFixturesById` deduplicates by fixture ID.
4. `processFixtureSnapshot` upserts each fixture into `copa_fixtures` collection via Firestore batch write.
5. `CopaContext` in the frontend receives the update via its `onSnapshot` subscription.

## Data Layer

All persistence is managed by Firebase (no separate database server owned by this service).

**Firestore collections:**

| Collection | Owned by | Purpose |
|---|---|---|
| `partidos` | Admin / Cloud Functions | Live match records; holds score, estado, sponsor, impact counters |
| `eventos` | Admin / Cloud Functions | Goal events with recording-window timestamps |
| `videos` | Client + `onVideoSubido` | User-submitted festejo videos; `estado` lifecycle: `revisando → publicado / rechazado` |
| `votos` | Client | Per-user like votes on published videos |
| `copa_fixtures` | `syncCopaScores` | Copa tournament fixture snapshots from api-football.com |
| `admins` | Manual | Allowlist of admin UIDs |
| `beneficiarios` | Admin | Beneficiary organisations receiving impact donations |
| `counters` | `onVideoSubido` | Global counters (e.g., `gritoNumero`) via Firestore atomic increments |

**Cloud Storage bucket:** `videos-crudos/` prefix — raw video blobs uploaded directly from the browser. No client-side download URL is stored; `videoService.obtenerUrlVideo()` calls `getDownloadURL()` and caches results in a module-level `Map`.

**Firestore security rules summary** (`gritogol/firestore.rules`):

| Collection | Read | Write |
|---|---|---|
| `partidos`, `eventos`, `copa_fixtures`, `beneficiarios` | public | admin only (or `false` for copa_fixtures) |
| `videos` | authenticated | create: owner; update: admin or owner; delete: never |
| `votos` | authenticated | create/delete: owner only |
| `admins` | self-read only | never from client |
| `counters` | authenticated | never from client |

## Integrations

- **Firebase Auth** — Google Sign-In + anonymous auth. Session persisted via `browserLocalPersistence`. Emulated locally on port 9099.
- **Firebase Firestore** — primary database, Native mode. Emulated locally on port 8081.
- **Firebase Storage** — raw video blob storage. Emulated locally on port 9199.
- **Firebase Cloud Functions v2** — `us-central1` region. Emulated locally on port 5001.
- **Firebase Hosting** — SPA deployment target (`dist/`); single-page rewrite to `/index.html`.
- **api-football.com** — external REST API for Copa tournament fixture scores. Accessed only from `syncCopaScores` Cloud Function; key stored as Firebase Secret (`API_FOOTBALL_KEY`).
- **[[orchestration]]** — no runtime relationship; the framework generates `.claude/` config artifacts for this service but is never called at runtime.
- **[[website]]** — no runtime relationship.

## Service-Specific Patterns

- **Emulator-first local dev.** `VITE_USE_EMULATORS=true` switches all Firebase SDK connections to local emulators (ports defined in `firebase.json`). `HTTPS` in local dev is handled by `@vitejs/plugin-basic-ssl`. The full local stack runs via `make start` (Docker Compose) or `npm run emulators` + `npm run dev` independently.
- **URL caching in videoService.** `getDownloadURL()` results are cached in a module-level `Map<storagePath, url>` to avoid redundant Storage calls when the same video renders multiple times in the feed.
- **Atomic gritoNumero assignment.** `onVideoSubido` assigns the sequential `gritoNumero` inside a Firestore transaction to prevent races when multiple videos are uploaded concurrently for the same goal window.
- **notFound guard in FeedCard.** If `getDownloadURL()` rejects (e.g., video not yet in Storage), `FeedCard` sets a local `notFound` state and returns `null` — silently hiding the card instead of showing an error state.
- **suppressOverlay ref pattern in AppPage.** The overlay-suppress logic uses a `useRef` instead of `useState` to hold the one-shot suppress flag, preventing an extra re-render cycle when returning from `EstadoVideoPage`.
- **ScoresProvider interface.** `syncCopaScores` depends on a `ScoresProvider` interface satisfied by either `ApiFootballProvider` (production) or `MockScoresProvider` (dev/test). The implementation is selected at runtime via `USE_MOCK_SCORES` env var, enabling isolated local testing without hitting the external API.
