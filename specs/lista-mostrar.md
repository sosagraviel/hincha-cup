# LISTA-MOSTRAR: Demo Readiness — Auth, Demo Data & Visual Polish

> **Design reference**: `specs/gritogol-pantallas (1).pdf` — 8 screens, definitive product copy. All copy strings in this ticket are sourced from that document.

## User Story

**As a** product team preparing the GritoGol app for a live demo  
**I want to** have frictionless one-tap auth, pre-loaded demo data that starts at maximum tension, and visually polished functional screens  
**So that** stakeholders experience a compelling, realistic end-to-end flow from the first second without manual setup or obvious placeholder UI

## Stakeholders

| Role | Responsibility |
|------|---------------|
| Product Owner | Defines demo narrative; approves "maximum tension" data configuration |
| Tech Lead | Reviews seed script and auth simplification; clears for demo |
| Development Team | Implements auth, seed script, and screen polish per `gritogol-pantallas` PDF |

## Success Criteria

1. A fresh user lands on the app and completes Google Sign-In (one tap, popup) or auto-enters as anonymous — zero form input required
2. The demo data seed script runs in <30 seconds and leaves the app in a state where a live `partidos` match exists with `festejosPublicados: 37` and pre-recorded videos including the school delivery clip
3. All four functional screens (Home, Cámara, Estado, Tribuna) render without placeholder text, off-brand colors, or broken layout on a real mobile device
4. Screens designated as static (Login shell, Elegir selección, Notificaciones, Ganadores) render as non-interactive stubs without crashing

## Metrics

Demo declared ready when: Google Sign-In completes in ≤2 taps, seed script exits 0, Tribuna loads with `festejosPublicados: 37` displaying correct pelota count (1 pelota — milestone 2 is at 40), and a human QA reviewer marks each of the 4 functional screens as visually acceptable on an iPhone and one Android device.

## Acceptance Criteria

### Scenario 1: Google Sign-In one-tap flow

```gherkin
Given a user who has not signed in before
  And the Login screen shows the GritoGol logo, tagline, and two auth buttons
When the user taps "Continuar con Google"
  And selects their Google account from the popup
Then the user is signed in via Firebase Auth (Google provider)
  And is redirected to the Home screen within 2 seconds
  And no email/password form is displayed at any point
```

### Scenario 2: Anonymous session for demo observers

```gherkin
Given a demo observer who does not want to sign in with Google
  And the Login screen is visible
When the observer taps "Continuar con teléfono" (demo: mapped to anonymous sign-in)
Then Firebase Auth creates an anonymous session via signInAnonymously()
  And the observer is taken to the read-only Home screen (can watch, cannot upload)
  And no email or personal data is required
```

### Scenario 3: Demo data seed — live match at maximum tension

```gherkin
Given the Firebase project is configured and the Blaze plan is active
  And a developer runs: npx ts-node scripts/seed-demo.ts --env staging
When the script completes without error
Then exactly one "partidos" document exists with estado: "en_curso"
  And that document has festejosPublicados: 37, equipoLocal: "Argentina", equipoVisitante: "México"
  And golesLocal: 2, golesVisitante: 1, votosAbiertos: true, compromisoSponsor: "Marca X dona 1 pelota cada 20 festejos · tope 100 por partido"
  And the cumulative impact counters show 47 pelotas, 3 becas, 2 escuelas
  And the destination reads "Club Defensoras de Ezeiza"
  And at least 5 "videos" documents exist with estado: "publicado" and real Storage URLs
  And one video is tagged as tipo: "entrega_escuela" with descripcion referencing the school delivery event
  And the Home screen renders exactly 1 pelota filled and the progress bar at 37/40
```

### Scenario 4: Demo data seed — school delivery video visible in Tribuna

```gherkin
Given the seed script has run successfully
  And the user opens the Tribuna screen
When the video feed loads
Then the school delivery video ("video de la entrega en la escuela") appears in the list
  And it renders with a thumbnail, title, and applause count
  And tapping the video opens the playback view without errors
```

