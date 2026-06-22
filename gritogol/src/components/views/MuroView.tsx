import { useEffect, useState } from "react";
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
      <div className="flex items-baseline justify-between px-[18px] pt-[2px] pb-[10px]">
        <h3 className="text-[16px] font-bold">Muro de la hinchada</h3>
        <small className="text-[12px] text-[var(--gris)]">los festejos del gol {golLabel}</small>
      </div>
      {videos.length === 0 ? (
        <p className="mx-[18px] text-[13px] text-[var(--gris)] leading-[1.5]">
          Todavía no hay festejos publicados. Cuando tu selección grite un gol,
          tenés minutos para subir el tuyo.
        </p>
      ) : (
        videos.map((video) => <FeedCard key={video.id} video={video} />)
      )}
    </>
  );
}
