# TRIBUNA: Flujo la-tribuna-reacciona — feed, votos, pelotas, home en vivo y aviso de gol

> ⚠️ **INVEST "Small" advisory**: estimated 4–6 days (5 features × ~1 day each). Passes the 1–5 day boundary under aggressive parallelism. If the team cannot commit this as a single PR, see the **Suggested Split** at the end of this section.
>
> **Suggested split:**
> - **TRIBUNA-A** (content layer): Vote system + admin close + `/tribuna` feed + pelota counter — 3 days, independently testable
> - **TRIBUNA-B** (live engagement): Home en vivo + goal alert banner — 3 days, depends on TRIBUNA-A's `festejosPublicados` counter

## User Story

**As a** fan watching a match through the GG app  
**I want to** see goals arrive live on the Home, be alerted in-app to record a clip, come back to the Tribuna to watch other fans' festejos, and applaud the ones I love  
**So that** the full fan engagement loop — from goal trigger to published festejo to community reaction — is live and measurable

## Stakeholders

| Role | Responsibility |
|------|---------------|
| Tech Lead | Accepts real-time architecture decisions; validates Firestore security rules for vote writes |
| Development Team | Implements all 5 features end-to-end |
| Sponsor | Sees their `compromisoSponsor` text and `festejosPublicados` counter live on the Home |
| Product Owner | Verifies the full end-to-end acceptance criterion on a real device |

## Success Criteria

1. A fan on the Home page sees a new gol evento appear in real-time, taps the in-app banner, and is taken to `/camara?gol=N`
2. After the clip is published, the `festejosPublicados` counter on the Home increments and the progress bar advances toward the next pelota
3. `/tribuna` displays a feed of published videos for the active match; the sponsor logo overlay is visible over each video via CSS (not burned in); the Aplaudir button writes a vote to Firestore
4. A user who has already voted sees a disabled/confirmed Aplaudir state and cannot write a duplicate vote
5. When admin closes voting from `/admin`, all Aplaudir buttons immediately become disabled
6. The pelota milestone banner fires at every 20th published festejo (max 5 pelotas per match)

## Metrics

Full-loop validated when: from the Home, a fan sees a goal, records a clip, that clip is published, receives an Aplaudir vote, and the festejosPublicados counter and progress bar update live on screen — all without a page reload.

## Acceptance Criteria

### Scenario 1: Full loop — home to gol to festejo to voto to contador

```gherkin
Given a fan is signed in and viewing the Home page (/)
  And there is an active partido with estado: "en_curso" and votosAbiertos: true
  And the Home listens to the active partido via onSnapshot
When an admin fires a gol (writing an eventos doc with tipo: "gol", equipo: "local")
Then the in-app goal alert banner appears: "⚽ ¡GOL! Toca para grabar tu festejo"
  And tapping the banner navigates to /camara?gol={eventoId}
  And after recording and the Cloud Function publishes the video
  And the fan navigates to /tribuna
  And taps Aplaudir on the published festejo
Then a votos document is created in Firestore with { videoId, userId, creadoEn }
  And returning to the Home shows the festejosPublicados counter incremented by 1
  And the progress bar "barra a la próxima pelota" advances accordingly
```

### Scenario 2: Aplaudir writes vote and shows confirmed state

```gherkin
Given a fan is on /tribuna viewing a published video
  And the active partido has votosAbiertos: true
  And the fan has NOT previously voted for this video
When the fan taps "Aplaudir"
Then a votos document is created: { videoId, userId: auth.currentUser.uid, creadoEn }
  And the Aplaudir button transitions to a confirmed / disabled state ("Ya aplaudiste")
  And the grito count displayed on the card increments by 1
  And a second tap does nothing (button remains disabled)
```

### Scenario 3: Aplaudir is disabled when already voted

```gherkin
Given a fan opens /tribuna
  And a votos document already exists for (videoId, userId)
When the video card renders
Then the Aplaudir button is already in the confirmed / disabled state on first render
  And tapping it does not write a new Firestore document
```

### Scenario 4: Sponsor overlay is CSS-only and always visible during playback