### Scenario 5: Home screen visual polish

```gherkin
Given a signed-in user on the Home screen
When the screen renders on a 390px-wide viewport (iPhone 14)
Then all text uses the definitive copy (no "TODO", "placeholder", or hard-coded test strings)
  And colors match the approved palette (primary, secondary, background)
  And the visual hierarchy — logo, live match banner, CTA button — is clear at a glance
  And no layout overflow or clipped text is visible
```

### Scenario 6: Cámara screen visual polish

```gherkin
Given a signed-in user who has granted camera permissions
When the Cámara screen renders
Then the record button, timer, and sponsor overlay are positioned correctly
  And the sponsor overlay uses CSS positioning (not burned into video)
  And the "Subir festejo" CTA is visible after recording stops
  And no raw API error strings are exposed in the UI
```

### Scenario 7: Estado screen — publicado and rechazado states

```gherkin
Given a video in estado "publicado"
When the user opens /estado/:id for that video
Then the screen shows a green success indicator with definitive copy ("¡Tu festejo fue publicado!")
  And the applause count and share action are visible

Given a video in estado "rechazado"
When the user opens /estado/:id for that video
Then the screen shows a clear rejection message with retry affordance
  And no raw moderation API response text is displayed
```

### Scenario 8: Static stub screens do not crash

```gherkin
Given routes /login, /elegir-seleccion, /notificaciones, /ganadores are defined in the router
When a user navigates to any of these routes
Then a static placeholder screen renders (no functional content required)
  And the app does not throw a runtime error or show a blank white screen
  And a "Próximamente" or equivalent message is visible
```

## Technical Context

### Current State

- FASE0 established Firebase Auth (Google Sign-In) and React Router with all 6 routes
- GOL-PUBLICADO implemented the upload → moderation → Estado pipeline
- TRIBUNA implemented live data hooks, GoalAlertBanner, pelota counter, and the vote system
- Demo data does not exist; the database is empty
- Auth UX has the Google Sign-In popup but no anonymous/phone path and no visual finalization
- Screen polish is deferred from prior tickets; placeholder text and colors remain on all screens
- Design reference available: `specs/gritogol-pantallas (1).pdf` — 8 screens with definitive copy

### Proposed Changes

#### 1. Auth Simplification (`src/pages/AuthPage.tsx` + `src/lib/auth.ts`)

- Add `signInAnonymously()` path: "Continuar sin cuenta" button calls `firebase/auth` `signInAnonymously`
- Google Sign-In stays as-is (popup, `signInWithPopup(auth, googleProvider)`) — remove any intermediate form wrapper if present
- Gate upload/vote actions on non-anonymous auth (`user.isAnonymous` check); show "Inicia sesión con Google para participar" prompt inline
- No Login page redesign — the existing auth entry point is styled as part of the visual polish subtask

#### 2. Demo Seed Script (`scripts/seed-demo.ts`)

```typescript
// Run with: npx ts-node scripts/seed-demo.ts
// Requires: FIREBASE_PROJECT_ID, FIREBASE_SERVICE_ACCOUNT env vars

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const PARTIDO_ID = "demo-partido-001";
const DEMO_VIDEOS = [
  {
    id: "video-gol-1",
    titulo: "Gol del local en el minuto 23",
    estado: "publicado",
    festejosPublicados: 12,
  },
  {
    id: "video-entrega-escuela",
    titulo: "Entrega de camisetas en la escuela",
    tipo: "entrega_escuela",
    estado: "publicado",
    festejosPublicados: 8,
  },
  // + 3 more pre-recorded clips
];

// Creates:
//   partidos/demo-partido-001  { estado: "en_curso", festejosPublicados: 37,
//                                golesLocal: 2, golesVisitante: 1, votosAbiertos: true,
//                                equipoLocal: "Argentina", equipoVisitante: "México",
//                                compromisoSponsor: "Marca X dona 1 pelota cada 20 festejos · tope 100 por partido",
//                                destinoONG: "Club Defensoras de Ezeiza",
//                                impactoPelotas: 47, impactoBecas: 3, impactoEscuelas: 2 }
//   videos/*                   (pre-seeded with Storage URLs; incl. 1 tipo:"entrega_escuela")
//   eventos/*                  (3 goal events: minuto 23 equipo:"local", 45 "visitante", 67 "local")
```

