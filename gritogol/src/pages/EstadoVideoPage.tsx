import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  obtenerVideo,
  obtenerUrlVideo,
  extractFrameBase64,
  llamarModeracion,
} from "../services/videoService";
import type { Video } from "../types/firestore";
import s from "../styles/app.module.css";

export default function EstadoVideoPage() {
  const { id } = useParams<{ id: string }>();
  const [video, setVideo] = useState<({ id: string } & Video) | null>(null);
  const [loading, setLoading] = useState(true);
  const [moderacionError, setModeracionError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const moderacionInProgress = useRef(false);

  useEffect(() => {
    if (!id) return;

    const unsubscribe = obtenerVideo(id, (data) => {
      setVideo(data);
      setLoading(false);
    });

    return unsubscribe;
  }, [id]);

  useEffect(() => {
    if (!id || !video || video.estado !== "revisando") return;
    if (moderacionInProgress.current) return;

    moderacionInProgress.current = true;
    setModeracionError(null);

    let cancelled = false;

    void (async () => {
      try {
        const url = await obtenerUrlVideo(video.storagePath);
        if (cancelled) return;
        const frameBase64 = await extractFrameBase64(url);
        if (cancelled) return;
        await llamarModeracion(id, frameBase64);
      } catch {
        if (!cancelled) {
          moderacionInProgress.current = false;
          setModeracionError("No se pudo moderar el video.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, video?.estado, video?.storagePath, retryCount]);

  function handleReintentar() {
    moderacionInProgress.current = false;
    setRetryCount((c) => c + 1);
  }

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
            <p>
              Estado: <strong>{video.estado}</strong>
            </p>
            {video.gritoNumero !== null && (
              <p>Grito #{video.gritoNumero}</p>
            )}
            {video.estado === "revisando" && !moderacionError && (
              <p>Moderando tu festejo…</p>
            )}
            {video.estado === "revisando" && moderacionError && (
              <>
                <p>{moderacionError}</p>
                <button type="button" onClick={handleReintentar}>
                  Reintentar moderación
                </button>
              </>
            )}
            {video.estado === "publicado" && (
              <p>¡Ya estás en el muro!</p>
            )}
            {video.estado === "rechazado" && (
              <p>
                Tu video fue rechazado por contenido inapropiado
                {video.moderacion?.razon
                  ? ` (${video.moderacion.razon})`
                  : ""}
                .
              </p>
            )}
          </>
        )}
        <Link to="/" state={{ suppressOverlay: true }}>
          Volver al muro
        </Link>
      </main>
    </div>
  );
}
