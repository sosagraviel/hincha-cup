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
| `npm run dev` | Dev server en http://localhost:5173 |
| `npm run build` | Build de producción |
| `npm run preview` | Preview del build |
| `npm run typecheck` | TypeScript type checking |
| `npm run lint` | ESLint |
| `npm run emulators` | Firebase Emulator Suite |

## Firebase Emulators (desarrollo local)

```bash
npm run emulators
```

Puertos usados:
- Auth: 9099
- Firestore: 8080
- Storage: 9199
- Functions: 5001
- Hosting: 5000
- UI: 4000

Para correr la app contra los emuladores, agregar en `.env.local`:

```
VITE_USE_EMULATORS=true
```

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

## Seed de datos

Para cargar el partido de demo (ARG 2–1 MEX, minuto 67):

```bash
npm run emulators  # en una terminal
# En otra terminal:
npx tsx src/seed/seed.ts
```

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