- Script is idempotent: uses `set({ merge: false })` with deterministic doc IDs; re-running resets state cleanly
- Accepts `--env staging | production` flag; refuses to run against production without `--confirm` flag
- Uploads seed video files from `scripts/seed-assets/` to Firebase Storage if `--upload-assets` flag is passed; otherwise uses pre-existing Storage URLs stored in `scripts/seed-config.json`
- Prints a summary table on completion: collections written, document counts, total elapsed time

#### 3. Visual Polish (4 Functional Screens)

Design reference: `specs/gritogol-pantallas (1).pdf`. All copy strings below are definitive product copy from that document.

**Brand tokens (extracted from mockup):**

| Token | Value | Usage |
|-------|-------|-------|
| `--color-primary` | Dark navy blue | Headings, active nav tab, primary CTA fill |
| `--color-accent` | Medium blue | Selected state outline, score text in camera overlay |
| `--color-success` | Teal/mint | Checkmark circle on Estado-publicado, progress bar fill |
| `--color-live` | Red/coral | Live dot indicator, REC dot on camera |
| `--color-surface` | White | Screen backgrounds |
| `--color-text-secondary` | Medium gray | Subtitles, timestamps, footer captions |

**Bottom navigation bar (present on all 4 functional screens):**

| Tab | Icon | Label | Active route |
|-----|------|-------|-------------|
| 1 | House | Inicio | `/` |
| 2 | Play triangle | Tribuna | `/tribuna` |
| 3 | Star | Ganadores | `/ganadores` |
| 4 | Circle (profile) | Perfil | `/perfil` |

---

**Screen 1 — Login** (`/`) — functional for demo (auth entry point):

| Element | Definitive copy / spec |
|---------|----------------------|
| Logo | Circle with "GG" initials, primary navy fill |
| App name | **GritoGol** (bold, primary navy) |
| Tagline | "Tu grito de gol se convierte en una pelota para una niña que quiere jugar" (centered, 3 lines, gray) |
| Primary CTA | **"Continuar con teléfono"** — solid navy, full-width, rounded pill |
| Secondary CTA | **"Continuar con Google"** — outline, full-width, rounded pill |
| Footer | "Al continuar aceptás los términos y la política de datos" (small, gray, centered) |
| Demo note | For demo: "Continuar con teléfono" → `signInAnonymously()`; "Continuar con Google" → `signInWithPopup`. Phone OTP flow is out of scope for this ticket. |

---

**Screen 3 — Home del partido** (`/`) — functional:

| Element | Definitive copy / spec |
|---------|----------------------|
| App bar left | **GritoGol** (bold, primary navy) |
| App bar right | "Avisos" chip with notification badge |
| Live indicator | "● EN VIVO · 67'" (red dot, bold) |
| Score | **"Argentina 2 – 1 México"** (large bold, primary navy) |
| Last event | "Gol de Argentina hace 2 minutos" (gray, small) |
| Sponsor card | "**Marca X** dona 1 pelota cada 20 festejos · tope 100 por partido" |
| Main CTA card | "**¡GOL! Subí tu festejo**" (large bold) / "ventana abierta — quedan 7:42" (countdown, gray) |
| Progress label | "**37/40** festejos" (left) + "próxima pelota" (right) |
| Progress bar | Teal fill, ~92.5% width |
| Destination | "Destino: Club Defensoras de Ezeiza" (small, gray) |
| Impact stats | "**47** pelotas" · "**3** becas" · "**2** escuelas" (3-column grid) |
| Trust note | "Donaciones verificadas por la ONG aliada — la app no maneja dinero" (small, centered, gray) |
| Bottom nav | Inicio active |

