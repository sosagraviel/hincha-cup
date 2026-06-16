# FASE0: Cimiento del proyecto — Firebase setup + React Router scaffold

## User Story

**As a** development team building the GG React application  
**I want to** configure Firebase (Auth, Firestore, Storage, Hosting) on the free Spark plan and establish the React routing scaffold with 6 flat empty routes  
**So that** every subsequent feature ticket has a working infrastructure to build on, with no blocking setup debt

## Stakeholders

| Role | Responsibility |
|------|---------------|
| Tech Lead | Accepts infrastructure decisions; validates Firestore schema and security rules |
| Development Team | Executes Firebase project creation, schema definition, and routing scaffold |
| Product Owner | Informed when foundation is complete and feature development can begin |

## Success Criteria

1. Firebase project is live on the Spark (free) plan with Auth, Firestore, Storage, and Hosting all reachable from the React app
2. Google Sign-In authenticates a real user end-to-end in the local dev environment
3. All 4 Firestore collections (`partidos`, `eventos`, `videos`, `votos`) exist with the agreed field definitions and pass basic security-rule validation
4. Firebase Hosting serves a built React app at the project's `.web.app` / `.firebaseapp.com` URL
5. React Router renders all 6 routes (`/`, `/camara`, `/estado/:id`, `/tribuna`, `/ganadores`, `/admin`) as empty stubs without console errors

## Metrics

Foundation is done when: a developer can `npm run dev`, sign in with Google, read/write a test document in each collection under correct auth, and navigate all 6 routes without errors.

## Acceptance Criteria

### Scenario 1: Google Sign-In completes and persists session

```gherkin
Given the React app is running on localhost
  And Firebase Auth is configured with the Google provider
When a user clicks "Iniciar sesión con Google"
  And completes the Google OAuth popup
Then the user's displayName and photoURL are available via auth.currentUser
  And the session persists on page reload (Firebase Auth persistence: LOCAL)
  And the user is redirected or the UI updates to reflect the authenticated state
```

### Scenario 2: All 6 routes render without errors

```gherkin
Given the React app is running with React Router configured
  And no auth guards are applied to any route
When a developer navigates to each of the following paths:
  /, /camara, /estado/test-id, /tribuna, /ganadores, /admin
Then each route renders its placeholder component
  And no JavaScript errors appear in the console
  And the browser URL updates correctly for each navigation
```

### Scenario 3: Video document is created with all required fields

```gherkin
Given an authenticated user (Google Sign-In completed)
When a Firestore write is issued to the "videos" collection with:
  { userId, partidoId, url, titulo, thumbnailUrl, estado: "revisando", creadoEn }
Then the document is accepted by Firestore
  And the document is readable by the same authenticated user
  And the "estado" field is exactly "revisando"
```

### Scenario 4: Unauthenticated write is rejected by security rules

```gherkin
Given an unauthenticated client (no Firebase Auth session)
When the client attempts to write a document to any collection (partidos, eventos, videos, or votos)
Then Firestore returns a PERMISSION_DENIED error
  And no document is created
```

### Scenario 5: Firebase Hosting serves the production build

```gherkin
Given the React app has been built with "npm run build"
  And "firebase deploy --only hosting" has been executed
When a developer opens the project's .web.app URL in a browser
Then the React app loads correctly
  And the Google Sign-In flow works on the hosted URL (not just localhost)
  And no mixed-content or CORS errors appear in the console
```

## Technical Context

### Current State

- No Firebase project exists for GG
- No React project exists for GG
- This ticket creates all project-level infrastructure from zero

### Proposed Changes

1. Create Firebase project on Spark (free) plan via Firebase Console
2. Enable Firebase services: Authentication, Firestore (Native mode), Storage, Hosting
3. Configure Google Sign-In as the sole auth provider
4. Define Firestore collections with the agreed schema (see below)
5. Write and deploy Firestore security rules
6. Write and deploy Storage security rules
7. Initialize Firebase Hosting with `firebase init`
8. Create React app (Vite + TypeScript), install Firebase SDK and React Router v6
9. Configure Firebase in the app via environment variables
10. Define 6 flat routes with empty stub components

### Firestore Collection Schema

