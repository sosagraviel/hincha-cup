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

## Comandos

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

## Desarrollo local con emuladores

La app (frontend) corre con **Vite**. Los emuladores son el **backend** local (Firestore, Auth, etc.). Necesitás **3 terminales** abiertas al mismo tiempo:

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