---

**Screen 5 — Cámara** (`/camara`) — functional:

| Element | Definitive copy / spec |
|---------|----------------------|
| Background | Full-screen dark (camera preview) |
| Top left | "● REC 0:04" (red dot + elapsed timer, white text) |
| Top right | "ventana del gol: 6:12" (countdown, white text) |
| Sponsor overlay | White card, top area — "**ARG 2 – 1 MEX · 67'**" (bold, accent blue) / "con Marca X · este grito suma" (gray) |
| Camera area | Frontal camera preview; label "cámara frontal" (gray, centered below preview) |
| Record button | Large red circle inside white ring, centered at bottom |
| Bottom left | "máx. 10 segundos" (small, gray) |
| Bottom right | "se publica con tu overlay" (small, gray) |
| Overlay CSS | `position: absolute; top: 8px; left: 8px; z-index: 10; pointer-events: none` |

---

**Screen 6 — Publicado** (`/estado/:id`, estado = "publicado") — functional:

| Element | Definitive copy / spec |
|---------|----------------------|
| Icon | Large teal circle with white checkmark, centered |
| Headline | **"¡Publicado!"** (large bold, primary navy) |
| Subhead | "Tu grito es el **#38**" (bold number) |
| Progress copy | "Faltan 2 festejos para la próxima pelota" (gray) |
| Progress bar | Teal fill, ~95% width |
| Destination | "Destino: Club Defensoras de Ezeiza" (small, gray) |
| Primary CTA | **"Ver la Tribuna y votar"** — solid navy, full-width, rounded |
| Secondary CTA | **"Compartir mi festejo"** — outline, full-width, rounded |
| Footer | "Revisado y aprobado por la IA de moderación en 9 segundos" (small, gray, centered) |
| Active nav | Tribuna |

**Estado — rechazado** (same route, estado = "rechazado") — functional:
- Replace teal checkmark with a red/warning icon
- Headline: "Tu festejo no fue aprobado"
- Body: "No cumple con las condiciones de la comunidad. Podés intentarlo de nuevo."
- CTA: "Volver a intentarlo" (primary) — navigates back to `/camara`
- No raw moderation API text exposed

---

**Screen 7 — La Tribuna** (`/tribuna`) — functional:

| Element | Definitive copy / spec |
|---------|----------------------|
| Header | **"La Tribuna"** (bold, primary navy) |
| Subtitle | "ARG vs MEX · votación abierta hasta mañana 22:00" (gray) |
| Video card | Full-width dark thumbnail; below: "@{username}" (bold) / "Gol {N} · hace {X} min · con Marca X" (gray) |
| Vote button | "Aplaudir · {count}" — outline pill, right-aligned; taps increment count (one-way) |
| Sort note | "El feed se ordena por reciente — un toque en Aplaudir es un voto" (small, gray, centered) |
| Active nav | Tribuna |

#### 4. Static Stub Screens

Three screens from the PDF are out of scope for demo functionality but must not crash. They render with the correct chrome (bottom nav, header) and a "Próximamente" body.

| Route | Screen name | Header copy | Notes |
|-------|-------------|-------------|-------|
| `/elegir-seleccion` | Elegir tu selección | "Elegí tu selección" | Mockup: 2-col country grid + "Activar notificaciones y empezar" CTA — render as static image or non-interactive layout |
| `/notificaciones` | Notificaciones | "< Notificaciones" | Mockup shows 4 notification types — render static list with seeded copy or Próximamente banner |
| `/ganadores` | Ganadores | "Ganadores" | Mockup: "Salón del Mundial — Top 3 de cada partido" — render static with seeded results or Próximamente banner |

