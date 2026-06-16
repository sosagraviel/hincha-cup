# GG-00 · Fundación de la aplicación (esqueleto para trabajar encima)

> **Tipo:** Spec-driven ticket · **Equipo:** 2 · **Esfuerzo:** ~1.5 días (Persona B en paralelo a GG-01) · **Estado:** listo para implementar
>
> **Regla de la semana:** lo más simple que funcione en la demo. Este ticket NO agrega features ni discute el stack: deja el repo, la base de datos, los servicios y las rutas listos para que GG-02…GG-16 se monten encima.

---

## 1. Contexto

GritoGol es una web app (Vite + React) sobre Firebase, 100% serverless. El usuario sube un festejo de ≤10 s al recibir un gol; la IA lo modera y se publica; cada 20 festejos se desbloquea una pelota para una escuela. Este ticket entrega el **andamiaje** del que dependen el resto de los tickets del backlog.

**Cubre las bases de:** GG-02 (Firebase + esquema), GG-03 (auth), GG-04 (subida de video) y GG-10 (router). NO reemplaza esos tickets: les deja el terreno listo.

## 2. Objetivo

Tener un repo único, desplegable, donde:
- Firebase esté inicializado (Auth + Firestore + Storage + Functions + Hosting), todo en capa gratuita.
- El modelo de datos exista y sea consultable en tiempo real.
- Exista una capa de servicios para el ciclo de vida del video (crear → leer → mutar estado por sistema).
- Las 6 rutas planas respondan, con esqueletos reales de las 4 pantallas funcionales.

## 3. Alcance

### Dentro (in scope)
- Estructura de repo: `Vite + React` en la raíz, Cloud Functions en `/functions`.
- Inicialización de Firebase y archivo de config único (`src/firebase.ts`).
- Colecciones de Firestore: `partidos`, `eventos`, `videos`, `votos` (con datos seed mínimos).
- `authService`: login con Google + sesión anónima.
- `videoService`: ciclo de vida real del video (ver §6.4).
- Cloud Function **stub** `onVideoSubido` (trigger de Storage) que escribe `publicado` para poder probar el flujo punta a punta antes de que GG-05 ponga ffmpeg + OpenAI.
- Router con 6 rutas planas + esqueletos de Home, Cámara, Estado, Tribuna; Ganadores estática; `/admin` con los dos botones (escriben en Firestore).

### Fuera (out of scope — los hacen otros tickets o no se hacen)
- Grabación real con cámara (**GG-01 / GG-11** — riesgo n.º 1, va el día 1 aparte).
- Moderación real con ffmpeg + omni-moderation (**GG-05**).
- Conteo de festejos y desbloqueo de pelotas (**GG-07**) — el campo existe, la lógica no.
- Push FCM (**GG-09**, riesgo n.º 2, solo si sobra tiempo).
- Pantallas Login, Elegir selección, Notificaciones: **no se construyen** (estáticas o nada).
- **No hay update ni delete de video de cara al usuario.** Ver §6.4.

## 4. Decisión clave: por qué NO es un CRUD

El pedido original decía "CRUD de videos". En esta arquitectura el video es **write-once con mutación de estado por sistema**:

| Operación | ¿Quién? | ¿Existe en la demo? |
|-----------|---------|---------------------|
| Create | usuario (sube crudo a Storage → doc en `revisando`) | Sí |
| Read | usuario (feed de Tribuna, pantalla de estado) | Sí |
| Update de estado | **solo** la Cloud Function de moderación | Sí (la hace el sistema) |
| Update de contenido | nadie | No |
| Delete | nadie (a lo sumo soft-delete admin, fuera de alcance) | No |

Implementar update/delete de cara al usuario es alcance que no se usa y superficie de bugs. Se omite a propósito.

## 5. Estructura del repo

