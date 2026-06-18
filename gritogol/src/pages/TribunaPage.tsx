import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { obtenerFeed } from "../services/videoService";
import { getPartidoId } from "../constants";
import type { Video } from "../types/firestore";

export default function TribunaPage() {
  const [videos, setVideos] = useState<Array<{ id: string } & Video>>([]);

  useEffect(() => {
    const unsubscribe = obtenerFeed(getPartidoId(), setVideos);
    return unsubscribe;
  }, []);

  return (
    <main>
      <h1>Tribuna</h1>
      {videos.length === 0 ? (
        <p>Todavía no hay festejos publicados.</p>
      ) : (
        <ul>
          {videos.map((video) => (
            <li key={video.id}>
              <Link to={`/estado/${video.id}`}>
                Grito #{video.gritoNumero} — {video.autorAlias} — {video.aplausos} aplausos
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
