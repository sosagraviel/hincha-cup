import { useEffect, useRef, useState } from "react";
import s from "../../styles/app.module.css";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import {
  aplaudir,
  obtenerUrlVideo,
} from "../../services/videoService";
import type { Video } from "../../types/firestore";
import { getIniciales } from "../../constants";
import { formatoNumero, tiempoRelativo, formatoDuracion } from "../../utils/format";
import { VideoSponsorOverlay } from "../video/VideoSponsorOverlay";

interface FeedCardProps {
  video: { id: string } & Video;
}

function avatarClass(index: number): string {
  const classes = [s.avSol, s.avCeleste, s.avVerde];
  return classes[index % classes.length]!;
}

export function FeedCard({ video }: FeedCardProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [aplausos, setAplausos] = useState(video.aplausos);
  const [shares, setShares] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [duracion, setDuracion] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const videoElRef = useRef<HTMLVideoElement>(null);

  const esPropio = user?.uid === video.userId;
  const iniciales = getIniciales(video.autorAlias);

  // When the <video> enters native fullscreen, exit it and re-enter on the container
  // so the overlay sibling remains visible.
  useEffect(() => {
    const videoEl = videoElRef.current;
    const container = containerRef.current;
    if (!videoEl || !container) return;
    const onFullscreenChange = () => {
      if (document.fullscreenElement === videoEl) {
        document.exitFullscreen()
          .then(() => container.requestFullscreen())
          .catch(() => undefined);
      }
    };
    videoEl.addEventListener("fullscreenchange", onFullscreenChange);
    return () => videoEl.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [playing, url]);

  useEffect(() => {
    let cancelled = false;
    void obtenerUrlVideo(video.storagePath).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [video.storagePath]);

  async function handleLike() {
    if (!user || liked) return;
    setLiked(true);
    setAplausos((n) => n + 1);
    try {
      await aplaudir(video.id, user.uid);
    } catch {
      setLiked(false);
      setAplausos(video.aplausos);
      showToast("No se pudo aplaudir");
    }
  }

  async function handleShare() {
    const texto = `Mirá el festejo de ${video.autorAlias} en el Muro de la Hinchada 🇺🇾 Cada festejo dona una pelota, una beca o útiles para quien más lo necesita. #GritoGol #Mundial2026`;

    if (navigator.share) {
      try {
        await navigator.share({ title: "GritoGol", text: texto });
        setShares((n) => n + 1);
        showToast("¡Festejo compartido!");
        return;
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      setShares((n) => n + 1);
      showToast("Texto copiado para compartir");
    }
  }

  return (
    <article className={`${s.card} ${esPropio ? s.cardNuevo : ""}`}>
      <div className={s.cardHead}>
        <div className={`${s.avatar} ${avatarClass(video.gritoNumero ?? 0)}`}>
          {iniciales}
        </div>
        <div className={s.quien}>
          <div className={s.nombre}>{video.autorAlias}</div>
          <div className={s.meta}>{tiempoRelativo(video.publishedAt)}</div>
        </div>
        {video.gritoNumero === 1 ? (
          <span className={`${s.badge} ${s.badgeUno}`}>★ FESTEJO #1</span>
        ) : esPropio ? (
          <span className={`${s.badge} ${s.badgeVivo}`}>EN EL MURO</span>
        ) : null}
      </div>

      <div
        ref={containerRef}
        className={s.video}
        role="img"
        aria-label={`Video del festejo de ${video.autorAlias}`}
      >
        {url && playing ? (
          <video
            ref={videoElRef}
            className={s.videoEl}
            src={url}
            controls
            playsInline
            preload="metadata"
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (Number.isFinite(v.duration)) {
                setDuracion(formatoDuracion(v.duration));
              }
            }}
          />
        ) : (
          <button
            type="button"
            className={s.play}
            onClick={() => setPlaying(true)}
            aria-label="Reproducir video"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="#6FC3EE"
              aria-hidden="true"
            >
              <path d="M7 4l13 8-13 8z" />
            </svg>
          </button>
        )}
        {duracion && <span className={s.dur}>{duracion}</span>}
        <VideoSponsorOverlay />
      </div>

      <div className={s.cardAcciones}>
        <button
          type="button"
          className={`${s.accion} ${liked ? s.accionGustado : ""}`}
          onClick={() => void handleLike()}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill={liked ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M12 21s-7.5-4.7-9.7-9C.7 8.6 2.6 5 6.1 5c2 0 3.3 1 3.9 2 .6-1 1.9-2 3.9-2 3.5 0 5.4 3.6 3.8 7-2.2 4.3-9.7 9-9.7 9z" />
          </svg>
          <span>{formatoNumero(aplausos)}</span>
        </button>
        <button
          type="button"
          className={s.accion}
          onClick={() => void handleShare()}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v13" />
          </svg>
          <span>{formatoNumero(shares)}</span>
        </button>
        <span className={s.chipImpacto}>⚽ +1 pelota</span>
      </div>
    </article>
  );
}
