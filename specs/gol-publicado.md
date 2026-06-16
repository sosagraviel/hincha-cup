# GOL-PUBLICADO: Flujo gol-a-publicado — pipeline end-to-end para un solo gol

## User Story

**As a** fan watching a football match via the GG app  
**I want to** record a short clip right after a goal is announced, submit it, and see it published (or rejected) automatically  
**So that** the full product loop — from goal trigger to published fan video — is validated and working before any additional features are built on top of it

## Stakeholders

| Role | Responsibility |
|------|---------------|
| Tech Lead | Accepts the end-to-end flow; validates Cloud Function implementation and moderation logic |
| Development Team | Implements all 4 pipeline steps and integration-tests the full flow on a real device |
| Product Owner | Verifies the "walking skeleton" demo before investing in UI polish |

## Success Criteria

1. An admin pressing "Disparar Gol" in `/admin` creates an `eventos` document in Firestore and navigates to `/camara?gol={eventoId}`
2. The camera page records up to 10 seconds of video, creates a `videos` document in Firestore, and uploads the raw clip to Firebase Storage
3. The Storage upload triggers a Cloud Function that extracts 3 frames with ffmpeg, calls OpenAI omni-moderation, saves frames as evidence, and writes `publicado` or `rechazado` back to Firestore — all within 60 seconds of upload
4. `/estado/:id` updates in real-time (without page refresh) from `revisando` to `publicado`, and displays the número de gritos
5. A real clip recorded on a physical phone (iOS Safari or Android Chrome) completes the entire pipeline and the Firestore document reaches `publicado`

## Metrics

End-to-end validated when: Firestore doc transitions `revisando → publicado` for a real mobile-recorded clip within 90 seconds of the Storage upload completing.

## Acceptance Criteria

### Scenario 1: Happy path — full pipeline from goal trigger to published

```gherkin
Given the FASE0 infrastructure is live (Firebase Blaze plan, collections defined)
  And an admin is signed in on the /admin page
  And a fan is signed in on a real mobile device
When the admin clicks "Disparar Gol" (adding a goal event for partido P-001, minute 45)
  And the page navigates to /camara?gol={eventoId}
  And the fan records a 10-second clip on the mobile device
  And the fan taps "Subir video"
Then a Firestore videos/{id} document is created with estado: "revisando"
  And the clip is uploaded to Storage at videos/{userId}/{videoId}.{ext}
  And the fan is redirected to /estado/{videoId}
  And /estado/{videoId} shows "Revisando tu grito..."
  And within 90 seconds the page updates to show the video player and the número de gritos
  And the Firestore document has estado: "publicado" and a populated moderationResult field
```

### Scenario 2: Admin button creates goal event

```gherkin
Given an admin is signed in at /admin
  And at least one partido document exists in Firestore
When the admin fills in the gol form (partido, minuto) and clicks "Disparar Gol"
Then a new document is written to the eventos collection with:
  { partidoId, tipo: "gol", minuto, descripcion }
  And the admin UI navigates to /camara?gol={eventoId}
  And no errors appear in the browser console
```

### Scenario 3: Camera page uploads clip and creates video document

```gherkin
Given a signed-in fan arrives at /camara?gol={eventoId}
  And the gol URL parameter is a valid eventos document ID
When the fan records a clip (max 10 seconds) using the CameraSpikeRecorder component
  And taps "Subir video"
Then a Firestore document is created in videos/ with:
  { userId, eventoId, estado: "revisando", titulo, thumbnailUrl: "", creadoEn }
  And the video blob is uploaded to Storage at videos/{userId}/{videoId}.{ext}
  And the fan is redirected to /estado/{videoId}
```

### Scenario 4: Cloud Function moderates video and marks it publicado

```gherkin
Given a new video file has been uploaded to Storage at videos/{userId}/{videoId}.{ext}
  And the corresponding Firestore document has estado: "revisando"
  And the video content does not violate OpenAI omni-moderation categories
When the moderateVideo Cloud Function is triggered by the Storage upload
  And ffmpeg extracts 3 frames at t=1s, t=5s, t=9s
  And the frames are sent to the OpenAI omni-moderation API
Then the 3 frame JPEGs are saved to Storage at evidence/{videoId}/frame_{1,2,3}.jpg
  And the Firestore document is updated with:
    { estado: "publicado", moderationResult: { flagged: false, categories: {...}, frame1Url, frame2Url, frame3Url, moderatedAt } }
```