```
/                      Vite + React (cliente)
  src/
    firebase.ts        init de app, exporta auth/db/storage
    services/
      authService.ts
      videoService.ts
      partidoService.ts
    router.tsx         6 rutas planas
    pages/
      Home.tsx
      Camara.tsx       esqueleto (la cámara real es GG-01/GG-11)
      EstadoVideo.tsx
      Tribuna.tsx
      Ganadores.tsx    estática
      Admin.tsx        2 botones
    seed/seed.ts       datos de demo mínimos
/functions             Cloud Functions
  src/onVideoSubido.ts stub: escribe "publicado"
firestore.rules
storage.rules
firebase.json
```

## 6. Especificación técnica

### 6.1 Firebase
- Un proyecto, capa gratuita. Servicios: Auth, Firestore, Storage, Functions, Hosting.
- `src/firebase.ts` inicializa la app y exporta `auth`, `db`, `storage`. Nada de claves en el repo (config pública de Firebase va por env; la API key de OpenAI vive en config de Functions, no en el cliente).

### 6.2 Modelo de datos (Firestore)

**`partidos/{partidoId}`**
```
equipoLocal: string            // "Argentina"
equipoVisitante: string        // "México"
golesLocal: number             // 2
golesVisitante: number         // 1
estado: "en_vivo" | "finalizado"
minuto: number                 // 67
sponsor: { nombre: string, compromiso: string }   // "Marca X", "1 pelota cada 20 festejos · tope 100"
destino: string                // "Club Defensoras de Ezeiza"
festejosPublicados: number     // contador denormalizado (lógica de unlock = GG-07)
pelotasDesbloqueadas: number   // idem
votacionCierraEn: timestamp | null
createdAt, updatedAt: timestamp
```

**`eventos/{eventoId}`** (goles)
```
partidoId: string
equipo: string                 // quién metió el gol
minuto: number
golNumero: number              // el N de /camara?gol=N
ventanaAbreEn: timestamp
ventanaCierraEn: timestamp      // +10 min
createdAt: timestamp
```

**`videos/{videoId}`**
```
partidoId: string
eventoId: string
golNumero: number
userId: string
autorAlias: string             // "@lucia_g"
storagePath: string            // videos-crudos/{partidoId}/{videoId}.webm
estado: "revisando" | "publicado" | "rechazado"
gritoNumero: number | null     // se asigna al publicar (ej. #38)
aplausos: number               // contador denormalizado
moderacion: {                  // evidencia para el jurado (la llena GG-05)
  frames: string[],            // paths en Storage
  veredicto: string,
  razon: string | null,
  latenciaSeg: number
} | null
createdAt: timestamp
publishedAt: timestamp | null
```

**`votos/{votoId}`**  (id = `{videoId}_{userId}` para impedir doble voto)
```
videoId: string
partidoId: string
userId: string
createdAt: timestamp
```

**Storage**
```
videos-crudos/{partidoId}/{videoId}.webm     // la subida dispara la moderación
moderacion/{videoId}/frame-{n}.jpg           // evidencia (la escribe GG-05)
```

### 6.3 Servicios de backend (capa cliente + functions)

- **`authService`**: `loginGoogle()`, `loginAnonimo()`, `onAuthState(cb)`. Sin formularios.
- **`partidoService`**: `suscribirPartido(id, cb)` (onSnapshot), `dispararGol(partidoId)` y `cerrarVotacion(partidoId)` (usados por `/admin`; escriben el mismo evento que escribiría una API deportiva real).
- **Cloud Function `onVideoSubido`** (trigger de Storage `onFinalize`): **stub de fundación** — escribe `estado: "publicado"` y asigna `gritoNumero` secuencial. GG-05 la reemplaza por ffmpeg + omni-moderation. Esto permite probar el flujo completo desde el día 2 sin esperar la IA.

### 6.4 Ciclo de vida del video (lo que reemplaza al "CRUD")

