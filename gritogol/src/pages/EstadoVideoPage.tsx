import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { obtenerVideo } from "../services/videoService";
import type { Video } from "../types/firestore";
import s from "../styles/app.module.css";

export default function EstadoVideoPage() {
  const { id } = useParams<{ id: string }>();
  const [video, setVideo] = useState<({ id: string } & Video) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const unsubscribe = obtenerVideo(id, (data) => {
      setVideo(data);
      setLoading(false);
    });

    return unsubscribe;
  }, [id]);

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
              <p>Estamos revisando tu grito. Esto puede tardar unos segundos.</p>
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