### Scenario 5: Cloud Function marks video as rechazado on moderation flag

```gherkin
Given a new video file is uploaded to Storage
  And the video content triggers one or more OpenAI omni-moderation categories
When the moderateVideo Cloud Function processes the frames
Then the Firestore document is updated with estado: "rechazado"
  And moderationResult.flagged is true
  And the categories object records which categories were triggered
  And /estado/{videoId} displays a rejection message to the fan
```

### Scenario 6: /estado/:id updates in real-time without page refresh

```gherkin
Given a fan has submitted a video and is viewing /estado/{videoId}
  And the current estado is "revisando"
  And the page subscribes to Firestore onSnapshot for videos/{videoId}
When the Cloud Function writes estado: "publicado" to Firestore
Then the /estado/{videoId} page transitions from the "revisando" spinner
  To the video player showing the recorded clip
  And displays the número de gritos (count of votos where videoId == id)
  Without requiring a page reload
```

## Technical Context

### Current State

- FASE0 has established: Firebase project (Spark), Auth (Google), Firestore collections, Storage rules, React Router with 6 empty stubs
- GG-01 spike has validated: `getUserMedia` + `MediaRecorder` recording on iOS Safari and Android; `CameraSpikeRecorder` React component exists
- **Firebase is currently on the Spark (free) plan — Cloud Functions are NOT available on Spark**

### Proposed Changes

#### Step 1 — `/admin`: Disparar Gol button
- Add a minimal form to `AdminPage.tsx` with partido selector + minuto input + "Disparar Gol" button
- On submit: write to `eventos` collection (`{ partidoId, tipo: 'gol', minuto, descripcion }`)
- On success: navigate to `/camara?gol={eventoId}`

#### Step 2 — `/camara?gol=N`: Recording + upload
- Read `?gol` URL param via `useSearchParams()`
- Render `CameraSpikeRecorder` (from GG-01); wire `onRecordingComplete(blob, mimeType)` callback
- On recording complete:
  1. Create Firestore `videos` document → receive auto-generated `videoId`
  2. Upload blob to Storage at `videos/{uid}/{videoId}.{ext}` with `contentType` metadata
  3. Navigate to `/estado/{videoId}`
- Show upload progress indicator

#### Step 3 — Cloud Function `moderateVideo`
- **Trigger**: `onObjectFinalized` on `{storageBucket}/videos/{userId}/{videoId}`
- **Runtime**: Node.js 20, gen 2, 512 MB memory, 120s timeout
- **Steps**:
  1. Download video file to `/tmp/{videoId}`
  2. Use `ffmpeg-static` + `fluent-ffmpeg` to extract frames at t=1s, t=5s, t=9s → JPEG files in `/tmp/`
  3. Read frames as base64 and call `POST https://api.openai.com/v1/moderations` with `model: "omni-moderation-2024-11-06"` and 3 image inputs
  4. Upload frame JPEGs to Storage at `evidence/{videoId}/frame_{1,2,3}.jpg`; get download URLs
  5. Write to Firestore `videos/{videoId}`:
     ```
     {
       estado: flagged ? "rechazado" : "publicado",
       moderationResult: {
         flagged, categories,
         frame1Url, frame2Url, frame3Url,
         moderatedAt: FieldValue.serverTimestamp()
       }
     }
     ```

#### Step 4 — `/estado/:id`: Real-time status page
- Subscribe to `videos/{id}` via `onSnapshot` on mount; unsubscribe on unmount
- Subscribe to `votos` count query (`where("videoId", "==", id)`) for live grito count
- Render:
  - `estado == "revisando"` → spinner + "Revisando tu grito..."
  - `estado == "publicado"` → `<video>` player with Storage URL + "**N gritos**"
  - `estado == "rechazado"` → rejection message + reason hint