```
crearFestejo({ partidoId, eventoId, golNumero, userId, alias, blob })
  → sube blob a Storage (videos-crudos/...)
  → crea doc en videos con estado "revisando"
  → retorna videoId
  // (en este ticket el blob puede ser un placeholder; el blob real lo da GG-11)

obtenerFeed(partidoId)
  → onSnapshot de videos where partidoId == X && estado == "publicado"
     order by createdAt desc   // "reciente" para no matar goles del 2º tiempo

obtenerVideo(videoId)
  → onSnapshot de un video (para /estado/:id)

aplaudir(videoId, userId)
  → set voto con id {videoId}_{userId} (idempotente) + increment aplausos

[ SISTEMA ] actualizarEstado(videoId, estado, gritoNumero, moderacion)
  → solo desde la Cloud Function. No expuesto al cliente.
```

### 6.5 Router (6 rutas planas, sin anidación ni guards)

| Ruta | Pantalla | Estado en este ticket |
|------|----------|------------------------|
| `/` | Home | esqueleto funcional con onSnapshot |
| `/camara` | Cámara | esqueleto (acepta `?gol=N`); cámara real = GG-01/GG-11 |
| `/estado/:id` | Estado del video | esqueleto funcional |
| `/tribuna` | La Tribuna | esqueleto funcional con feed |
| `/ganadores` | Ganadores | **estática** |
| `/admin` | Admin | 2 botones (disparar gol / cerrar votación) operativos |

El banner de gol navegará a `/camara?gol=N` para asociar el video al gol correcto.

### 6.6 Datos seed mínimos
1 partido `en_vivo` ARG 2–1 MEX (min 67), con su sponsor y destino; 1–2 eventos de gol; suficiente para que Home y Tribuna no arranquen vacías. El set completo de demo (37/40, videos pregrabados) es **GG-15**.

## 7. Criterios de aceptación

1. `firebase deploy` (o emuladores) levanta sin errores con Auth, Firestore, Storage, Functions y Hosting activos.
2. Un usuario puede entrar con Google **o** anónimo y queda una sesión válida.
3. Las 4 colecciones existen con el esquema de §6.2 y hay datos seed de 1 partido en vivo.
4. `crearFestejo` sube un archivo a Storage y crea un doc `videos` en estado `revisando`.
5. La subida dispara `onVideoSubido` y el doc pasa a `publicado` con un `gritoNumero` asignado (vía stub).
6. La Home se suscribe en tiempo real: al cambiar el marcador en Firestore, la UI se actualiza sin recargar.
7. Las 6 rutas responden; `/camara?gol=2` lee el parámetro; `/admin` escribe un evento de gol y cierra votación en Firestore.
8. `aplaudir` es idempotente: dos toques del mismo usuario sobre el mismo video = 1 voto.
9. Las reglas de Firestore/Storage no son `allow read, write: if true` abiertas al mundo (mínimo: solo usuarios autenticados; estado de video escribible solo por la función).

## 8. Dependencias y orden

- **Bloquea a:** GG-05 (moderación), GG-07 (pelotas), GG-12/13/14 (pantallas en vivo), GG-08 (votos).
- **NO bloquea ni precede a GG-01** (cámara): corre en paralelo. Si GG-01 falla, este andamiaje no salva la demo.
- Se construye en el track de **Persona B, días 1-2**.

## 9. Riesgos

- **Reglas de seguridad demasiado abiertas** para apurar la demo → dejar al menos auth-gated; el `update` de estado debe ser exclusivo de la función.
- **Acoplar este ticket al éxito de la cámara**: no hacerlo. La validación de GG-01 es independiente y prioritaria.
- **Cold starts** de la función (5-15 s) los absorbe la pantalla "revisando"; no optimizar acá.

## 10. Notas

- El overlay del sponsor **no** se quema en el video: se superpone con CSS al reproducir (definido en GG-14, mencionado acá para que el modelo de datos no guarde video procesado).
- Lo que NO se programa esta semana (API deportiva, push nativo, app nativa, procesamiento de video en servidor, perfil, Salón del Mundial funcional, entrega de la ONG) se cuenta en el pitch, no se codea.