#### `partidos`
| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Auto-generated doc ID |
| `equipoLocal` | string | Home team name |
| `equipoVisitante` | string | Away team name |
| `fecha` | Timestamp | Match date/time |
| `estado` | string | `'programado' \| 'en_curso' \| 'finalizado'` |

#### `eventos`
| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Auto-generated doc ID |
| `partidoId` | string | Reference to `partidos` doc |
| `tipo` | string | e.g. `'gol'`, `'falta'`, `'tarjeta'` |
| `minuto` | number | Match minute |
| `descripcion` | string | Short event description |

#### `videos`
| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Auto-generated doc ID |
| `userId` | string | Firebase Auth UID of submitter |
| `partidoId` | string | Reference to `partidos` doc |
| `eventoId` | string? | Optional reference to `eventos` doc |
| `url` | string | Firebase Storage download URL |
| `titulo` | string | Video title provided by the user |
| `thumbnailUrl` | string | Firebase Storage download URL for thumbnail |
| `estado` | string | `'revisando' \| 'publicado' \| 'rechazado'` |
| `creadoEn` | Timestamp | Server timestamp at creation |

#### `votos`
| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Auto-generated doc ID |
| `videoId` | string | Reference to `videos` doc |
| `userId` | string | Firebase Auth UID of voter |
| `creadoEn` | Timestamp | Server timestamp at vote |

### React Router — Route Manifest

| Path | Component | Notes |
|------|-----------|-------|
| `/` | `HomePage` | Home / landing |
| `/camara` | `CameraPage` | Video recording (uses GG-01 spike) |
| `/estado/:id` | `EstadoPage` | Video review status for a specific video ID |
| `/tribuna` | `TribunaPage` | Public fan video feed |
| `/ganadores` | `GanadoresPage` | Winners / leaderboard |
| `/admin` | `AdminPage` | Admin video review panel |

All components are empty stubs returning a `<h1>` with the page name. No auth guards. No nested routes.

### Technical Constraints

- **Spark plan limits**: 50k reads/day, 20k writes/day, 1 GB Storage, 10 GB Hosting/month — sufficient for development; must be revisited before launch
- **Firestore Native mode** (not Datastore mode) — cannot be changed after creation
- **React Router v6** — `createBrowserRouter` + `RouterProvider` pattern (not the legacy `<BrowserRouter>`)
- **Firebase SDK v9+** (modular) — import individual functions, not the compat namespace, to keep bundle size small
- **Environment variables**: all Firebase config values (`apiKey`, `authDomain`, etc.) must be stored in `.env.local` and never committed to git; `.env.example` is committed with placeholder values
- **Google Sign-In popup** (not redirect) for localhost dev; redirect may be needed for some mobile browsers — revisit in a later ticket

### Integration Points

- **Firebase Console** — project creation and manual service activation
- **Firebase CLI** (`firebase-tools`) — Hosting init, deploy, emulator suite
- **Google Cloud Console** — OAuth 2.0 credentials (created automatically when enabling Google Sign-In in Firebase)
- **GG-01 spike** (`/camara` route) — the `CameraPage` stub created here will be fleshed out once the camera spike validates feasibility

### Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Google Sign-In for all users | Single auth provider reduces complexity; Google accounts are ubiquitous; no password reset flow needed |
| Admin role via custom claim (not a separate provider) | All users authenticate with Google; admin status is granted via Firebase Admin SDK custom claim (`admin: true`) or a Firestore `admins/{uid}` document — not a separate auth path |
| Firestore Native mode | Required for real-time listeners and subcollection support; Datastore mode cannot be selected after project creation |
| Firebase SDK v9 modular imports | Tree-shakeable; reduces production bundle size vs. compat SDK |
| Vite + TypeScript for React app | Fast HMR, native ESM, first-class TypeScript support; standard for React projects in 2026 |
| `createBrowserRouter` (React Router v6) | Future-proof; enables data loading APIs in later tickets; no nested routes required now |
| Flat route structure | Explicitly required; no guards — authentication UI is a future concern |
| `.env.local` for Firebase config | Firebase config values are not secrets (they are embedded in the browser bundle), but keeping them in env vars prevents accidental hardcoding and simplifies multi-environment setups |

### Wiki Evidence

