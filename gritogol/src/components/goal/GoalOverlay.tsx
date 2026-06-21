import { useCallback, useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { useNavigate } from "react-router-dom";
import s from "../../styles/app.module.css";
import { useAuth } from "../../context/AuthContext";
import { usePartido } from "../../context/PartidoContext";
import { useToast } from "../../context/ToastContext";
import { crearFestejo, obtenerVideo } from "../../services/videoService";
import { llamarModerarVideo } from "../../services/moderacionService";
import { extractFramesBase64 } from "../../utils/extractFrame";
import { useMediaRecorder } from "../../hooks/useMediaRecorder";
import type { Evento } from "../../types/firestore";
import { scoreCorto, formatoDuracion } from "../../utils/format";
import { VideoSponsorOverlay } from "../video/VideoSponsorOverlay";

type Paso = "gol" | "grabar" | "subiendo" | "revisando";

interface GoalOverlayProps {
  evento: ({ id: string } & Evento) | null;
  onClose: () => void;
}

export function GoalOverlay({ evento, onClose }: GoalOverlayProps) {
  const { partido, partidoId } = usePartido();
  const { user, alias } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [paso, setPaso] = useState<Paso>("gol");
  const [segundos, setSegundos] = useState(0);
  const [uploadLabel, setUploadLabel] = useState("");

  useEffect(() => {
    if (paso !== "gol") return;
    const colors = ["#6fc3ee", "#f4b63f", "#ffffff", "#3a7bd5"];
    const shared = { particleCount: 60, spread: 70, colors, startVelocity: 45, gravity: 0.9, ticks: 180 };
    void confetti({ ...shared, origin: { x: 0.1, y: 1 }, angle: 60 });
    void confetti({ ...shared, origin: { x: 0.9, y: 1 }, angle: 120 });
  }, [paso]);

  const procesarSubida = useCallback(
    async (blob: Blob) => {
      if (!evento || !user) return;

      setPaso("subiendo");
      setUploadLabel(formatoDuracion(0));

      try {
        // 1. Extract frames locally before any network call
        const framesBase64 = await extractFramesBase64(blob);

        // 2. Upload video and create Firestore doc
        const videoId = await crearFestejo({
          partidoId,
          eventoId: evento.id,
          golNumero: evento.golNumero,
          userId: user.uid,
          alias,
          blob,
        });

        // 3. Listen for moderation result
        setPaso("revisando");

        const unsubscribe = obtenerVideo(videoId, (video) => {
          if (!video) return;
          if (video.estado === "publicado") {
            unsubscribe();
            onClose();
            showToast("¡Estás en el muro! +1 pelota desbloqueada");
            navigate("/");
          } else if (video.estado === "rechazado") {
            unsubscribe();
            onClose();
            showToast("Tu festejo no pudo publicarse");
          }
        });

        // 4. Call moderation with frames already in hand
        llamarModerarVideo(videoId, framesBase64).catch((err: unknown) => {
          console.error("moderarVideo failed:", err);
        });

        setTimeout(() => {
          unsubscribe();
          onClose();
          navigate("/");
        }, 30000);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Error al subir";
        showToast(msg);
        setPaso("gol");
      }
    },
    [alias, evento, navigate, onClose, partidoId, showToast, user],
  );

  const onGrabado = useCallback(
    (_blob: Blob, file: File) => {
      setUploadLabel(formatoDuracion(0));
      void procesarSubida(file);
    },
    [procesarSubida],
  );

  const {
    previewRef,
    grabando,
    recSegundos,
    permisoMsg,
    showGaleriaAlt,
    iniciarCamara,
    toggleGrabacion,
    detenerCamara,
  } = useMediaRecorder(onGrabado);

  useEffect(() => {
    if (!evento) return;

    setPaso("gol");
    detenerCamara();

    function tick() {
      const restante = Math.max(
        0,
        Math.floor((evento!.ventanaCierraEn.toMillis() - Date.now()) / 1000),
      );
      setSegundos(restante);
      if (restante <= 0) {
        onClose();
      }
    }

    tick();
    countdownRef.current = setInterval(tick, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [evento, detenerCamara, onClose]);

  if (!evento || !partido) return null;

  const score = scoreCorto(
    partido.equipoLocal,
    partido.golesLocal,
    partido.equipoVisitante,
    partido.golesVisitante,
  );

  function handleGaleria(file: File | undefined) {
    if (!file) return;
    void procesarSubida(file);
  }

  function handleGrabarClick() {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setPaso("grabar");
    void iniciarCamara();
  }

  function handleCancelarRec() {
    detenerCamara();
    onClose();
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => {
          handleGaleria(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center text-center bg-[rgba(6,11,20,0.96)] [animation:golCelebracion_1.6s_ease-in-out]"
        style={{
          paddingTop: "max(32px, env(safe-area-inset-top))",
          paddingRight: "max(32px, env(safe-area-inset-right))",
          paddingBottom: "max(32px, env(safe-area-inset-bottom))",
          paddingLeft: "max(32px, env(safe-area-inset-left))",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Gol"
      >
        {paso === "gol" && (
          <div className="flex flex-col items-center w-full min-w-0 px-2 gap-[18px]">
            <div className="font-['Anton',sans-serif] text-[72px] leading-[0.95] text-[var(--celeste)] tracking-[2px] [animation:golpe_0.6s_ease-out]">¡GOOOL!</div>
            <p className="text-[16px] text-[var(--tiza)] [&_b]:text-[var(--celeste)]">
              de <b>{evento.equipo}</b> · {score}
            </p>
            <div className="w-[120px] h-[120px] rounded-full border-[3px] border-[var(--linea)] flex flex-col items-center justify-center mx-auto">
              <span className="font-['Anton',sans-serif] text-[42px] text-[var(--sol)] [font-variant-numeric:tabular-nums] leading-none">{formatoDuracion(segundos)}</span>
              <span className="text-[10px] tracking-[2px] text-[var(--gris)] uppercase">restante</span>
            </div>
            <p className="text-[13px] text-[var(--gris)] max-w-[260px]">
              Mostrá tu grito y ganate un lugar en el Muro de la Hinchada
              Mundial
            </p>
            <button
              type="button"
              className={s.btnGrande}
              onClick={handleGrabarClick}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                aria-hidden="true"
              >
                <path d="M15 8h.01M3 7a2 2 0 012-2h2l1.5-2h7L17 5h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                <circle cx="12" cy="12" r="3.5" />
              </svg>
              Grabar mi festejo
            </button>
            <button
              type="button"
              className={`${s.btnGrande} ${s.btnOutline}`}
              onClick={() => inputRef.current?.click()}
            >
              Subir festejo
            </button>
            <button type="button" className={s.btnFantasma} onClick={onClose}>
              Esta vez lo grito solo
            </button>
          </div>
        )}

        {paso === "grabar" && (
          <div className={s.grabador}>
            <div
              className={`${s.marco} ${grabando ? s.marcoGrabando : ""}`}
            >
              <span
                className={`${s.recTag} ${grabando ? s.recTagVisible : ""}`}
              >
                <span className={s.recDot} />
                {formatoDuracion(recSegundos)}
              </span>
              <video
                ref={previewRef}
                className={s.preview}
                autoPlay
                muted
                playsInline
              />
              <VideoSponsorOverlay />
            </div>
            <div className={s.controles}>
              <button
                type="button"
                className={s.btnFantasma}
                style={{ marginTop: 0 }}
                onClick={handleCancelarRec}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={`${s.btnRec} ${grabando ? s.btnRecGrabando : ""}`}
                aria-label="Grabar o detener"
                onClick={toggleGrabacion}
              >
                <span className={s.btnRecNucleo} />
              </button>
              <span style={{ width: 62 }} aria-hidden="true" />
            </div>
            <p className={s.permisoMsg}>{permisoMsg}</p>
            {showGaleriaAlt && (
              <button
                type="button"
                className={`${s.btnGrande} ${s.btnOutline}`}
                style={{ marginTop: 14, fontSize: 14, padding: "12px 22px" }}
                onClick={() => inputRef.current?.click()}
              >
                Subir festejo desde la galería
              </button>
            )}
          </div>
        )}

        {paso === "subiendo" && (
          <div className={s.subiendo}>
            <div className={`${s.spinner} ${s.spinnerAnim}`} aria-hidden="true" />
            <p style={{ fontSize: 15, fontWeight: 700 }}>
              Subiendo tu festejo…
            </p>
            <p style={{ fontSize: 12.5, color: "var(--gris)" }}>
              comprimiendo video · {uploadLabel || "…"}
            </p>
          </div>
        )}

        {paso === "revisando" && (
          <div className={s.subiendo}>
            <div className={`${s.spinner} ${s.spinnerAnim}`} aria-hidden="true" />
            <p style={{ fontSize: 15, fontWeight: 700 }}>
              El video está siendo revisado
            </p>
            <p style={{ fontSize: 12.5, color: "var(--gris)" }}>
              consultando con IA…
            </p>
          </div>
        )}
      </div>
    </>
  );
}
