import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { obtenerVideo } from "../services/videoService";
import type { Video } from "../types/firestore";

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
      <main>
        <h1>Estado del video</h1>
        <p>ID de video no especificado.</p>
      </main>
    );
  }

  if (loading) {
    return (
      <main>
        <h1>Estado del video</h1>
        <p>Cargando...</p>
      </main>
    );
  }

  if (!video) {
    return (
      <main>
        <h1>Estado del video</h1>
        <p>Video no encontrado: {id}</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Estado del video</h1>
      <p>Video: {video.id}</p>
      <p>Estado: {video.estado}</p>
      {video.gritoNumero !== null && (
        <p>Grito #{video.gritoNumero}</p>
      )}
    </main>
  );
}
