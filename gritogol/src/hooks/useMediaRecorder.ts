import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

function mimePreferido(): string {
  const opciones = [
    "video/mp4;codecs=avc1",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const mime of opciones) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return "";
}

// iOS Safari records MP4 natively but isTypeSupported returns "" — detect actual format
function resolverMime(rawMime: string): string {
  if (!rawMime && /iP(ad|hone|od)/i.test(navigator.userAgent)) return "video/mp4";
  return rawMime || "video/webm";
}

interface UseMediaRecorderResult {
  previewRef: RefObject<HTMLVideoElement>;
  grabando: boolean;
  recSegundos: number;
  permisoMsg: string;
  showGaleriaAlt: boolean;
  iniciarCamara: () => Promise<void>;
  toggleGrabacion: () => void;
  detenerCamara: () => void;
}

export function useMediaRecorder(
  onGrabado: (blob: Blob, file: File) => void,
): UseMediaRecorderResult {
  const previewRef = useRef<HTMLVideoElement>(null!);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const partesRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [grabando, setGrabando] = useState(false);
  const [recSegundos, setRecSegundos] = useState(0);
  const [permisoMsg, setPermisoMsg] = useState(
    "Tocá el botón rojo para empezar a grabar tu grito",
  );
  const [showGaleriaAlt, setShowGaleriaAlt] = useState(false);

  const detenerCamara = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (previewRef.current) {
      previewRef.current.srcObject = null;
    }
    setGrabando(false);
    setRecSegundos(0);
  }, []);

  useEffect(() => () => detenerCamara(), [detenerCamara]);

  const iniciarCamara = useCallback(async () => {
    setPermisoMsg("Pidiendo permiso de cámara y micrófono…");
    setShowGaleriaAlt(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: true,
      });
      streamRef.current = stream;
      if (previewRef.current) {
        previewRef.current.srcObject = stream;
      }
      setPermisoMsg("Tocá el botón rojo para empezar a grabar tu grito");
    } catch (error: unknown) {
      const name =
        error instanceof Error && "name" in error
          ? (error as { name: string }).name
          : "";

      if (name === "NotAllowedError") {
        setPermisoMsg(
          "El entorno bloqueó la cámara sin preguntar. Abrí la app en el navegador del teléfono (o en un sitio con https) y vas a ver el pedido de permiso. Mientras tanto, podés subir un video:",
        );
      } else if (name === "NotFoundError") {
        setPermisoMsg(
          "No encontramos ninguna cámara en este dispositivo. Podés subir un video desde la galería:",
        );
      } else {
        setPermisoMsg(
          "No pudimos acceder a la cámara. Revisá los permisos del navegador, o subí un video:",
        );
      }
      setShowGaleriaAlt(true);
    }
  }, []);

  const detenerGrabacion = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setGrabando(false);
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }, []);

  const toggleGrabacion = useCallback(() => {
    if (!streamRef.current) {
      setPermisoMsg("Primero aceptá el permiso de la cámara.");
      return;
    }

    if (!recorderRef.current || recorderRef.current.state === "inactive") {
      partesRef.current = [];
      const mime = mimePreferido();

      try {
        recorderRef.current = mime
          ? new MediaRecorder(streamRef.current, { mimeType: mime })
          : new MediaRecorder(streamRef.current);
      } catch {
        setPermisoMsg(
          "Tu navegador no soporta grabación. Probá subiendo desde la galería.",
        );
        setShowGaleriaAlt(true);
        return;
      }

      recorderRef.current.ondataavailable = (e) => {
        if (e.data.size) partesRef.current.push(e.data);
      };

      recorderRef.current.onstop = () => {
        const tipo = resolverMime(recorderRef.current?.mimeType ?? "");
        const blob = new Blob(partesRef.current, { type: tipo });
        const ext = tipo.includes("mp4") ? "mp4" : "webm";
        const file = new File([blob], `mi-festejo.${ext}`, { type: tipo });
        detenerCamara();
        onGrabado(blob, file);
      };

      recorderRef.current.start();
      setRecSegundos(0);
      setGrabando(true);
      setPermisoMsg(
        "Grabando… tocá de nuevo para terminar (máx. 30 seg)",
      );

      timerRef.current = setInterval(() => {
        setRecSegundos((s) => {
          if (s >= 29) {
            detenerGrabacion();
            return s;
          }
          return s + 1;
        });
      }, 1000);
    } else {
      detenerGrabacion();
    }
  }, [detenerCamara, detenerGrabacion, onGrabado]);

  return {
    previewRef,
    grabando,
    recSegundos,
    permisoMsg,
    showGaleriaAlt,
    iniciarCamara,
    toggleGrabacion,
    detenerCamara,
  };
}