```gherkin
Given a fan plays a video in the /tribuna feed
  And the VideoCard component renders a <video> element with the sponsor overlay div
When the video is playing at any timestamp
Then the sponsor overlay (logo or text) is visible over the video frame
  And it is positioned via CSS (position: absolute, z-index above the video)
  And it does NOT appear burned into the video file itself
  And the overlay remains visible if the fan fullscreens the video (uses CSS layers, not native fullscreen controls)
```

### Scenario 5: Pelota milestone fires at every 20th festejo

```gherkin
Given the active partido has festejosPublicados: 19
When the Cloud Function publishes a new video and increments festejosPublicados to 20
Then the Home page receives the onSnapshot update
  And displays a pelota milestone animation / badge (1 pelota unlocked)
  And the progress bar resets to 0/20 toward the next pelota
  And when festejosPublicados reaches 100 (5 pelotas), no further pelotas are unlocked
```

### Scenario 6: Admin closes voting and Aplaudir immediately disables

```gherkin
Given a fan is viewing /tribuna with Aplaudir buttons enabled
  And an admin navigates to /admin and clicks "Cerrar votación" for the active partido
  And this sets partidos/{id}.votosAbiertos to false
When the Firestore onSnapshot update reaches the fan's browser
Then all Aplaudir buttons on /tribuna transition to disabled state
  And any tap on them does nothing
  And the Home's "Subir festejo" button also becomes disabled
```

### Scenario 7: Goal alert banner appears on new gol evento

```gherkin
Given the app is open on any route (/, /tribuna, /ganadores)
  And the global GoalAlertBanner component is mounted at the app root
  And the component listens to eventos where partidoId == activePartidoId via onSnapshot
When a new eventos document is created with tipo: "gol" and votosAbiertos: true
Then a fixed-position banner appears at the top of the screen
  And it displays the goal details (equipo, minuto)
  And tapping the banner navigates to /camara?gol={eventoId}
  And the banner auto-dismisses after 15 seconds if not tapped
```

### Scenario 8: Home en vivo updates without page reload

```gherkin
Given a fan is on the Home page (/)
  And the page subscribes to the active partido via onSnapshot
When the partido's golesLocal field increments (admin scored a goal)
Then the live scoreboard updates the score in real time
  And when festejosPublicados increments, the counter and progress bar update
  And when votosAbiertos changes to false, the upload button disables
  Without the fan reloading the page
```

## Technical Context

### Current State (from prior tickets)

- FASE0: Firebase Spark plan, Firestore schema (`partidos`, `eventos`, `videos`, `votos`), Google Auth, 6 route stubs
- GOL-PUBLICADO: `moderateVideo` Cloud Function writes `estado: publicado/rechazado`; `/admin` has goal trigger form; `/camara` uploads clips; `/estado/:id` shows real-time status
- **`partidos` schema needs 5 new fields** (see schema updates below)
- **`eventos` schema needs 1 new field** (`equipo`) for live scoreboard scoring
- **`moderateVideo` Cloud Function** needs to increment `festejosPublicados` on publish

### Schema Updates Required

#### `partidos` — new fields

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `golesLocal` | number | 0 | Incremented by admin when firing a local gol |
| `golesVisitante` | number | 0 | Incremented by admin when firing a visitante gol |
| `festejosPublicados` | number | 0 | Incremented by `moderateVideo` Cloud Function on publish |
| `votosAbiertos` | boolean | true | Admin sets to `false` to close voting |
| `compromisoSponsor` | string | "" | e.g., "Banco X dona 1 árbol por cada festejo publicado" |

#### `eventos` — new field

| Field | Type | Notes |
|-------|------|-------|
| `equipo` | string | `'local' \| 'visitante'` — which team scored; required for live scoreboard |

### Proposed Changes

#### 1. `/admin` updates
- Add `equipo` field to the goal trigger form (`local` / `visitante` radio)
- On "Disparar Gol": also increment `partidos/{id}.golesLocal` or `golesVisitante` (Firestore transaction)
- Add "Cerrar votación" button per partido: sets `partidos/{id}.votosAbiertos = false`
- Add `compromisoSponsor` text input per partido

#### 2. `moderateVideo` Cloud Function update
- After setting `estado: "publicado"`, call `partidos/{partidoId}` update:
  ```ts
  db.collection("partidos").doc(partidoId)
    .update({ festejosPublicados: FieldValue.increment(1) })
  ```
- Requires `partidoId` to be available on the `videos` document (already in FASE0 schema ✓)

