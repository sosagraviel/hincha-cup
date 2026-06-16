# GritoGol

React + Vite + Firebase app para festejar goles en tiempo real.

## Setup

### 1. Firebase Project

1. Ir a [Firebase Console](https://console.firebase.google.com) y crear un nuevo proyecto.
2. **IMPORTANTE:** Seleccionar **Firestore en modo Native** (no Datastore). Este modo no se puede cambiar después.
3. Habilitar los servicios:
   - Authentication → Sign-in providers: Google, Anonymous
   - Firestore Database (modo Native)
   - Storage
   - Functions (requiere upgrade a plan Blaze antes del deploy)
   - Hosting

### 2. Variables de entorno

```bash
cp .env.example .env.local
```

Completar `.env.local` con los valores de Firebase Console → Project settings → General → Web app.

### 3. Instalar dependencias

```bash
npm install
cd functions && npm install && cd ..
```

## Docker (recomendado para onboarding)

Requisitos: **Docker Desktop** (o Docker Engine + Compose) y **Make**.

### Inicio rápido

```bash
cd gritogol
make start
```

1. **`make start`** — Crea `docker/.env` desde `docker/.env.example` si no existe, construye la imagen `gritogol-dev` y levanta tres servicios en orden:
   - **`emulators`** — Firebase Emulator Suite (Auth, Firestore, Storage, Functions) con `USE_MOCK_SCORES=true`
   - **`seed`** — Carga datos demo en Firestore (one-shot; el contenedor termina y queda detenido — es normal)
   - **`web`** — Vite dev server con `VITE_USE_EMULATORS=true`
2. Abrí **http://localhost:5173** (app) y **http://localhost:4000** (Emulator UI).

La primera vez puede tardar 2–3 min (`npm ci` + build de functions). `make start` falla si el puerto **5173** está ocupado (por ejemplo por `npm run dev` local).

### URLs

| URL | Servicio |
|-----|----------|
| http://localhost:5173 | App (Vite) |
| http://localhost:4000 | Firebase Emulator UI |
| http://localhost:4000/firestore | Firestore emulator |
| http://localhost:5001 | Cloud Functions emulator |

### Comandos Make

| Comando | Descripción |
|---------|-------------|
| `make start` | Levanta emuladores + seed + Vite (`docker compose up -d --build`) |
| `make stop` | Para y elimina contenedores (`docker compose down`) |
| `make rebuild` | Rebuild completo sin caché y vuelve a levantar (útil tras cambios en `Dockerfile`) |
| `make logs` | Sigue los logs de todos los servicios (`docker compose logs -f`) |
| `make seed` | Levanta solo emuladores y re-ejecuta el seed manualmente |
| `make status` | Muestra el estado de los contenedores (`docker compose ps`) |
| `make clean-docker` | Libera espacio en Docker (`docker system prune -af --volumes`); luego corré `make rebuild` |

### Flujo de trabajo típico

```bash
make start          # primer arranque o después de clonar
make logs           # ver qué pasa si algo falla
make seed           # recargar partidos demo si Firestore quedó vacío
make stop           # fin del día
```

Si cambiás el `Dockerfile` o tenés errores raros de build:

```bash
make rebuild
```

Si Docker se queda sin espacio (`ENOSPC: no space left on device`):

```bash
make clean-docker
make rebuild
```

### Troubleshooting

- **`seed-1` detenido** → Normal. Es un contenedor one-shot que corre una vez y sale. Si necesitás datos de nuevo: `make seed`.
- **Puerto 5173 ocupado** → No corras Docker y `npm run dev` local a la vez. Pará uno u otro: `make stop` o matá el proceso en 5173.
- **Pantalla en blanco** → Revisá la consola del navegador. Si ves `auth/invalid-api-key`, en emulador usá `VITE_USE_EMULATORS=true` y una key con formato `AIzaSy…` (ver `.env.example`).
- **Error INTERNAL al usar ¡GOL! DEMO** → Reiniciá emuladores: `docker compose restart emulators` (o `make stop && make start`).
- **Cambios en Dockerfile** → `make rebuild`
- **App sin datos** → `make seed`

## Comandos (sin Docker)

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Dev server (Vite, usualmente http://localhost:5173) |
| `npm run build` | Build de producción |
| `npm run preview` | Preview del build |
| `npm run typecheck` | TypeScript type checking |
| `npm run lint` | ESLint |
| `npm run emulators` | Firebase Emulator Suite (Auth, Firestore, Storage, Functions) |
| `npm run seed:emulator` | Carga datos demo en Firestore emulator |
| `npm run emulators:stop` | Libera puertos 8080/8081 si quedaron procesos colgados |

## Desarrollo local con emuladores (manual)

Si preferís no usar Docker, la app corre con **Vite** y los emuladores como **backend** local. Necesitás **3 terminales**:

### Terminal 1 — Emuladores

```bash
npm run emulators
```

Cuando esté listo, abrí el panel en **http://localhost:4000**.

Si falla por puerto ocupado:

```bash
npm run emulators:stop
npm run emulators
```

### Terminal 2 — Datos demo

Con los emuladores corriendo:

```bash
npm run seed:emulator
```

Deberías ver: `Seed completado: partido-uru-esp-2026 partido-arg-mex-2026`.

En **http://localhost:4000/firestore** van a aparecer las colecciones `partidos`, `beneficiarios` y `counters`.

### Terminal 3 — App

```bash
npm run dev
```

Abrí la URL que muestre Vite (por ejemplo **http://localhost:5173** o **http://localhost:5174** si 5173 está ocupado).

### Configuración de `.env.local`

Para desarrollo con emuladores, el `projectId` debe coincidir con `.firebaserc` (`gritogol`):

```
VITE_FIREBASE_PROJECT_ID=gritogol
VITE_USE_EMULATORS=true
```

Puertos del Emulator Suite:

| Servicio | Puerto |
|----------|--------|
| Emulator UI | 4000 |
| Firestore | 8081 |
| Auth | 9099 |
| Storage | 9199 |
| Functions | 5001 |

**Nota:** Para que los videos subidos pasen a `publicado` en el muro, compilá las functions una vez: `cd functions && npm run build && cd ..`, y reiniciá `npm run emulators`.

### Marcadores en vivo (Mundial 2026)

Los marcadores se sincronizan desde **API-Football** (api-sports.io) vía la Cloud Function `syncCopaScores` (cada 1 min). El cliente lee `copa_fixtures` y `partidos` en Firestore — la API key **nunca** va al frontend.

**Emulador (sin API key):**

```bash
cp functions/.env.example functions/.env   # USE_MOCK_SCORES=true
cd functions && npm run build && cd ..
npm run emulators
npm run seed:emulator
```

El seed carga `copa_fixtures` (incluye un partido extra BRA–FRA para el ticker) y datos mock para `syncCopaScores`.

**Simular un gol en emulador** (callable, sin login en mock mode):

```javascript
// DevTools console, con emuladores activos
import { getFunctions, httpsCallable } from 'firebase/functions';
const fn = httpsCallable(getFunctions(), 'simulateGoal');
await fn({ partidoId: 'partido-uru-esp-2026' });
```

**Producción:**

```bash
firebase functions:secrets:set API_FOOTBALL_KEY
firebase deploy --only functions
```

Obtener IDs reales de fixtures del Mundial:

```bash
API_FOOTBALL_KEY=tu-key npm run fetch:fixtures
```

Copiá los IDs a `FIXTURE_IDS` en `src/constants.ts` y en los docs `partidos` (`fixtureId`).

## Cloud Functions

```bash
cd functions
npm install
npm run build
cd ..
firebase deploy --only functions
```

**Nota:** Las Cloud Functions tienen cold start de 5–15 segundos. Esto es absorbido por la pantalla de estado "revisando".

**Nota:** El plan Spark (gratuito) no incluye Cloud Functions. Se requiere upgrade al plan Blaze (pay-as-you-go) antes del primer deploy de funciones.

## Deploy completo

```bash
firebase deploy --only firestore:rules,storage,functions,hosting
```

## Seed de datos (producción)

Con un proyecto Firebase real configurado en `.env.local`:

```bash
npx tsx src/seed/seed.ts
```

Para emuladores, usá `npm run seed:emulator` (ver sección anterior).

## Estructura

```
src/
  firebase.ts         Inicialización Firebase; exporta app, auth, db, storage
  router.tsx          React Router v6 con createBrowserRouter
  App.tsx             Root component
  main.tsx            Entry point
  types/
    firestore.ts      Interfaces TypeScript para colecciones Firestore
  services/
    authService.ts    Google + anonymous auth
    videoService.ts   Upload, feed, aplausos
    partidoService.ts Suscripción partido, disparar gol, cerrar votación
  pages/
    HomePage.tsx        /
    CamaraPage.tsx      /camara?gol=N
    EstadoVideoPage.tsx /estado/:id
    TribunaPage.tsx     /tribuna
    GanadoresPage.tsx   /ganadores
    AdminPage.tsx       /admin
    NotFoundPage.tsx    404
  seed/
    seed.ts           Datos de demo
functions/
  src/
    index.ts          Exporta Cloud Functions
    onVideoSubido.ts  Trigger Storage → asigna gritoNumero
```

## Advertencias de seguridad

- `.env.local` **nunca** se commitea (está en `.gitignore`).
- Las reglas de Firestore deben deployarse **antes** de abrir acceso público.
- El campo `admins/{uid}` se gestiona únicamente via Firebase Admin SDK (no hay UI de admin para esto).
