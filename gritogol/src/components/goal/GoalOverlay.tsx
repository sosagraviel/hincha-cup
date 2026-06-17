import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import s from "../../styles/app.module.css";
import { useAuth } from "../../context/AuthContext";
import { usePartido } from "../../context/PartidoContext";
import { useToast } from "../../context/ToastContext";
import { crearFestejo, obtenerVideo } from "../../services/videoService";
import { useMediaRecorder } from "../../hooks/useMediaRecorder";
import type { Evento } from "../../types/firestore";
import { scoreCorto, formatoDuracion } from "../../utils/format";
import { VideoSponsorOverlay } from "../video/VideoSponsorOverlay";

type Paso = "gol" | "grabar" | "subiendo";

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

  const procesarSubida = useCallback(
    async (blob: Blob) => {
      if (!evento || !user) return;

      setPaso("subiendo");
      setUploadLabel(formatoDuracion(0));

      try {
        const videoId = await crearFestejo({
          partidoId,
          eventoId: evento.id,
          golNumero: evento.golNumero,
          userId: user.uid,
          alias,
          blob,
        });

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

        setTimeout(() => {
          unsubscribe();
          onClose();
          navigate(`/estado/${videoId}`);
        }, 15000);
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
        className={`${s.overlay} ${s.overlayVisible}`}
        role="dialog"
        aria-modal="true"
        aria-label="Gol"
      >
        {paso === "gol" && (
          <div>
            <div className={`${s.golTitulo} ${s.golTituloAnim}`}>¡GOOOL!</div>
            <p className={s.golSub}>
              de <b>{evento.equipo}</b> · {score}
            </p>
            <div className={s.reloj}>
              <span className={s.relojSeg}>{formatoDuracion(segundos)}</span>
              <span className={s.relojLbl}>restante</span>
            </div>
            <p className={s.golPista}>
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
            <p style={{ fontSize: 12.5, color: "var(--muted)" }}>
              comprimiendo video · {uploadLabel || "…"}
            </p>
          </div>
        )}
      </div>
    </>
  );
}
