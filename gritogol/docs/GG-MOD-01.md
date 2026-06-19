# GG-MOD-01: Reemplazar timer de auto-publicación con moderación de contenido vía OpenAI

## User Story

**As a** administrador del sistema GritoGol  
**I want** que cada video festejo pase por moderación automática de contenido antes de publicarse  
**So that** el muro público nunca muestre contenido inapropiado y la plataforma cumpla con estándares mínimos de seguridad

---

## Stakeholders

| Rol | Responsabilidad |
|-----|----------------|
| Product Owner | Aceptación y priorización |
| Developer | Implementación |
| QA | Validación de escenarios BDD |

---

## Success Criteria

1. Ningún video llega al estado `publicado` sin haber pasado por la API de moderación de OpenAI.
2. El countdown timer de 10 segundos en `EstadoVideoPage` es eliminado por completo.
3. Videos con contenido inapropiado quedan en estado `rechazado` con la razón almacenada en Firestore.
4. La API key de OpenAI nunca se expone al frontend (no en variables `VITE_*`).
5. El sistema funciona con emuladores locales sin requerir una API key real de OpenAI.

---

## Acceptance Criteria

### Scenario 1: Video limpio es publicado

```gherkin
Given que un usuario grabó un video festejo y fue subido a Storage
And el video queda en estado "revisando"
When el frontend extrae un fotograma del punto medio del video
And lo envía a la Cloud Function moderarVideo
And la API omni-moderation-latest no detecta contenido inapropiado
Then el video pasa a estado "publicado"
And se le asigna un gritoNumero secuencial
And los contadores del partido se incrementan (festejosPublicados, pelotasDesbloqueadas)
And la pantalla EstadoVideoPage muestra "¡Ya estás en el muro!"
```

### Scenario 2: Video con contenido inapropiado es rechazado

```gherkin
Given que un usuario subió un video con contenido inapropiado
And el video queda en estado "revisando"
When el frontend envía el fotograma a moderarVideo
And la API omni-moderation-latest devuelve flagged: true
Then el video pasa a estado "rechazado"
And el campo moderacion.aprobado queda en false
And moderacion.razon contiene la categoría detectada (ej. "sexual")
And gritoNumero NO se asigna (queda null)
And los contadores del partido NO se incrementan
And EstadoVideoPage muestra un mensaje de rechazo claro al usuario
```

### Scenario 3: API de moderación no disponible — el video permanece en revisión

```gherkin
Given que un usuario subió un video
And el video está en estado "revisando"
When el frontend llama a moderarVideo
And la Cloud Function no puede contactar la API de OpenAI (timeout / error de red)
Then el video permanece en estado "revisando"
And EstadoVideoPage muestra un botón de "Reintentar moderación"
And no se asigna gritoNumero ni se modifican contadores
```

### Scenario 4: Flujo con emuladores (sin API key real)

```gherkin
Given que USE_MOCK_MODERATION=true está configurado en functions/.env
When el frontend envía cualquier fotograma a moderarVideo
Then la función aprueba automáticamente sin llamar a OpenAI
And el video se publica normalmente
```

### Scenario 5: Timer eliminado — no hay auto-publicación

```gherkin
Given que un video está en estado "revisando"
When el usuario espera más de 10 segundos en EstadoVideoPage sin que moderarVideo sea llamado
Then el video permanece en estado "revisando"
And ningún mecanismo del frontend publica el video automáticamente
```

---

## Technical Context

### Current State

- `EstadoVideoPage.tsx:22-34` contiene un `setInterval` de 10 segundos que llama a `actualizarEstado(id, "publicado", null, null)` — este es el "stub timer" a eliminar.
- `onVideoSubido.ts` se dispara al subir a Storage y publica el video + asigna `gritoNumero` + incrementa contadores en una única transacción atómica.
- Hay DOS rutas de publicación actuales (timer frontend + Storage trigger) — la nueva implementación debe tener exactamente UNA (la Cloud Function de moderación).
- `VideoEstado` en `types/firestore.ts` ya incluye `"rechazado"`.
- La interfaz `Moderacion { aprobado: boolean; razon?: string; timestamp: Timestamp }` ya existe en `types/firestore.ts`.
- `actualizarEstado()` en `videoService.ts` ya acepta `moderacion: Moderacion | null` como parámetro.

### Proposed Changes

#### 1. `gritogol/functions/src/onVideoSubido.ts` — eliminar publicación automática

Modificar la transacción para que ya **no** cambie `estado` ni asigne `gritoNumero`. Su única responsabilidad post-cambio es confirmar que el documento existe y está en `revisando`. La asignación de `gritoNumero` y el incremento de contadores se mueven a la nueva función de moderación.

```typescript
// ANTES (simplificado):
tx.update(videoRef, { estado: "publicado", gritoNumero, publishedAt: ... });
tx.update(partidoRef, { festejosPublicados: increment(1), ... });

// DESPUÉS:
// onVideoSubido solo verifica que el doc existe y tiene estado "revisando".
// No modifica estado, gritoNumero ni contadores.
```

