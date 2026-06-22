# GritoGol ⚽

React + Vite + Firebase app to celebrate goals in real-time.

GritoGol connects business donations to schools and football clubs through an engaging voting competition. Users upload and share the best "grito gol" (goal celebrations), and the community votes for their favorites. Votes translate directly into visibility for businesses and donations for schools and clubs in need.

---

## The Problem

Schools and football clubs across our communities lack access to basic equipment and resources. While businesses want to support these organizations, there's no engaging platform that benefits everyone involved. Traditional donation models are passive and don't create community excitement or business visibility. Football—a cornerstone of our culture—shouldn't be limited by resource constraints.

---

## The Solution

GritoGol creates a win-win-win platform:

- **For Users**: Upload your best goal celebration videos and compete daily for prizes. Every vote you cast matters.
- **For Businesses**: Get featured visibility with real engagement metrics. Your participation directly translates to brand awareness tied to community support.
- **For Schools & Clubs**: Donations are generated automatically based on voting activity. The more engagement, the more support reaches those who need it most.

**How It Works:**
1. Users upload their "grito gol" (goal celebration video/moment)
2. Community members vote for their favorites throughout the day
3. Vote count = direct donation amount from participating businesses
4. Daily winner receives prizes
5. Businesses gain exposure proportional to engagement

---

## How AI Was Used

### In the Product
- **Claude**: Assisted in structuring the app's feature set and user flows, helping define how voting mechanics translate to donations
- **Figma Maker**: Used for rapid UI/UX design iterations and prototype creation, accelerating screen design from concept to implementation

### In Development
- **Documentation Generation**: Claude was used to create initial app documentation and technical specifications from high-level requirements
- **Screen Design**: Generated comprehensive UI documentation covering all user-facing screens
- **Ticket Creation**: Documentation was systematically broken down into actionable development tickets
- **Problem-Solving**: Used QAF translate specific feature challenges into structured tickets. For example:
  - *"How to include an overlay into our videos?"* → Technical approach ticket with implementation details
  - Video streaming and compression considerations
  - Real-time voting UI updates

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend Framework** | React 18+ |
| **Build Tool** | Vite |
| **Database** | Firebase Firestore (Native mode) |
| **Authentication** | Firebase Auth (Google, Anonymous) |
| **File Storage** | Firebase Cloud Storage |
| **Serverless Functions** | Firebase Cloud Functions |
| **Hosting** | Firebase Hosting |
| **Live Scores API** | API-Football (api-sports.io) |
| **Package Manager** | npm |
| **Containerization** | Docker + Docker Compose |
| **Build Automation** | Make |
| **UI Design Tools** | Figma |

---

## Running the Project

There are two ways to interact with the app:

### Local (Recommended — with dummy data)

To run the project locally with dummy data and full interactivity (including goal simulation and admin buttons), follow the `make start` path described in the Quick Start section below.

### Production

The app is also deployed at **https://hincha-cup.vercel.app/**

> **Warning:** This environment points to a free Football API. Data is not real, admin buttons are disabled, and goal scenarios cannot be simulated.

---

## Quick Start

### Option 1: Docker (Recommended for Onboarding)

**Requirements:** Docker Desktop (or Docker Engine + Compose) and Make

```bash
cd gritogol
make start
```

This will:
1. Create `docker/.env` from `docker/.env.example` (if needed)
2. Build the `gritogol-dev` Docker image
3. Start three services:
   - **`emulators`** — Firebase Emulator Suite (Auth, Firestore, Storage, Functions) with `USE_MOCK_SCORES=true`
   - **`seed`** — Loads demo data into Firestore (one-shot; container exits after completion—this is normal)
   - **`web`** — Vite dev server with `VITE_USE_EMULATORS=true`

Open **http://localhost:5173** (app) and **http://localhost:4000** (Emulator UI).

First startup may take 2–3 minutes (`npm ci` + functions build). `make start` will fail if port **5173** is already in use.

### Make Commands

| Command | Description |
|---------|-------------|
| `make start` | Start emulators + seed + Vite (`docker compose up -d --build`) |
| `make stop` | Stop and remove containers (`docker compose down`) |
| `make rebuild` | Full rebuild without cache and restart (useful after Dockerfile changes) |
| `make logs` | Follow logs from all services (`docker compose logs -f`) |
| `make seed` | Run emulators and re-execute seed manually |
| `make status` | Show container status (`docker compose ps`) |
| `make clean-docker` | Free Docker space (`docker system prune -af --volumes`); then run `make rebuild` |

### Typical Workflow

```bash
make start          # first startup or after cloning
make logs           # check what's happening if something fails
make seed           # reload demo matches if Firestore is empty
make stop           # end of day
```

### Troubleshooting Docker

| Issue | Solution |
|-------|----------|
| **`seed-1` container stopped** | Normal. One-shot container that runs once and exits. If you need data again: `make seed`. |
| **Port 5173 in use** | Don't run Docker and `npm run dev` locally at the same time. Stop one: `make stop` or kill the process on 5173. |
| **Blank screen** | Check browser console. If you see `auth/invalid-api-key`, use `VITE_USE_EMULATORS=true` and a key like `AIzaSy…` (see `.env.example`). |
| **INTERNAL error using ¡GOL! DEMO** | Restart emulators: `docker compose restart emulators` (or `make stop && make start`). |
| **Dockerfile changes** | Run `make rebuild` |
| **App has no data** | Run `make seed` |

---

## Option 2: Manual Local Development with Emulators

If you prefer not to use Docker, the app runs with **Vite** and emulators as the **local backend**. You'll need **3 terminals**.

### Firebase Setup (One-time)

