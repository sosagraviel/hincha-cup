# GritoGol — Firestore Schema

## Collections

### `partidos/{partidoId}`

| Field | Type | Notes |
|-------|------|-------|
| `equipoLocal` | `string` | e.g. "Argentina" |
| `equipoVisitante` | `string` | e.g. "México" |
| `golesLocal` | `number` | |
| `golesVisitante` | `number` | |
| `estado` | `"en_vivo" \| "finalizado"` | |
| `minuto` | `number` | Current match minute |
| `sponsor` | `{ nombre: string, compromiso: string }` | |
| `destino` | `string` | Charity/club destination |
| `festejosPublicados` | `number` | Denormalized counter — updated by GG-07 |
| `pelotasDesbloqueadas` | `number` | Denormalized counter — updated by GG-07 |
| `votacionCierraEn` | `Timestamp \| null` | Set by admin to close celebration window |
| `createdAt` | `Timestamp` | |
| `updatedAt` | `Timestamp` | |

### `eventos/{eventoId}`

| Field | Type | Notes |
|-------|------|-------|
| `partidoId` | `string` | Reference to `partidos` |
| `equipo` | `string` | Team that scored |
| `minuto` | `number` | Goal minute |
| `golNumero` | `number` | Used in `/camara?gol=N` |
| `ventanaAbreEn` | `Timestamp` | Celebration window opens |
| `ventanaCierraEn` | `Timestamp` | Celebration window closes (+10 min) |
| `createdAt` | `Timestamp` | |

### `videos/{videoId}`

| Field | Type | Notes |
|-------|------|-------|
| `partidoId` | `string` | |
| `eventoId` | `string` | |
| `golNumero` | `number` | |
| `userId` | `string` | Firebase Auth UID |
| `autorAlias` | `string` | e.g. "@lucia_g" |
| `storagePath` | `string` | `videos-crudos/{partidoId}/{videoId}.webm` |
| `estado` | `"revisando" \| "publicado" \| "rechazado"` | Managed by Cloud Function |
| `gritoNumero` | `number \| null` | Sequential number assigned at publish |
| `aplausos` | `number` | Denormalized clap counter |
| `moderacion` | `object \| null` | Filled by GG-05 |
| `createdAt` | `Timestamp` | |
| `publishedAt` | `Timestamp \| null` | |

### `votos/{votoId}` — id = `{videoId}_{userId}`

| Field | Type | Notes |
|-------|------|-------|
| `videoId` | `string` | |
| `partidoId` | `string` | |
| `userId` | `string` | Firebase Auth UID |
| `createdAt` | `Timestamp` | |

The composite document ID `{videoId}_{userId}` enforces one vote per user per video at the Firestore level — no transaction needed for the idempotency check.

### `admins/{uid}`

| Field | Type | Notes |
|-------|------|-------|
| (empty doc) | — | Presence of the document grants admin role |

Admin documents are managed exclusively via Firebase Admin SDK. No client-side write is permitted.

### `counters/videos`

| Field | Type | Notes |
|-------|------|-------|
| `gritoNumero` | `number` | Atomically incremented by `onVideoSubido` |

## Storage Paths

| Path | Description |
|------|-------------|
| `videos-crudos/{partidoId}/{videoId}.webm` | Raw celebration upload; triggers `onVideoSubido` |
| `moderacion/{videoId}/frame-{n}.jpg` | Keyframes written by GG-05 moderation function |

## Indexes

| Collection | Fields | Order |
|------------|--------|-------|
| `videos` | `partidoId` ASC, `estado` ASC, `createdAt` DESC | Feed query for published videos per match |
