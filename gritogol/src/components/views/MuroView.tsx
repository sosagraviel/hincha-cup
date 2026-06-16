import { useEffect, useState } from "react";
import s from "../../styles/app.module.css";
import { usePartido } from "../../context/PartidoContext";
import { obtenerFeed } from "../../services/videoService";
import { FeedCard } from "../feed/FeedCard";
import type { Video } from "../../types/firestore";

export function MuroView() {
  const { partidoId, partido } = usePartido();
  const [videos, setVideos] = useState<Array<{ id: string } & Video>>([]);

  useEffect(() => {
    const unsubscribe = obtenerFeed(partidoId, setVideos);
    return unsubscribe;
  }, [partidoId]);

  const golLabel = partido
    ? partido.golesLocal + partido.golesVisitante
    : "—";

  return (
    <>
      <div className={s.seccionTitulo}>
        <h3>Muro de la hinchada</h3>
        <small>los festejos del gol {golLabel}</small>
      </div>
      {videos.length === 0 ? (
        <p className={s.emptyFeed}>
          Todavía no hay festejos publicados. Cuando tu selección grite un gol,
          tenés minutos para subir el tuyo.
        </p>
      ) : (
        videos.map((video) => <FeedCard key={video.id} video={video} />)
      )}
    </>
  );
}
