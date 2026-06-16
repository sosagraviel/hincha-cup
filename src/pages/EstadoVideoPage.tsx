import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { actualizarEstado, obtenerVideo } from "../services/videoService";
import type { Video } from "../types/firestore";
import s from "../styles/app.module.css";

export default function EstadoVideoPage() {
  const { id } = useParams<{ id: string }>();
  const [video, setVideo] = useState<({ id: string } & Video) | null>(null);
  const [loading, setLoading] = useState(true);
  const [segundos, setSegundos] = useState(10);

  useEffect(() => {
    if (!id) return;

    const unsubscribe = obtenerVideo(id, (data) => {
      setVideo(data);
      setLoading(false);
    });

    return unsubscribe;
  }, [id]);

  useEffect(() => {
    if (!id || video?.estado !== "revisando") return;
    const interval = setInterval(() => {
      setSegundos((s) => {
        if (s <= 1) {
          clearInterval(interval);
          actualizarEstado(id, "publicado", null, null).catch(console.error);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [id, video?.estado]);

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
            {video.estado === "revisando" && (
              <p>Auto-publicando en {segundos}…</p>
            )}
            {video.estado === "publicado" && (
              <p>¡Ya estás en el muro!</p>
            )}
          </>
        )}
        <Link to="/">Volver al muro</Link>
      </main>
    </div>
  );
}