Not applicable — this ticket concerns Firebase and React Router setup for the GG client application, which is external to the qubika-agentic-framework codebase.

### Graph Evidence

graph impact-radius check skipped — greenfield project; no existing file paths to measure.

## Out Of Scope

- Authentication guards or protected routes (explicitly excluded per ticket description)
- Nested routes (explicitly excluded)
- Admin role assignment UI — custom claim/admin document creation is done manually via Firebase Console or a one-off script
- Firestore subcollections
- Firebase Cloud Functions
- Firebase App Check
- CI/CD pipeline for Hosting deploys
- Video upload logic (the `url` and `thumbnailUrl` fields exist in the schema; actual upload is a separate ticket)
- Error boundary components or global error handling
- Any production-readiness work (rate limiting, abuse prevention, Spark → Blaze upgrade planning)

## Future Considerations

- Add Firebase Emulator Suite to local dev workflow for offline testing
- Upgrade to Blaze plan before launch (required for Cloud Functions and higher quotas)
- Implement auth guard for `/admin` route once role management is in place
- Add `onVote` composite index in Firestore for `votos` (videoId + userId) to enforce one-vote-per-user constraint efficiently
- React Router data loaders for `/estado/:id` and `/tribuna`

## Edge Cases And Error Handling

| Case | Handling |
|------|----------|
| User closes Google Sign-In popup | Catch `auth/popup-closed-by-user`; silently ignore (user chose to cancel) |
| Google Sign-In blocked by popup blocker | Catch `auth/popup-blocked`; surface "Habilita las ventanas emergentes para iniciar sesión" message |
| Firebase project misconfigured (wrong `apiKey`) | Firebase SDK throws `auth/invalid-api-key`; catch in app initialization and display configuration error |
| Firestore write rejected (PERMISSION_DENIED) | Catch Firestore error; display "No tienes permiso para realizar esta acción" |
| Route not found (path outside the 6 defined routes) | Add a catch-all `*` route rendering a 404 stub component |
| `estado/:id` called with a non-existent video ID | `EstadoPage` will handle this in a later ticket; stub renders the ID from params for now |

## Validation Rules

- `videos.estado` must be one of `'revisando' | 'publicado' | 'rechazado'` — enforced in Firestore security rules via `request.resource.data.estado in ['revisando', 'publicado', 'rechazado']`
- `votos` must include both `videoId` and `userId` — enforced in security rules
- `partidos.estado` must be one of `'programado' | 'en_curso' | 'finalizado'`
- `videos.userId` must equal `request.auth.uid` on create — users can only submit videos for themselves

## Dependencies

- **Blocking**: None — this is the project foundation; all other GG tickets are blocked on this one
- **Related**: GG-01 (camera spike) — the `/camara` route stub created here will be populated with the `CameraSpikeRecorder` component once GG-01 is complete

## Definition Of Done

### Code Quality

- [ ] Firebase project created on Spark plan with all 4 services enabled
- [ ] React app created with Vite + TypeScript; Firebase SDK (v9 modular) and React Router v6 installed
- [ ] Firebase initialized in the app via a `src/lib/firebase.ts` module exporting `app`, `auth`, `db`, `storage`
- [ ] All Firebase config values in `.env.local`; `.env.example` committed with placeholder values
- [ ] 6 stub route components created under `src/pages/`
- [ ] `createBrowserRouter` configured with all 6 routes and a 404 catch-all
- [ ] Firestore security rules written and deployed (see rules template in Implementation Notes)
- [ ] Storage security rules written and deployed
- [ ] `firebase.json` and `.firebaserc` committed to the repository

### Testing

- [ ] All 5 BDD acceptance criteria manually verified
- [ ] Google Sign-In tested in Chrome on localhost (popup flow)
- [ ] Google Sign-In tested on a real mobile device via HTTPS tunnel (ngrok / localtunnel)
- [ ] Firestore security rules tested with the Firebase Emulator: authenticated write succeeds, unauthenticated write is rejected
- [ ] All 6 routes navigated manually without console errors
- [ ] Firebase Hosting: production build deployed and verified at `.web.app` URL

### Documentation

- [ ] `.env.example` committed with all required variable names
- [ ] Firestore collection schema documented in `docs/schema.md` (or equivalent)
- [ ] README updated with: Firebase setup instructions, `npm run dev` command, emulator command