#### 2. `gritogol/functions/src/moderarVideo.ts` — nueva Cloud Function callable

```typescript
// Callable function (requiere auth):
// Entrada: { videoId: string; frameBase64: string }
// Flujo:
//   1. Leer OPENAI_API_KEY del proceso (o mockear si USE_MOCK_MODERATION=true)
//   2. POST https://api.openai.com/v1/moderations con model: "omni-moderation-latest"
//      y la imagen como { type: "image_url", image_url: { url: "data:image/png;base64,..." } }
//   3. Si no flagged:
//      - Transacción Firestore: asignar gritoNumero, incrementar contadores, estado → "publicado"
//   4. Si flagged:
//      - Actualizar: estado → "rechazado", moderacion: { aprobado: false, razon, timestamp }
//      - No tocar gritoNumero ni contadores
```

**Nota de seguridad:** La función es `onCall` de Firebase Functions v2. Requiere `auth` implícitamente cuando se usa con el SDK del cliente. La API key se lee de `process.env.OPENAI_API_KEY` (secret de Firebase Functions, nunca en código).

#### 3. `gritogol/src/pages/EstadoVideoPage.tsx` — eliminar timer, llamar moderarVideo

- Eliminar el `useEffect` del countdown (líneas 22-34 del archivo actual).
- Eliminar el estado `segundos`.
- Agregar llamada a `moderarVideo` (Firebase callable) dentro del `useEffect` que ya carga el video, disparada una vez cuando `video.estado === "revisando"`.
- Extraer el fotograma del video en el browser usando la Canvas API antes de llamar a la función.
- Agregar UI para estado `"rechazado"`.
- Agregar UI de "Reintentar" cuando la llamada a la función falla.

#### 4. `gritogol/src/services/videoService.ts` — agregar helper de extracción de fotograma

```typescript
// extractFrameBase64(videoBlob: Blob, timeRatio = 0.5): Promise<string>
// Crea un <video> element invisible, carga el blob, busca al timeRatio,
// dibuja en un <canvas> y retorna toDataURL("image/png").slice("data:image/png;base64,".length)
```

#### 5. `gritogol/functions/src/index.ts` — exportar moderarVideo

```typescript
export { moderarVideo } from "./moderarVideo";
```

#### 6. `gritogol/functions/.env.example` — documentar nueva variable

```bash
USE_MOCK_MODERATION=true   # emuladores: aprueba todo sin llamar OpenAI
# OPENAI_API_KEY=sk-...    # producción: usar firebase functions:secrets:set OPENAI_API_KEY
```

### Constraints

- La API key de OpenAI debe estar en `process.env.OPENAI_API_KEY` del proceso de Cloud Functions. En producción se gestiona como Firebase Secret: `firebase functions:secrets:set OPENAI_API_KEY`.
- El fotograma se extrae en el browser (no hay acceso a ffmpeg server-side). Canvas API es suficiente.
- `omni-moderation-latest` acepta `image_url` con data URIs — no se necesita subir la imagen a Storage.
- La función callable debe tener un timeout razonable (15s) para no dejar la UI colgada.
- El `gritoNumero` solo se asigna a videos aprobados — evita "desperdiciar" números en rechazados.

### Integration Points

- **OpenAI Moderation API**: `POST https://api.openai.com/v1/moderations`, model `omni-moderation-latest`, input con `type: "image_url"`.
- **Firebase Callable Functions v2**: `onCall({ region: "us-central1", timeoutSeconds: 15 })`.
- **Firestore**: `videos/{videoId}` (estado, gritoNumero, moderacion), `counters/videos` (gritoNumero), `partidos/{partidoId}` (contadores).

### Architecture Decisions

| Decisión | Justificación |
|----------|---------------|
| Extracción de fotograma en el browser (Canvas API) | Evita subir el video completo a un server extra; el blob ya está en memoria en el cliente |
| Firebase Callable Function (no HTTP) | Autenticación automática; SDK cliente maneja reintentos y serialización |
| `gritoNumero` y contadores en moderarVideo (no en onVideoSubido) | Solo videos aprobados reciben número; contadores quedan consistentes |
| `USE_MOCK_MODERATION=true` para emuladores | Mismo patrón que `USE_MOCK_SCORES=true`; no requiere API key real en desarrollo |
| `omni-moderation-latest` (gratis) | Especificado en el ticket; no incurre costo por llamada |

---

## Out of Scope

- Moderación de audio del video.
- Panel de administración para revisar rechazados manualmente.
- Notificaciones push/email al usuario cuando su video es rechazado.
- Re-envío automático del video rechazado por el usuario.
- Almacenamiento del fotograma extraído en Firebase Storage.

---

## Future Considerations

- Agregar un panel admin para ver videos rechazados con su razón.
- Permitir al usuario apelar un rechazo.
- Agregar moderación de múltiples fotogramas (inicio, medio, fin) para mayor cobertura.

---

## Edge Cases and Error Handling