### Firestore Document Lifecycle for `videos/{id}`

| State | Written by | Fields added |
|-------|-----------|--------------|
| Created | `/camara` page (client) | `userId, eventoId, url (Storage path), titulo, thumbnailUrl, estado: "revisando", creadoEn` |
| Moderated | `moderateVideo` Cloud Function | `estado: "publicado"/"rechazado", moderationResult: { flagged, categories, frame1Url, frame2Url, frame3Url, moderatedAt }` |

### Technical Constraints

- **Firebase Blaze plan required** — must be upgraded from Spark before any Cloud Function can be deployed; Blaze charges per-use but has a generous free tier that covers development
- **Cloud Function gen 2** — required for longer timeouts and higher memory limits; gen 1 max timeout is 60s which may be insufficient for ffmpeg + API call
- **ffmpeg-static** — bundles a static ffmpeg binary inside the npm package; no system-level dependency needed in the Cloud Function runtime
- **OpenAI omni-moderation** — sends images as base64 data URIs; does not require downloading frames to an external URL; stays within Firebase's VPC
- **Storage path convention** — video clips at `videos/{uid}/{videoId}.{ext}`; evidence frames at `evidence/{videoId}/frame_{N}.jpg`
- **`?gol=N` must be a valid Firestore document ID** — `/camara` must validate the param exists before allowing recording; if missing/invalid, show error
- **Max recording**: 10 seconds enforced client-side (from GG-01 component); Cloud Function must handle clips shorter than 10s gracefully (frame extraction at t=1s, t=5s, t=9s — if clip < 9s, clamp to last available frame)
- **OPENAI_API_KEY** stored as a Firebase Functions secret via `firebase functions:secrets:set OPENAI_API_KEY`; never hardcoded or committed

### Integration Points

| System | How it connects |
|--------|----------------|
| Firebase Auth | `auth.currentUser.uid` used as `userId` in videos doc and Storage path |
| Firestore `eventos` | Written by admin; read by `/camara` to validate `?gol=N` |
| Firestore `videos` | Written by client (create); updated by Cloud Function (estado + moderationResult) |
| Firestore `votos` | Read by `/estado/:id` for número de gritos (real-time count query) |
| Firebase Storage | Clip uploaded by client; frames + video read by Cloud Function; frame URLs stored in Firestore |
| Cloud Functions (gen 2) | Triggered by Storage `onObjectFinalized`; calls OpenAI API; updates Firestore |
| OpenAI API (`/v1/moderations`) | Called by Cloud Function with base64 frames; returns `flagged` + per-category scores |

### Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Client creates Firestore doc before upload | Generates the `videoId` upfront so the Storage path and the redirect URL to `/estado/{videoId}` are known before the upload starts |
| Cloud Function gen 2, 512 MB, 120s | ffmpeg frame extraction on a 10s video clip requires ~150 MB; gen 2 supports up to 32 GB and 3600s; 512 MB / 120s is the minimum safe config |
| `ffmpeg-static` npm package | Bundles a static binary — no Dockerfile, no custom runtime needed for Firebase Functions |
| 3 frames at fixed timestamps (1s, 5s, 9s) | Evenly distributed across the 10s max clip; gives moderation a representative sample of content without over-sampling |
| OpenAI `omni-moderation-2024-11-06` | Multi-modal model; accepts images natively; purpose-built for moderation; more accurate on visual content than text-only moderation |
| Any flagged category → `rechazado` | Conservative default; sports clips that trigger any moderation category are rejected; can be tuned per-category in a later ticket |
| "Número de gritos" via Firestore query | Real-time `onSnapshot` on `votos where videoId == id`; avoids a denormalized counter for the initial validation pass; can be replaced with a counter field for scale |
| React Router `useSearchParams` for `?gol=N` | Clean param parsing without manual URL manipulation; works with React Router v6's `createBrowserRouter` |

### Wiki Evidence

Not applicable — ticket concerns Firebase Cloud Functions, React frontend, and OpenAI API integration for the GG client app, external to the qubika-agentic-framework codebase.

### Graph Evidence