```tsx
export function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <h1 className="text-2xl font-bold">{label}</h1>
      <p className="text-gray-500">Próximamente</p>
    </div>
  );
}
```

### Platform Codec Matrix

Not applicable to this ticket — video recording codec concerns are covered by GG-01 and GOL-PUBLICADO.

### Technical Constraints

- Firebase Blaze plan required for seed script (Cloud Functions + Storage rules with Admin SDK)
- Seed script must be executed from a machine with Firebase Admin SDK service account credentials — never committed to the repo
- `signInAnonymously()` must be enabled in the Firebase Auth console (Email/Anonymous provider)
- `scripts/seed-assets/` video files are not committed to git; stored in a shared cloud location documented in `scripts/README.md`
- Visual polish CSS changes must not introduce regressions in the CameraPage video preview layout (sponsor overlay `z-index` conflict risk)

### Integration Points

- `firebase/auth`: `signInAnonymously`, `signInWithPopup`, `GoogleAuthProvider`
- `firebase-admin`: Firestore write, Storage upload (seed script only)
- React Router v6 `createBrowserRouter` — all routes already defined in FASE0
- `usePartidoEnVivo` hook (TRIBUNA) — reads the seeded `partidos` doc; no changes needed
- Pelota counter logic (TRIBUNA) — seeded `festejosPublicados: 37` must fall into the 20–39 range to render exactly 1 pelota

### Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Idempotent seed script with deterministic doc IDs | Allows re-seeding before each demo without manual cleanup; safe to run multiple times |
| Anonymous auth gates upload/vote, not read | Demo observers can watch without signing in; auth friction only at participation |
| `festejosPublicados: 37` (not 39) | Leaves headroom for a live upload during the demo to visibly cross the 40-festejos / 2nd-pelota milestone |
| Definitive copy sourced from PDF mockup | `gritogol-pantallas` PDF is the design reference — no Figma needed for this ticket |
| `ComingSoon` component for static stubs | Prevents white screens and runtime errors on defined routes; zero maintenance cost |

### Wiki Evidence

Not applicable — this ticket modifies the GG client app; the QAF wiki covers the orchestration CLI and Docusaurus site. Relevant prior tickets: FASE0, GOL-PUBLICADO, TRIBUNA.

### Graph Evidence

Impact radius: changes touch `src/pages/AuthPage.tsx`, `src/lib/auth.ts`, `scripts/seed-demo.ts` (new), `src/components/ComingSoon.tsx` (new), and CSS/style files for 4 screens. Scope is bounded to the GG client; no Cloud Functions changes.

## Out Of Scope

- Phone OTP auth (`signInWithPhoneNumber`) — "Continuar con teléfono" maps to anonymous sign-in for the demo
- Elegir selección, Notificaciones, Ganadores functional implementation (static stubs only)
- Video compression, transcoding, or server-side processing changes
- New Cloud Functions or Firestore security rule changes
- Full Tailwind design token system (brand tokens are applied inline/scoped; full design system is a follow-up)
- Production data seeding (staging/demo environment only)

## Future Considerations

- Phone OTP auth (`signInWithPhoneNumber`) — implement when real phone-number auth is required; the demo uses anonymous as a stand-in
- Full Tailwind design token system — extract brand tokens from this ticket into a shared `tailwind.config.ts` theme object
- `scripts/seed-demo.ts` can be extended to seed Ganadores results (Top 3 per match with "pelota entregada · ver video" entries)
- Anonymous → Google upgrade flow: `linkWithPopup` to preserve anonymous session data on account upgrade
- Demo "reset" button for product team to re-seed without terminal access

## Edge Cases And Error Handling