### Review And Deployment

- [ ] Code reviewed and approved by Tech Lead (focus: security rules correctness)
- [ ] Firebase Hosting deploy verified by at least one team member on the hosted URL

## Assumptions And Open Questions

| # | Assumption | Impact If Wrong |
|---|-----------|-----------------|
| 1 | All users (fans + admins) authenticate with Google Sign-In; admin privileges are granted via a Firestore `admins/{uid}` document or custom claim | Medium — if a non-Google provider is needed for admin, requires additional Auth configuration |
| 2 | One vote per user per video is a future constraint, not enforced in this foundation ticket | Low — a composite index and security rule for this can be added later without schema changes |
| 3 | `thumbnailUrl` is generated at upload time and stored as a Storage URL (not a computed field) | Medium — if thumbnails are generated server-side (Cloud Function), schema stays the same but the upload flow is more complex |

## Implementation Notes

**Recommended project structure:**
```
src/
├── lib/
│   └── firebase.ts          # app, auth, db, storage exports
├── pages/
│   ├── HomePage.tsx
│   ├── CameraPage.tsx
│   ├── EstadoPage.tsx
│   ├── TribunaPage.tsx
│   ├── GanadoresPage.tsx
│   ├── AdminPage.tsx
│   └── NotFoundPage.tsx
├── router.tsx               # createBrowserRouter definition
└── main.tsx                 # RouterProvider mount
```

**`src/lib/firebase.ts`:**
```ts
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);
```

**`src/router.tsx`:**
```tsx
import { createBrowserRouter } from "react-router-dom";
import HomePage from "./pages/HomePage";
import CameraPage from "./pages/CameraPage";
import EstadoPage from "./pages/EstadoPage";
import TribunaPage from "./pages/TribunaPage";
import GanadoresPage from "./pages/GanadoresPage";
import AdminPage from "./pages/AdminPage";
import NotFoundPage from "./pages/NotFoundPage";

export const router = createBrowserRouter([
  { path: "/",            element: <HomePage /> },
  { path: "/camara",      element: <CameraPage /> },
  { path: "/estado/:id",  element: <EstadoPage /> },
  { path: "/tribuna",     element: <TribunaPage /> },
  { path: "/ganadores",   element: <GanadoresPage /> },
  { path: "/admin",       element: <AdminPage /> },
  { path: "*",            element: <NotFoundPage /> },
]);
```

**Firestore security rules (starter):**
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAuthenticated() {
      return request.auth != null;
    }

    function isAdmin() {
      return isAuthenticated() &&
        exists(/databases/$(database)/documents/admins/$(request.auth.uid));
    }

    match /partidos/{id} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /eventos/{id} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /videos/{id} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated()
        && request.resource.data.userId == request.auth.uid
        && request.resource.data.estado == 'revisando'
        && request.resource.data.estado in ['revisando', 'publicado', 'rechazado'];
      allow update: if isAdmin();
      allow delete: if isAdmin();
    }

    match /votos/{id} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated()
        && request.resource.data.userId == request.auth.uid;
      allow delete: if isAuthenticated()
        && resource.data.userId == request.auth.uid;
    }

    match /admins/{uid} {
      allow read: if isAuthenticated() && request.auth.uid == uid;
      allow write: if false; // managed via Firebase Admin SDK only
    }
  }
}
```

**Storage security rules (starter):**
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /videos/{userId}/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## References

- [Firebase Console](https://console.firebase.google.com)
- [Firebase JS SDK v9 docs](https://firebase.google.com/docs/web/modular-upgrade)
- [React Router v6 — createBrowserRouter](https://reactrouter.com/en/main/routers/create-browser-router)
- [Firebase Hosting quickstart](https://firebase.google.com/docs/hosting/quickstart)
- [Firestore security rules reference](https://firebase.google.com/docs/firestore/security/get-started)
- [GG-01 ticket](./gg-01-spike-camara.md) — camera spike that feeds into `/camara` route

---

**INVEST Validated**: ✅  
**BDD Scenarios**: 5  
**Priority**: High (blocker for all feature tickets)  
**Estimated Duration**: 1–2 days
