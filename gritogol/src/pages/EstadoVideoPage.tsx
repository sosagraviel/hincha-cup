import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  actualizarEstado,
  extractFrameBase64,
  llamarModeracion,
  obtenerUrlVideo,
  obtenerVideo,
} from "../services/videoService";
import { getModerationDisabled } from "../components/ui/FabDemo";
import type { Video } from "../types/firestore";
import s from "../styles/app.module.css";

type ModerationState = "idle" | "extracting" | "moderating" | "done" | "error";

export default function EstadoVideoPage() {
  const { id } = useParams<{ id: string }>();
  const [video, setVideo] = useState<({ id: string } & Video) | null>(null);
  const [loading, setLoading] = useState(true);
  const [moderationState, setModerationState] = useState<ModerationState>("idle");
  const moderationStarted = useRef(false);

  useEffect(() => {
    if (!id) return;
    const unsubscribe = obtenerVideo(id, (data) => {
      setVideo(data);
      setLoading(false);
    });
    return unsubscribe;
  }, [id]);

  useEffect(() => {
    if (!id || !video || video.estado !== "revisando" || moderationStarted.current) return;
    moderationStarted.current = true;

    async function moderar() {
      if (!id || !video) return;
      try {
        if (getModerationDisabled()) {
          setModerationState("moderating");
          await actualizarEstado(id, "publicado", null, null);
          setModerationState("done");
          return;
        }

        setModerationState("extracting");
        const videoUrl = await obtenerUrlVideo(video.storagePath);
        const frameBase64 = await extractFrameBase64(videoUrl);

        setModerationState("moderating");
        await llamarModeracion(id, frameBase64);

        setModerationState("done");
      } catch (err) {
        console.error("Moderación fallida:", err);
        moderationStarted.current = false;
        setModerationState("error");
      }
    }

    void moderar();
  }, [id, video]);

  if (!id) {
    return (
      <div className={s.app}>
        <main className={s.estadoPage}>
          <h1>Estado del video</h1>
          <p>ID de video no especificado.</p>
        </main>
      </div>
    );
  }

  function handleRetry() {
    moderationStarted.current = false;
    setModerationState("idle");
  }

  return (
    <div className={s.app}>
      <main className={s.estadoPage}>
        <h1>Estado del festejo</h1>
        {loading ? (
          <p>Cargando…</p>
        ) : !video ? (
          <p>Video no encontrado.</p>
        ) : (
          <>
            {video.estado === "revisando" && (
              <>
                {moderationState === "extracting" && <p>Analizando video…</p>}
                {moderationState === "moderating" && <p>Moderando contenido…</p>}
                {moderationState === "error" && (
                  <>
                    <p>No se pudo completar la moderación.</p>
                    <button onClick={handleRetry}>Reintentar</button>
                  </>
                )}
                {(moderationState === "idle" || moderationState === "done") && (
                  <p>Revisando…</p>
                )}
              </>
            )}
            {video.estado === "publicado" && (
              <>
                <p>¡Ya estás en el muro!</p>
                {video.gritoNumero !== null && <p>Grito #{video.gritoNumero}</p>}
              </>
            )}
            {video.estado === "rechazado" && (
              <p>Tu video fue rechazado por contenido inapropiado y no será publicado.</p>
            )}
          </>
        )}
        <Link to="/" state={{ suppressOverlay: true }}>Volver al muro</Link>
      </main>
    </div>
  );
}