1. Go to [Firebase Console](https://console.firebase.google.com) and create a new project.
2. **IMPORTANT:** Select **Firestore in Native mode** (not Datastore). This mode cannot be changed later.
3. Enable these services:
   - Authentication → Sign-in providers: Google, Anonymous
   - Firestore Database (Native mode)
   - Cloud Storage
   - Cloud Functions (requires upgrade to Blaze plan before deployment)
   - Hosting

### Environment Variables

```bash
cp .env.example .env.local
```

Fill in `.env.local` with values from Firebase Console → Project settings → General → Web app.

For development with emulators, your `projectId` must match `.firebaserc` (`gritogol`):

```
VITE_FIREBASE_PROJECT_ID=gritogol
VITE_USE_EMULATORS=true
```

### Install Dependencies

```bash
npm install
cd functions && npm install && cd ..
```

### Terminal 1 — Firebase Emulators

```bash
npm run emulators
```

When ready, open the panel at **http://localhost:4000**.

If it fails due to port conflict:

```bash
npm run emulators:stop
npm run emulators
```

**Emulator Suite Ports:**

| Service | Port |
|---------|------|
| Emulator UI | 4000 |
| Firestore | 8081 |
| Auth | 9099 |
| Storage | 9199 |
| Functions | 5001 |

### Terminal 2 — Load Demo Data

With emulators running:

```bash
npm run seed:emulator
```

You should see: `Seed completed: partido-uru-esp-2026 partido-arg-mex-2026`.

In **http://localhost:4000/firestore**, you'll see collections `partidos`, `beneficiarios`, and `counters`.

### Terminal 3 — Start the App

```bash
npm run dev
```

Open the URL shown by Vite (e.g., **http://localhost:5173**).

---

## All npm Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server (Vite, usually http://localhost:5173) |
| `npm run build` | Production build |
| `npm run preview` | Preview the build |
| `npm run typecheck` | TypeScript type checking |
| `npm run lint` | ESLint |
| `npm run emulators` | Firebase Emulator Suite (Auth, Firestore, Storage, Functions) |
| `npm run seed:emulator` | Load demo data into Firestore emulator |
| `npm run emulators:stop` | Free ports 8080/8081 if processes are stuck |

---

## Cloud Functions

Build and deploy functions:

```bash
cd functions
npm install
npm run build
cd ..
firebase deploy --only functions
```

**Note:** Cloud Functions have 5–15 second cold starts. This is handled by the "checking" status screen.

**Important:** The Spark plan (free) does not include Cloud Functions. Upgrade to the Blaze plan (pay-as-you-go) before your first functions deployment.

### Live Scores Synchronization (Copa 2026)

Scores sync from **API-Football** (api-sports.io) via the `syncCopaScores` Cloud Function (every 1 minute). The client reads `copa_fixtures` and `partidos` in Firestore — the API key **never** goes to the frontend.

**Emulator (without API key):**

```bash
cp functions/.env.example functions/.env   # USE_MOCK_SCORES=true
cd functions && npm run build && cd ..
npm run emulators
npm run seed:emulator
```

The seed loads `copa_fixtures` (includes an extra BRA–FRA match for the ticker) and mock data for `syncCopaScores`.

**Simulate a goal in emulator** (callable, no login in mock mode):

```javascript
// DevTools console, with emulators active
import { getFunctions, httpsCallable } from 'firebase/functions';
const fn = httpsCallable(getFunctions(), 'simulateGoal');
await fn({ partidoId: 'partido-uru-esp-2026' });
```

**Production:**

```bash
firebase functions:secrets:set API_FOOTBALL_KEY
firebase deploy --only functions
```

Get real fixture IDs for Copa 2026:

```bash
API_FOOTBALL_KEY=your-key npm run fetch:fixtures
```

Copy the IDs to `FIXTURE_IDS` in `src/constants.ts` and in the `partidos` documents (`fixtureId`).

---

## Deploy to Production

```bash
firebase deploy --only firestore:rules,storage,functions,hosting
```

---

## Seed Production Data

With a real Firebase project configured in `.env.local`:

```bash
npx tsx src/seed/seed.ts
```

For emulators, use `npm run seed:emulator` (see earlier section).

---

## Project Structure

```
src/
  firebase.ts              Firebase initialization; exports app, auth, db, storage
  router.tsx               React Router v6 with createBrowserRouter
  App.tsx                  Root component
  main.tsx                 Entry point
  types/
    firestore.ts           TypeScript interfaces for Firestore collections
  services/
    authService.ts         Google + anonymous auth
    videoService.ts        Upload, feed, votes
    partidoService.ts      Match subscription, trigger goal, close voting
  pages/
    HomePage.tsx           /
    CamaraPage.tsx         /camara?gol=N
    EstadoVideoPage.tsx    /estado/:id
    TribunaPage.tsx        /tribuna
    GanadoresPage.tsx      /ganadores
    AdminPage.tsx          /admin
    NotFoundPage.tsx       404
  seed/
    seed.ts                Demo data
functions/
  src/
    index.ts               Exports Cloud Functions
    onVideoSubido.ts       Storage trigger → assigns gritoNumero
```

---

## Security Warnings

- `.env.local` **never** committed (included in `.gitignore`).
- Firestore rules must be deployed **before** opening public access.
- The `admins/{uid}` field is managed **only** via Firebase Admin SDK (no admin UI for this).

---

## Contact & Support

For questions or support:
- Open an issue on GitHub
- Email: [your-email@example.com]

---

## Team

- Arian Picco (capitan)
- Graviel Sosa

---

## Acknowledgments

- Built with ❤️ for our communities
- Powered by React, Firebase, and AI-assisted development
- Special thanks to all participating schools and football clubs