| Caso | Comportamiento |
|------|---------------|
| `video.estado` llega a `"publicado"` o `"rechazado"` antes de llamar a moderarVideo (race condition / retry) | `moderarVideo` verifica el estado actual antes de proceder; si ya no es `"revisando"`, no hace nada y retorna |
| El blob del video no está disponible para extracción de fotograma | Mostrar error en UI y ofrecer reintento; no llamar a la función con frame vacío |
| Timeout de `moderarVideo` (>15s) | Video permanece en `"revisando"`; mostrar botón de reintento |
| `USE_MOCK_MODERATION` no definida en producción y `OPENAI_API_KEY` ausente | Cloud Function lanza error 500 con mensaje claro; video permanece en `"revisando"` |
| Usuario sin sesión intenta llamar `moderarVideo` | Firebase rechaza la llamada callable con `unauthenticated`; no se expone info del video |

---

## Validation Rules

- `frameBase64` en la callable debe ser una string no vacía (validar en el servidor antes de llamar a OpenAI).
- `videoId` debe corresponder a un documento que pertenece al `uid` del caller (validar en la función).
- Si `moderacion.razon` es demasiado largo (>500 chars), truncar antes de guardar en Firestore.

---

## Dependencies

| Tipo | Detalle |
|------|---------|
| Blocking | Ninguno — la rama `video-moderation` arranca desde `main` |
| Related | `GG-BUG-01` (overlay), trabajo previo en `onVideoSubido` que ya asigna gritoNumero |

---

## Definition of Done

### Code Quality
- [ ] `onVideoSubido.ts` ya no cambia `estado` ni asigna `gritoNumero`
- [ ] `moderarVideo.ts` creada con callable, lectura de `OPENAI_API_KEY` del proceso, y mock flag
- [ ] Timer eliminado de `EstadoVideoPage.tsx` (sin `setInterval`, sin estado `segundos`)
- [ ] `extractFrameBase64` implementada y exportada desde `videoService.ts`
- [ ] TypeScript compila sin errores (`npm run typecheck`)
- [ ] ESLint pasa sin warnings (`npm run lint`)

### Testing
- [ ] Todos los BDD scenarios cubiertos con tests de integración o manuales documentados
- [ ] Verificado con emuladores + `USE_MOCK_MODERATION=true`
- [ ] Verificado el estado `rechazado` visible en UI

### Documentation
- [ ] `functions/.env.example` actualizado con `USE_MOCK_MODERATION`
- [ ] `gritogol/README.md` actualizado si se agregan pasos de setup para `OPENAI_API_KEY`

### Review
- [ ] PR revisado y aprobado
- [ ] Firestore rules verificadas (sin cambios requeridos — solo escrituras server-side)

---

## Implementation Notes

**Orden de implementación recomendado:**

1. Modificar `onVideoSubido.ts` primero (quitar auto-publicación). Verificar que videos quedan en `"revisando"` en emulador.
2. Crear `moderarVideo.ts` con mock activado. Verificar publicación manual vía callable.
3. Implementar `extractFrameBase64` en `videoService.ts`. Verificar extracción de fotograma en browser.
4. Refactorizar `EstadoVideoPage.tsx`: eliminar timer, agregar llamada a callable, agregar UI de `rechazado` y reintento.
5. Exportar `moderarVideo` en `functions/src/index.ts`.
6. Probar con `USE_MOCK_MODERATION=false` y una API key real de OpenAI para verificar el flujo completo.

**Sobre la extracción del fotograma:**

```typescript
// En videoService.ts
export async function extractFrameBase64(
  blob: Blob,
  timeRatio = 0.5
): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.src = URL.createObjectURL(blob);
    video.addEventListener("loadedmetadata", () => {
      video.currentTime = video.duration * timeRatio;
    });
    video.addEventListener("seeked", () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")!.drawImage(video, 0, 0);
      URL.revokeObjectURL(video.src);
      const dataUrl = canvas.toDataURL("image/png");
      resolve(dataUrl.split(",")[1]); // solo la parte base64
    });
    video.addEventListener("error", reject);
  });
}
```

**Nota:** El blob del video debe pasarse desde `CamaraPage` a través del estado de navegación de React Router, ya que en `EstadoVideoPage` solo se dispone del `videoId`. Alternativamente, volver a leer el blob desde Storage con `obtenerUrlVideo` y pasarlo a un `<video>` element para captura. Revisar cómo `CamaraPage` navega a `EstadoVideoPage` y si puede pasar el blob por `state`.

---

## References

- [OpenAI Moderation API Docs](https://platform.openai.com/docs/api-reference/moderations)
- `gritogol/src/pages/EstadoVideoPage.tsx` — timer stub actual
- `gritogol/functions/src/onVideoSubido.ts` — lógica de publicación actual
- `gritogol/src/types/firestore.ts` — `VideoEstado`, `Moderacion`
- `gritogol/src/services/videoService.ts` — `actualizarEstado`, `crearFestejo`

---

**INVEST Validated**: ✅  
**BDD Scenarios**: 5  
**Estimated effort**: 3–4 días  
**Scope impact**: ~6 files modificados, 1 service (gritogol)
