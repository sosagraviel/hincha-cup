# GritoGol — Firestore Schema

## Collections

### `partidos/{partidoId}`

| Field | Type | Notes |
|-------|------|-------|
| `equipoLocal` | `string` | e.g. "Uruguay" |
| `equipoVisitante` | `string` | e.g. "España" |
| `golesLocal` | `number` | |
| `golesVisitante` | `number` | |
| `estado` | `"en_vivo" \| "finalizado"` | |
| `minuto` | `number` | Current match minute |
| `equipoHinchada` | `"uruguay" \| "argentina"` | Campaign / fan base |
| `sponsor` | `{ nombre: string, compromiso: string }` | |
| `destino` | `string` | Charity/club destination |
| `festejosPublicados` | `number` | Denormalized counter — updated by GG-07 |
| `pelotasDesbloqueadas` | `number` | Denormalized counter — updated by GG-07 |
| `becasDesbloqueadas` | `number` | Updated by GG-07 (every 10 festejos) |
| `escuelasBeneficiadas` | `number` | Updated by GG-07 (every 20 festejos) |
| `votacionCierraEn` | `Timestamp \| null` | Set by admin to close celebration window |
| `createdAt` | `Timestamp` | |
| `updatedAt` | `Timestamp` | |

### `beneficiarios/{beneficiarioId}`

| Field | Type | Notes |
|-------|------|-------|
| `equipoHinchada` | `"uruguay" \| "argentina"` | Filter by campaign |
| `nombre` | `string` | Institution name |
| `ubicacion` | `string` | City / neighborhood |
| `descripcion` | `string` | Short context |
| `recibido` | `string` | What was delivered |
| `tipoImpacto` | `"pelotas" \| "becas" \| "escuelas"` | UI icon variant |
| `orden` | `number` | Display order |
| `activo` | `boolean` | Soft hide |
| `createdAt` | `Timestamp` | |

### `eventos/{eventoId}`

| Field | Type | Notes |
|-------|------|-------|
| `partidoId` | `string` | Reference to `partidos` |
| `equipo` | `string` | Team that scored |
| `minuto` | `number` | Goal minute |
| `golNumero` | `number` | Used in celebration flow |
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
| `autorAlias` | `string` | e.g. "Lucía R." |
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
| `videos` | `partidoId` ASC, `estado` ASC, `createdAt` DESC | Feed query |
| `videos` | `partidoId` ASC, `userId` ASC, `createdAt` DESC | User profile festejos |
| `eventos` | `partidoId` ASC, `createdAt` DESC | Goal events |
| `beneficiarios` | `equipoHinchada` ASC, `activo` ASC, `orden` ASC | Impact tab |