graph impact-radius check skipped — all files are new (new Cloud Function, updated page components); no existing file paths to measure.

## Out Of Scope

- Thumbnail generation (thumbnailUrl is stored as empty string `""` in this ticket; thumbnail upload is a follow-up)
- Vote/grito submission UI (the `votos` collection is read, not written, in this ticket)
- Admin video review UI (manual estado override)
- Retry logic for failed Cloud Function runs
- Moderation category configuration UI
- Per-category moderation tuning (any flagged = rechazado for now)
- Video compression or transcoding
- Push notifications when estado changes
- Error recovery if upload fails mid-way (user must retry manually)

## Future Considerations

- Denormalize `gritosCount` as a Firestore field to avoid per-render queries at scale
- Add Cloud Function retry / dead-letter topic for moderation failures
- Per-category moderation thresholds configurable by admin
- Thumbnail extraction as a second Cloud Function (or a second step in `moderateVideo`)
- Cloud Tasks or Pub/Sub for decoupled pipeline steps at higher volume
- Progress bar during video upload using Firebase Storage `uploadTask.on('state_changed')`

## Edge Cases And Error Handling

| Case | Handling |
|------|----------|
| `/camara` with missing or invalid `?gol` param | Show "Enlace de gol inválido" error; disable recording button |
| Upload fails (network error, Storage quota) | Catch `uploadTask` error; show retry button; Firestore doc remains `revisando` — admin can clean up |
| Cloud Function timeout (video download or API call too slow) | Function retries automatically (Cloud Functions gen 2 has built-in retry); idempotency: check if `moderationResult` already exists before processing |
| OpenAI API returns error (rate limit, outage) | Catch in Cloud Function; write `estado: "rechazado"` with `moderationResult.error` field; log to Cloud Logging for manual review |
| Video clip shorter than 9 seconds | Clamp frame extraction: attempt t=1s, t=duration/2, t=duration-1s; skip missing frames gracefully |
| Empty blob after recording (codec failure on device) | Client detects `blob.size == 0`; shows "Error al grabar — intentá de nuevo" without creating Firestore doc |
| Fan navigates away from `/estado/:id` before function completes | `onSnapshot` unsubscribed on unmount; no leak; fan can return to `/estado/{id}` anytime |
| Duplicate upload (user uploads same gol twice) | Each upload creates a new video doc + Storage file; admin can reject duplicates via moderation |

## Validation Rules

- `videos.estado` on create must be `"revisando"` — enforced by Firestore security rule (from FASE0)
- `videos.userId` on create must equal `request.auth.uid` — enforced by Firestore security rule (from FASE0)
- `?gol` param must resolve to an existing `eventos` document — validated client-side before recording starts
- Moderation result must include all 3 frame URLs before writing `estado` update — Cloud Function validates frame upload success before Firestore write

## Dependencies

- **Blocking**:
  - FASE0 must be complete (Firebase project, Firestore schema, React Router scaffold, Google Auth)
  - GG-01 must be complete (`CameraSpikeRecorder` component validated on real devices; recording confirmed working on iOS Safari and Android)
  - **Firebase project must be upgraded to Blaze (pay-as-you-go) plan before Cloud Functions can be deployed**
- **Related**: Future grito/vote submission ticket will read the `votos` collection already queried by `/estado/:id`

## Definition Of Done

### Infrastructure

- [ ] Firebase project upgraded from Spark to Blaze plan
- [ ] `OPENAI_API_KEY` stored as a Firebase Functions secret (`firebase functions:secrets:set OPENAI_API_KEY`)
- [ ] Cloud Functions emulator configured locally for testing (`firebase emulators:start --only functions,firestore,storage`)

### Code Quality

- [ ] `AdminPage.tsx` implements goal trigger form with Firestore write + navigation to `/camara?gol={id}`
- [ ] `CameraPage.tsx` reads `?gol` param, validates it, renders `CameraSpikeRecorder`, handles upload + Firestore create + redirect
- [ ] `EstadoPage.tsx` implements real-time `onSnapshot` listener, renders all 3 states (`revisando`, `publicado`, `rechazado`), shows número de gritos
- [ ] `functions/src/moderateVideo.ts` implements the 4-step pipeline: download → ffmpeg → OpenAI → Storage + Firestore update
- [ ] Cloud Function has `ffmpeg-static` and `fluent-ffmpeg` as dependencies; `OPENAI_API_KEY` read from `process.env`
- [ ] No hardcoded API keys anywhere in the codebase
- [ ] Firestore security rules updated to allow Cloud Function (service account) to write `estado` updates

