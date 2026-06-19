# Video Moderation — GritoGol

Replaces the stub auto-publish countdown timer with real content moderation powered by **OpenAI `omni-moderation-latest`** before any video reaches the public wall.

---

## How it works

### Full flow

```
User records video
       │
       ▼
crearFestejo() → uploads to Firebase Storage → Firestore doc created (estado: "revisando")
       │
       ▼
EstadoVideoPage loads
       │
       ▼
extractFrameBase64() — extracts a still frame from the middle of the video using Canvas API
       │
       ▼
llamarModeracion() — calls the moderarVideo Firebase Callable Function
       │
       ▼
moderarVideo (Cloud Function)
       ├── Calls OpenAI omni-moderation-latest with the frame as a base64 image_url
       │
       ├── NOT flagged ──► assigns gritoNumero, increments counters, estado → "publicado"
       │
       └── flagged ──────► estado → "rechazado", stores moderation.razon
       │
       ▼
EstadoVideoPage reacts to Firestore real-time update
       ├── "publicado" → "¡Ya estás en el muro!"
       └── "rechazado" → "Tu video fue rechazado por contenido inapropiado"
```

### Why a still frame?

Extracting a single frame from the middle of the video (`duration * 0.5`) is done entirely in the browser using the **Canvas API** — no server-side ffmpeg, no extra Storage upload. The frame is sent as a base64 PNG directly in the callable function payload.

### Why a callable function (not HTTP)?

Firebase Callable Functions handle authentication automatically. The frontend SDK passes the user's ID token on every call, and the function validates it before doing anything. The OpenAI API key never leaves the server.

---

## OpenAI Integration

### Model

`omni-moderation-latest` — OpenAI's multimodal moderation model. Free to use, no per-call cost.

### What it detects

| Category | Examples |
|----------|----------|
| `sexual` / `sexual/minors` | Explicit content |
| `violence` / `violence/graphic` | Graphic violence |
| `harassment` / `harassment/threatening` | Threatening language |
| `hate` / `hate/threatening` | Hate speech |
| `self-harm` | Self-harm content |
| `illicit` / `illicit/violent` | Illegal activity |

> **Note:** The model is calibrated for clearly harmful content. Context-free images (e.g. a gun with no threatening context) may not be flagged. This is by design — the model avoids false positives.

### Request format

```json
{
  "model": "omni-moderation-latest",
  "input": [
    {
      "type": "image_url",
      "image_url": {
        "url": "data:image/png;base64,<frame>"
      }
    }
  ]
}
```

### Response handling

```typescript
const outcome = result.results?.[0];
const aprobado = !outcome?.flagged;

// If flagged, collect which categories triggered:
const razon = Object.entries(outcome.categories)
  .filter(([, flagged]) => flagged)
  .map(([category]) => category)
  .join(", ");
```

---

## Files changed

| File | What changed |
|------|-------------|
| `functions/src/moderarVideo.ts` | **New** — callable function: auth check, frame validation, OpenAI call, publish or reject |
| `functions/src/onVideoSubido.ts` | Stripped auto-publish — now just logs the upload |
| `functions/src/index.ts` | Exports `moderarVideo` |
| `functions/.env.example` | Added `USE_MOCK_MODERATION` and `OPENAI_API_KEY` docs |
| `functions/.gitignore` | **New** — protects `functions/.env` from being committed |
| `src/services/videoService.ts` | Added `extractFrameBase64` (Canvas API) and `llamarModeracion` (callable wrapper) |
| `src/pages/EstadoVideoPage.tsx` | Removed 10s timer, added moderation call + rechazado/retry UI |

---

## Environment variables

### Local emulators — `functions/.env`

```bash
USE_MOCK_MODERATION=true    # auto-approves everything, no OpenAI call
USE_MOCK_MODERATION=false   # uses real OpenAI API
OPENAI_API_KEY=sk-...       # required when USE_MOCK_MODERATION=false
```

### Production

```bash
firebase functions:secrets:set OPENAI_API_KEY
```

The key is stored as a Firebase Secret — never in source code or environment files.

---

## Rate limits (free tier)

OpenAI's free/Tier-1 accounts have a low RPM cap on the moderation endpoint. During development you may see **429 Too Many Requests** errors if you submit multiple videos quickly. Wait ~2-3 minutes between tests, or upgrade your OpenAI account tier.

---

## Mock mode

Set `USE_MOCK_MODERATION=true` in `functions/.env` to skip OpenAI entirely during local development. All videos are auto-approved. This is the default in `.env.example` to avoid requiring an API key for onboarding.

---

## Firestore schema — `videos/{videoId}`

```
estado:      "revisando" | "publicado" | "rechazado"
gritoNumero: number | null   ← only set on approval
moderacion:
  aprobado:  boolean
  razon?:    string           ← flagged categories, e.g. "violence, illicit"
  timestamp: Timestamp
```