| Case | Handling |
|------|----------|
| Google Sign-In popup blocked by browser | Catch `auth/popup-blocked`; show "Habilita popups e intenta de nuevo" inline |
| `signInAnonymously()` fails (network) | Catch error; show retry button; do not crash |
| Seed script run against wrong environment | `--env production` without `--confirm` exits with error code 1 and explicit warning |
| Seed script asset upload fails (Storage quota) | Script logs the failed asset path and continues; prints a warning summary at end |
| `festejosPublicados` already ≥ 40 after re-seed | Script always resets to 37 (idempotent); cannot drift past milestone during seeding |
| ComingSoon route navigated directly | Renders static stub; no data fetch, no error |
| Sponsor overlay overlaps record button on small screen | CSS `pointer-events: none` on overlay ensures underlying button remains tappable |

## Validation Rules

- Seed script: `festejosPublicados` of the seeded `partidos` doc must equal exactly 37
- Seed script: at least one video with `tipo: "entrega_escuela"` and `estado: "publicado"` must exist after seeding
- Auth: `signInAnonymously()` must produce a valid `User` object with `isAnonymous: true`
- Auth: Google Sign-In must complete in a single popup — no redirect loop, no intermediate form
- Visual: no screen may display strings matching `/TODO|placeholder|undefined|null/i` in rendered text
- Visual: all 4 functional screens must pass layout review at 390px and 414px viewport widths

## Dependencies

- **Blocking on this ticket**: Design team mockup delivery for full visual polish
- **Blocked by**: FASE0 (Firebase Auth, React Router), GOL-PUBLICADO (Estado screen exists), TRIBUNA (Tribuna screen + pelota counter exist) — all must be merged before this ticket
- **Blocks**: Production demo readiness sign-off

## Definition Of Done

### Code Quality

- [ ] `AuthPage` supports Google Sign-In one-tap and anonymous session; no forms present
- [ ] `signInAnonymously()` integrated and wired to "Continuar sin cuenta" button
- [ ] Upload and vote actions guarded by `!user.isAnonymous` check with inline prompt
- [ ] `scripts/seed-demo.ts` committed (without service account credentials); idempotent; `--env` flag required
- [ ] `scripts/seed-config.json` committed with Storage URLs for pre-seeded video assets
- [ ] `scripts/README.md` documents how to obtain seed assets and run the script
- [ ] `ComingSoon` component renders on all 4 static-stub routes without runtime error
- [ ] Placeholder/TODO text replaced on all 4 functional screens
- [ ] Sponsor overlay does not block interactive elements on 390px viewport
- [ ] TypeScript strict mode; no `any` introduced

### Testing

- [ ] Google Sign-In popup flow tested on real iOS (Safari) and Android (Chrome)
- [ ] Anonymous session tested on both platforms; upload gate prompt verified
- [ ] Seed script run end-to-end on staging Firebase project; summary table reviewed
- [ ] All 8 BDD acceptance criteria manually verified and documented
- [ ] Tribuna screen verified to show exactly 1 pelota with `festejosPublicados: 37`
- [ ] Estado screens (publicado and rechazado) verified with seeded data
- [ ] ComingSoon stubs verified at all 4 routes — no blank screens
- [ ] Layout review at 390px and 414px on real devices (no clipping, no overflow)

### Documentation

- [ ] `scripts/README.md` includes: prerequisites, environment setup, run instructions, asset source location
- [ ] Visual polish design dependency documented in ticket comments / PR description
- [ ] Demo run-book updated to include: seed command, auth instructions for demo presenter

### Review And Deployment

- [ ] Seed script reviewed by Tech Lead before first demo run
- [ ] Auth changes reviewed for security (anonymous user scope, upload gate correctness)
- [ ] Deployed to Firebase Hosting staging channel; product team performs demo dry-run
- [ ] Go/no-go sign-off from Product Owner before live demo date

## Assumptions And Open Questions