#### 3. `src/hooks/usePartidoEnVivo.ts`
- Queries `partidos` where `estado == 'en_curso'` ordered by `fecha desc`, limit 1
- Returns the live partido document via `onSnapshot`
- Shared by `HomePage`, `GoalAlertBanner`, and vote-window checks

#### 4. `src/components/GoalAlertBanner.tsx` (global)
- Mounted at app root (inside `RouterProvider`)
- Subscribes to `eventos` where `partidoId == livePartido.id` with `onSnapshot`
- Tracks seen evento IDs in a `useRef` to fire only on NEW documents
- Renders a fixed-position banner when a new `tipo: 'gol'` evento arrives and `livePartido.votosAbiertos == true`
- Auto-dismisses after 15 seconds via `setTimeout`; dismissed immediately on tap

#### 5. `src/pages/HomePage.tsx` (full implementation)
```
Live scoreboard: equipoLocal {golesLocal} — {golesVisitante} equipoVisitante
compromisoSponsor text block
"Subir festejo" button → /camara?gol=N (last gol eventoId; disabled when !votosAbiertos)
Progress bar: (festejosPublicados % 20) / 20 toward next pelota
Pelota milestone badges: floor(festejosPublicados / 20) filled ⚽ icons (max 5)
Impacto acumulado: N festejos publicados
```
All fields sourced from a single `onSnapshot` listener on the live partido document.

#### 6. `src/pages/TribunaPage.tsx` (full implementation)
- Query: `videos` where `partidoId == livePartido.id` AND `estado == 'publicado'`, ordered by `creadoEn desc`
- Renders `VideoCard` per video

#### 7. `src/components/VideoCard.tsx`
```tsx
<div style={{ position: 'relative' }}>
  <video src={video.url} controls playsInline />
  <div className="sponsor-overlay">
    {/* Sponsor logo/text — CSS absolute positioning, z-index above video */}
  </div>
  <AplaudirButton videoId={video.id} partidoId={livePartido.id} />
</div>
```

#### 8. `src/components/AplaudirButton.tsx`
- On mount: checks `votos` for `(videoId, auth.currentUser.uid)` to determine initial voted state
- On tap (if not voted + `votosAbiertos`): creates `votos` document via `addDoc`
- Subscribes to `votos` count query for live grito count display

### Pelota Counter Logic

```ts
const pelotas = Math.min(Math.floor(festejosPublicados / 20), 5);
const progressToNext = festejosPublicados < 100
  ? (festejosPublicados % 20) / 20
  : 1; // full bar at cap
```

### Vote Window Logic (client-side enforcement)

```ts
const voteOpen = livePartido.votosAbiertos === true;
// Note: auto-expire after 24h is a future Cloud Scheduler feature.
// This ticket: admin manually closes via /admin. Time-window is advisory only.
```

### Technical Constraints

- **Sponsor overlay must be CSS-only** — no video re-encoding; any attempt to burn the overlay into the video file is explicitly out of scope and will break compliance
- **One vote per user per video** — enforced client-side (disable on voted) AND Firestore security rule (prevent duplicate writes for same userId+videoId)
- **`festejosPublicados` is write-once-increment** — only the `moderateVideo` Cloud Function (service account) may increment it; Firestore security rules must block client writes
- **Pelota cap = 100 festejos** — Cloud Function must not increment beyond 100; use `Math.min(current + 1, 100)` in the update
- **Goal alert fires only once per evento** — `GoalAlertBanner` must track seen IDs client-side to avoid re-firing on Firestore reconnects (which replay the onSnapshot)
- **`onSnapshot` unsubscription on unmount** — all listeners must return their `unsubscribe` from `useEffect` to prevent memory leaks across route changes

### Integration Points

| System | How it connects |
|--------|----------------|
| `partidos` (Firestore) | Central document; all live data flows through `onSnapshot` on this doc |
| `eventos` (Firestore) | Goal alert reads new gol eventos via `onSnapshot`; equipo field added |
| `videos` (Firestore) | /tribuna queries publicado videos; `partidoId` links to active match |
| `votos` (Firestore) | Written on Aplaudir; queried for grito count and voted-state check |
| `moderateVideo` Cloud Function | Updated to increment `partidos.festejosPublicados` on publish |
| Firebase Auth | `auth.currentUser.uid` used as `userId` in votos writes |
| GOL-PUBLICADO pipeline | `/camara?gol=N` flow remains unchanged; banner links into it |

### Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Single `usePartidoEnVivo` hook shared across HomePage, GoalAlertBanner, and vote-window checks | Avoids N parallel `onSnapshot` listeners for the same partido document; all consumers share one subscription |
| Sponsor overlay via CSS `position: absolute` | Explicit requirement; cannot be burned; overlay must survive video seek and fullscreen |
| `GoalAlertBanner` mounted at app root, above `RouterProvider` | Must survive route changes; placing it inside a page component would unmount it on navigation |
| Seen-evento tracking via `useRef<Set<string>>` | Prevents banner re-firing on Firestore reconnect/re-snapshot; `useRef` avoids triggering re-renders on each check |
| `festejosPublicados` as a Firestore counter on `partidos` | Avoids expensive `videos` count queries on every Home render; Cloud Function is the single writer |
| One-way Aplaudir (no undo) | Consistent with "un toque escribe un voto"; simpler security model; prevents vote manipulation |
| Admin-controlled `votosAbiertos` flag | Simpler than Cloud Scheduler auto-close; admin judgment on exact close time; auto-expiry is a future feature |
| Duplicate vote prevention in security rules | Client-side check prevents accidental double-tap; server-side rule is the authoritative guard |

### Wiki Evidence

Not applicable — ticket concerns Firebase Firestore real-time listeners, React component architecture, and CSS overlay, all external to the qubika-agentic-framework codebase.

### Graph Evidence

graph impact-radius check skipped — all files are new or are updates to existing stub pages; no importable symbols in the current codebase to measure.

## Out Of Scope

- Auto-closing the vote window via Cloud Scheduler / cron (24h expiry is advisory; admin closes manually)
- Animated sponsor transitions or video ad insertion
- Multiple simultaneous live matches (ticket assumes one active `en_curso` partido)
- Undo / remove vote (Aplaudir is one-way)
- `/ganadores` page implementation (still a stub — rank by votos count is a separate ticket)
- Push notifications (web push for goal alert is a future ticket; this ticket uses in-app only)
- Thumbnail display in `/tribuna` (thumbnailUrl is `""` from gol-publicado; show fallback)
- Sponsor image upload UI (compromisoSponsor text is set directly in admin form or Firestore console)

## Future Considerations

- Cloud Scheduler to auto-close `votosAbiertos` 24h after `partidos.fechaFin`
- `/ganadores` page: rank videos by `votos` count query or a `gritosCount` denormalized field
- Web Push notification for goal alerts when the app is backgrounded
- Multiple concurrent matches: extend `usePartidoEnVivo` to accept a `partidoId` param
- Pelota animation (confetti/lottie) on milestone unlock
- Sponsor image in the CSS overlay (currently text only)

## Edge Cases And Error Handling

| Case | Handling |
|------|----------|
| No active (`en_curso`) partido | Home shows "No hay partido en vivo" empty state; goal alert listener is inactive; /tribuna shows empty feed |
| Fan taps Aplaudir while votosAbiertos just became false | Client shows "Votación cerrada"; Firestore security rule also rejects the write as a backstop |
| Duplicate vote race condition (double-tap before first write settles) | Security rule rejects the second write; client already disables button optimistically on first tap |
| GoalAlertBanner fires on app start (snapshot replays existing events) | Seen-evento `useRef<Set>` pre-populated on first snapshot flush; banner only fires for IDs not in the set |
| Video on /tribuna fails to load (Storage URL expired or deleted) | `<video>` onerror handler shows a "Video no disponible" fallback; card remains in feed |
| festejosPublicados already at 100 | Cloud Function uses `FieldValue.increment(1)` guarded by `current < 100`; progress bar stays full; no new pelotas |
| compromisoSponsor is empty string | Home renders the sponsor block with an empty text — acceptable for internal testing; prod requires admin to fill it |
| onSnapshot listener fires during route transition | All listeners use `useEffect` cleanup → `unsubscribe()` called on unmount; no orphan listeners |

## Validation Rules