### Testing

- [ ] All 6 BDD acceptance criteria manually verified
- [ ] Full end-to-end test: real clip recorded on physical phone → Firestore doc reaches `publicado` within 90 seconds
- [ ] Rejection path tested: upload a clip that triggers moderation (or mock the OpenAI response) → doc reaches `rechazado`
- [ ] Real-time update verified: `/estado/:id` page open in browser updates without refresh
- [ ] Invalid `?gol` param on `/camara` shows error and blocks recording
- [ ] Cloud Function tested locally via Firebase Emulator Suite before cloud deployment

### Documentation

- [ ] Cloud Function environment variables documented in `functions/.env.example`
- [ ] `docs/pipeline.md` (or equivalent) documents the 4-step gol-a-publicado flow with Storage paths and Firestore field names
- [ ] README updated with emulator setup command

### Review And Deployment

- [ ] Code reviewed with focus on Cloud Function error handling and OpenAI API integration
- [ ] Cloud Function deployed to Firebase (`firebase deploy --only functions`)
- [ ] End-to-end demo recorded (screen capture of full flow) for stakeholder sign-off

## Assumptions And Open Questions

| # | Assumption | Impact If Wrong |
|---|-----------|-----------------|
| 1 | Any OpenAI omni-moderation category being flagged → `rechazado` (no per-category tuning) | Low — threshold tuning is a follow-up ticket; conservative default is safe for demo |
| 2 | "Número de gritos" = count of `votos` documents where `videoId == id` | Medium — if "grito" is a different interaction model (e.g. a separate collection or a reaction emoji), schema must be revised |
| 3 | Frame extraction at t=1s, t=5s, t=9s; clips < 9s use clamped timestamps | Low — sampling strategy can be adjusted without schema changes |
| 4 | `thumbnailUrl` is stored as `""` in this ticket (no thumbnail generation yet) | Low — thumbnail is explicitly out of scope here; follow-up ticket |
| 5 | Blaze plan upgrade is done by the developer (not automated) before deployment | High — Cloud Functions will not deploy on Spark plan; this is a hard prerequisite |

## Implementation Notes