| # | Assumption | Impact If Wrong |
|---|-----------|-----------------|
| 1 | `festejosPublicados: 37` is the agreed demo starting point (next milestone at 40 = "maximum tension") | Low — update seed config; no code change |
| 2 | Anonymous Auth provider is already enabled in the Firebase console | Medium — must be enabled before auth flow can work; 1-minute console action |
| 3 | Pre-recorded video files (including school delivery) are available in a shared drive/bucket | High — seed script cannot upload assets without source files; demo is blocked |
| 4 | "Continuar con teléfono" maps to anonymous sign-in for demo; phone OTP is not required | Medium — if real phone auth is needed, implement `signInWithPhoneNumber` (separate ticket) |
| 5 | "Marca X" in the mockup is a sponsor placeholder; actual sponsor name is provided separately for the live demo | Low — update `compromisoSponsor` string in seed config; no code change |
| 6 | Demo is run on staging, not production Firebase project | Low — `--env` flag enforces this; no prod data at risk |

## Implementation Notes

**Auth gate for anonymous users:**
```tsx
function UploadGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.isAnonymous) {
    return (
      <div className="text-center p-4">
        <p>Inicia sesión con Google para subir tu festejo.</p>
        <button onClick={() => signInWithPopup(auth, googleProvider)}>
          Iniciar sesión
        </button>
      </div>
    );
  }
  return <>{children}</>;
}
```

**Seed script run command:**
```bash
# Staging seed (no asset upload — uses pre-existing Storage URLs in seed-config.json)
FIREBASE_PROJECT_ID=gg-staging npx ts-node scripts/seed-demo.ts --env staging

# Staging seed with asset upload
FIREBASE_PROJECT_ID=gg-staging npx ts-node scripts/seed-demo.ts --env staging --upload-assets

# Production (requires explicit confirmation)
FIREBASE_PROJECT_ID=gg-prod npx ts-node scripts/seed-demo.ts --env production --confirm
```

**Pelota counter validation:**
```
festejosPublicados: 37 → Math.min(Math.floor(37 / 20), 5) = Math.min(1, 5) = 1 pelota ✓
festejosPublicados: 40 → Math.min(Math.floor(40 / 20), 5) = Math.min(2, 5) = 2 pelotas (milestone)
```

**Visual polish implementation checklist (from PDF mockup):**
- Apply brand color tokens: dark navy for headings/CTAs, teal for success/progress, red for live indicators
- Bottom nav: 4 tabs — Inicio (house), Tribuna (play), Ganadores (star), Perfil (circle) — active tab in primary navy
- Login: "GritoGol" heading + 3-line tagline + two full-width pill buttons (solid primary + outline)
- Home: "● EN VIVO · {min}'" live badge, score in large bold, "37/40 festejos" progress bar, 3-col impact stats
- Camera overlay card: white card top-left, `position: absolute; top: 8px; left: 8px; z-index: 10; pointer-events: none`
- Estado-publicado: teal checkmark circle + "¡Publicado!" + "Tu grito es el #{N}" + teal progress bar
- Tribuna: "@{username}" bold / "Gol {N} · hace {X} min · con Marca X" / "Aplaudir · {N}" pill
- Verify `playsInline` on all `<video>` elements (prevents iOS fullscreen hijack)
- No screen may render strings matching `/TODO|placeholder|undefined|null/i`

## References

- [Firebase Auth — Anonymous Authentication](https://firebase.google.com/docs/auth/web/anonymous-auth)
- [Firebase Auth — Google Sign-In (Popup)](https://firebase.google.com/docs/auth/web/google-signin)
- [Firebase Admin SDK — Firestore](https://firebase.google.com/docs/firestore/manage-data/add-data#node.js_1)
- Prior tickets: FASE0-CIMIENTO, GOL-PUBLICADO, TRIBUNA

---

**INVEST Validated**: ✅  
**BDD Scenarios**: 8  
**Priority**: High (Demo Readiness)  
**Estimated Duration**: 2–3 days  
**Design Reference**: `specs/gritogol-pantallas (1).pdf` — 8 screens, definitive copy, no external dependency