- A `votos` write is valid only when: `request.auth != null` AND `request.resource.data.userId == request.auth.uid` AND `livePartido.votosAbiertos == true`
- Duplicate votos are blocked by Firestore rule: deny create if a document with `(videoId, userId)` already exists
  ```
  // In Firestore rules:
  allow create: if isAuthenticated()
    && request.resource.data.userId == request.auth.uid
    && !exists(/databases/$(database)/documents/votos/$(request.resource.data.userId + "_" + request.resource.data.videoId));
  ```
  *(alternatively enforce via composite key as the document ID)*
- `partidos.festejosPublicados` write is allowed only from the service account (Cloud Function); block all client writes:
  ```
  match /partidos/{id} {
    allow update: if isAdmin()
      || (request.auth == null && /* service account */ true);
      // Better: use Firebase Admin SDK bypass — service account writes bypass security rules
  }
  ```
- Sponsor overlay must not be conditionally hidden — it must always render when a video card renders

## Dependencies

- **Blocking**:
  - FASE0 must be complete (Firestore schema, Google Auth, React Router)
  - GOL-PUBLICADO must be complete (`moderateVideo` Cloud Function; `/camara` upload; `/admin` goal trigger)
  - Firebase Blaze plan must be active (required for Cloud Function update)
- **Updates to prior tickets**:
  - `moderateVideo` Cloud Function must be updated to increment `partidos.festejosPublicados`
  - `/admin` goal form must add `equipo` field and score update
  - Firestore security rules must add vote duplicate prevention

## Definition Of Done

### Infrastructure

- [ ] `partidos` schema updated with 5 new fields (`golesLocal`, `golesVisitante`, `festejosPublicados`, `votosAbiertos`, `compromisoSponsor`) on at least one test document
- [ ] Firestore security rules updated: vote duplicate prevention + `festejosPublicados` client-write block
- [ ] `moderateVideo` Cloud Function updated and redeployed with `festejosPublicados` increment

### Code Quality

- [ ] `usePartidoEnVivo.ts` hook created and shared across HomePage + GoalAlertBanner
- [ ] `GoalAlertBanner.tsx` mounted at app root with seen-evento tracking
- [ ] `HomePage.tsx` fully implemented: live scoreboard, sponsor text, upload button, progress bar, pelota badges, impacto acumulado — all via single onSnapshot
- [ ] `TribunaPage.tsx` fully implemented: paginated/infinite feed of publicado videos for active match
- [ ] `VideoCard.tsx` with `<video>` + CSS sponsor overlay + `AplaudirButton`
- [ ] `AplaudirButton.tsx` with voted-state detection, single-write, live grito count
- [ ] `/admin` updated: `equipo` field on goal form, score update, "Cerrar votación" button, compromisoSponsor input
- [ ] All `useEffect` listeners return `unsubscribe()` cleanup

### Testing

- [ ] All 8 BDD acceptance criteria manually verified
- [ ] Full end-to-end loop executed on a real mobile device (iOS or Android): Home → goal banner → /camara → publish → /tribuna → Aplaudir → counter increments
- [ ] Aplaudir duplicate prevention verified (second tap + page reload both show confirmed state)
- [ ] Sponsor overlay verified: overlay visible during playback; not burned into video file
- [ ] Pelota milestone verified at exactly 20th festejo (manual Firestore counter set to 19, publish one more)
- [ ] Admin vote close verified: close from /admin, confirm Aplaudir disables in open browser tab without reload
- [ ] GoalAlertBanner verified: fires on new gol evento; does not fire on page reload for existing events; auto-dismisses after 15s

### Documentation

- [ ] Firestore security rules for vote deduplication documented in `docs/security-rules.md`
- [ ] `festejosPublicados` increment logic documented in Cloud Function inline comment
- [ ] README updated with note on `compromisoSponsor` field (must be set per-partido before match)

### Review

- [ ] Code reviewed with focus on: `onSnapshot` cleanup, vote security rules, CSS overlay z-index on mobile browsers
- [ ] Cloud Function redeployment verified (`firebase deploy --only functions`)

## Assumptions And Open Questions