**Cloud Function skeleton (`functions/src/moderateVideo.ts`):**
```ts
import { onObjectFinalized } from "firebase-functions/v2/storage";
import * as admin from "firebase-admin";
import * as ffmpegStatic from "ffmpeg-static";
import * as Ffmpeg from "fluent-ffmpeg";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import OpenAI from "openai";

admin.initializeApp();
Ffmpeg.setFfmpegPath(ffmpegStatic as string);

export const moderateVideo = onObjectFinalized(
  { memory: "512MiB", timeoutSeconds: 120, secrets: ["OPENAI_API_KEY"] },
  async (event) => {
    const filePath = event.data.name; // "videos/{uid}/{videoId}.ext"
    if (!filePath?.startsWith("videos/")) return; // ignore evidence/ uploads

    const [, uid, fileName] = filePath.split("/");
    const videoId = path.basename(fileName, path.extname(fileName));
    const bucket = admin.storage().bucket(event.data.bucket);
    const db = admin.firestore();

    // Idempotency guard
    const docRef = db.collection("videos").doc(videoId);
    const existing = await docRef.get();
    if (existing.data()?.moderationResult) return;

    // 1. Download video to /tmp
    const tmpVideo = path.join(os.tmpdir(), fileName);
    await bucket.file(filePath).download({ destination: tmpVideo });

    // 2. Extract 3 frames with ffmpeg
    const frameTimestamps = [1, 5, 9];
    const framePaths: string[] = [];
    for (const t of frameTimestamps) {
      const framePath = path.join(os.tmpdir(), `${videoId}_frame_${t}.jpg`);
      await new Promise<void>((resolve, reject) =>
        Ffmpeg(tmpVideo)
          .seekInput(t)
          .frames(1)
          .output(framePath)
          .on("end", resolve)
          .on("error", reject)
          .run()
      );
      framePaths.push(framePath);
    }

    // 3. Call OpenAI omni-moderation with base64 frames
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const frameBase64s = await Promise.all(
      framePaths.map(async (p) => {
        const buf = await fs.readFile(p);
        return buf.toString("base64");
      })
    );
    const moderationRes = await openai.moderations.create({
      model: "omni-moderation-2024-11-06",
      input: frameBase64s.map((b64) => ({
        type: "image_url" as const,
        image_url: { url: `data:image/jpeg;base64,${b64}` },
      })),
    });
    const result = moderationRes.results[0];

    // 4. Upload frames to Storage and get URLs
    const frameUrls: string[] = [];
    for (let i = 0; i < framePaths.length; i++) {
      const dest = `evidence/${videoId}/frame_${i + 1}.jpg`;
      await bucket.upload(framePaths[i], {
        destination: dest,
        metadata: { contentType: "image/jpeg" },
      });
      const [url] = await bucket.file(dest).getSignedUrl({
        action: "read",
        expires: "03-01-2030",
      });
      frameUrls.push(url);
    }

    // 5. Update Firestore
    await docRef.update({
      estado: result.flagged ? "rechazado" : "publicado",
      moderationResult: {
        flagged: result.flagged,
        categories: result.categories,
        frame1Url: frameUrls[0] ?? "",
        frame2Url: frameUrls[1] ?? "",
        frame3Url: frameUrls[2] ?? "",
        moderatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    });

    // Cleanup /tmp
    await Promise.all([tmpVideo, ...framePaths].map((f) => fs.unlink(f).catch(() => {})));
  }
);
```

**`EstadoPage.tsx` real-time listener pattern:**
```tsx
import { doc, onSnapshot, collection, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";

export function EstadoPage() {
  const { id } = useParams<{ id: string }>();
  const [video, setVideo] = useState<VideoDoc | null>(null);
  const [gritos, setGritos] = useState(0);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, "videos", id), (snap) =>
      setVideo(snap.data() as VideoDoc)
    );
    const gritosQ = query(collection(db, "votos"), where("videoId", "==", id));
    const unsubGritos = onSnapshot(gritosQ, (snap) => setGritos(snap.size));
    return () => { unsub(); unsubGritos(); };
  }, [id]);

  if (!video) return <p>Cargando...</p>;
  if (video.estado === "revisando") return <p>Revisando tu grito... ⏳</p>;
  if (video.estado === "rechazado") return <p>Tu grito no pasó la moderación.</p>;
  return (
    <>
      <video src={video.url} controls />
      <p>{gritos} {gritos === 1 ? "grito" : "gritos"} 🗣️</p>
    </>
  );
}
```

**Firebase emulator for local testing:**
```bash
firebase emulators:start --only functions,firestore,storage
# Functions: http://localhost:5001
# Firestore: http://localhost:8080
# Storage:   http://localhost:9199
```

## References

- [Firebase Cloud Functions gen 2 docs](https://firebase.google.com/docs/functions/get-started?gen=2nd)
- [firebase-functions v2 Storage trigger](https://firebase.google.com/docs/functions/storage-events)
- [ffmpeg-static npm package](https://www.npmjs.com/package/ffmpeg-static)
- [fluent-ffmpeg npm package](https://www.npmjs.com/package/fluent-ffmpeg)
- [OpenAI omni-moderation API](https://platform.openai.com/docs/guides/moderation)
- [GG-01 spike ticket](./gg-01-spike-camara.md) — CameraSpikeRecorder component
- [FASE0 ticket](./fase0-cimiento.md) — Firebase project, Firestore schema, routing scaffold

---

**INVEST Validated**: ✅  
**BDD Scenarios**: 6  
**Priority**: High  
**Estimated Duration**: 3 days  
**Prerequisite**: Firebase project upgraded to Blaze plan before deployment