| # | Assumption | Impact If Wrong |
|---|-----------|-----------------|
| 1 | "Compromiso del sponsor" is a plain text field on `partidos` (no monetary calculation) | Low — if a numeric value is needed, add `valorPorFestejo: number` and compute `impacto = festejosPublicados × valor` |
| 2 | "Impacto acumulado" = `festejosPublicados` count (shown as "N festejos publicados") | Low — display string is easy to change without schema changes |
| 3 | Only one `en_curso` partido at a time; `usePartidoEnVivo` returns the first result | Medium — multiple concurrent matches require passing `partidoId` explicitly to all components |
| 4 | Vote is one-way (no undo); confirmed state is permanent until votosAbiertos closes | Low — toggle (add/remove) requires deleting the votos doc; security rules change needed |
| 5 | "Ventana corriendo" (upload window) uses same `votosAbiertos` flag as voting (no separate upload window) | Medium — if uploads and votes have different windows, add a separate `subidaAbierta: boolean` field |
| 6 | Auto-close after 24h is out of scope; admin closes manually | Low — Cloud Scheduler can be added in a follow-up without schema changes |
| 7 | Sponsor overlay renders sponsor text from a static/hardcoded source in this ticket (not from Firestore) | Low — can be replaced by a `compromisoSponsor` render or a `sponsorLogoUrl` field without breaking changes |

## Implementation Notes

**`usePartidoEnVivo.ts`:**
```ts
import { collection, query, where, limit, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useEffect, useState } from "react";

export function usePartidoEnVivo() {
  const [partido, setPartido] = useState<PartidoDoc | null>(null);
  useEffect(() => {
    const q = query(
      collection(db, "partidos"),
      where("estado", "==", "en_curso"),
      limit(1)
    );
    return onSnapshot(q, (snap) =>
      setPartido(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() } as PartidoDoc)
    );
  }, []);
  return partido;
}
```

**`GoalAlertBanner.tsx` — seen-evento guard:**
```ts
const seenIds = useRef<Set<string>>(new Set());
const [banner, setBanner] = useState<EventoDoc | null>(null);

useEffect(() => {
  if (!partido) return;
  const q = query(collection(db, "eventos"),
    where("partidoId", "==", partido.id),
    where("tipo", "==", "gol")
  );
  return onSnapshot(q, (snap) => {
    snap.docs.forEach((doc) => {
      if (!seenIds.current.has(doc.id)) {
        seenIds.current.add(doc.id);
        if (seenIds.current.size > 1) { // skip first batch (existing events on mount)
          setBanner({ id: doc.id, ...doc.data() } as EventoDoc);
          setTimeout(() => setBanner(null), 15_000);
        }
      }
    });
    // Mark all initial docs as seen without firing banner
    if (seenIds.current.size === 0) {
      snap.docs.forEach((d) => seenIds.current.add(d.id));
    }
  });
}, [partido?.id]);
```

**CSS sponsor overlay (mobile-safe):**
```css
.video-wrapper {
  position: relative;
  display: inline-block;
  width: 100%;
}
.sponsor-overlay {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 10;
  background: rgba(255,255,255,0.85);
  padding: 4px 8px;
  border-radius: 4px;
  pointer-events: none; /* don't intercept video controls */
}
/* Note: CSS overlay is hidden when native iOS fullscreen is triggered.
   Use playsInline on <video> to keep playback in-page on iOS. */
```

**Vote deduplication — composite document ID:**
```ts
// Use "{userId}_{videoId}" as the votos doc ID for O(1) duplicate check
const votoRef = doc(db, "votos", `${uid}_${videoId}`);
await setDoc(votoRef, { videoId, userId: uid, creadoEn: serverTimestamp() });
// If doc already exists, setDoc with merge:false throws; catch and treat as already-voted
```

## References

- [FASE0 ticket](./fase0-cimiento.md) — Firestore schema baseline
- [GOL-PUBLICADO ticket](./gol-publicado.md) — moderateVideo Cloud Function, /camara, /admin goal trigger
- [GG-01 ticket](./gg-01-spike-camara.md) — CameraSpikeRecorder component
- [Firestore onSnapshot docs](https://firebase.google.com/docs/firestore/query-data/listen)
- [MDN: CSS position absolute + z-index](https://developer.mozilla.org/en-US/docs/Web/CSS/position)
- [Firebase security rules — deny duplicate doc](https://firebase.google.com/docs/firestore/security/rules-conditions)

---

**INVEST Validated**: ⚠️ (at boundary — see advisory at top; passes if delivered in one PR within 5 days)  
**BDD Scenarios**: 8  
**Priority**: High  
**Estimated Duration**: 4–6 days (see split recommendation above)
