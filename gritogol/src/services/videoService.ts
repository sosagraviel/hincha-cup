import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  runTransaction,
  serverTimestamp,
  increment,
  setDoc,
  updateDoc,
  type Unsubscribe,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { db, storage, functions } from "../firebase";
import type { Video, VideoEstado, Moderacion } from "../types/firestore";

interface CrearFestejoParams {
  partidoId: string;
  eventoId: string;
  golNumero: number;
  userId: string;
  alias: string;
  blob: Blob;
}

const urlCache = new Map<string, string>();

export async function crearFestejo(
  params: CrearFestejoParams,
): Promise<string> {
  const { partidoId, eventoId, golNumero, userId, alias, blob } = params;

  const videoRef = doc(collection(db, "videos"));
  const videoId = videoRef.id;
  const mimeType = blob.type || "video/webm";
  const ext = mimeType.includes("mp4") ? "mp4" : "webm";
  const storagePath = `videos-crudos/${partidoId}/${videoId}.${ext}`;

  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, blob, { contentType: mimeType });

  await setDoc(videoRef, {
    partidoId,
    eventoId,
    golNumero,
    userId,
    autorAlias: alias,
    storagePath,
    mimeType,
    estado: "revisando" as VideoEstado,
    gritoNumero: null,
    aplausos: 0,
    moderacion: null,
    createdAt: serverTimestamp(),
    publishedAt: null,
  });

  return videoId;
}

export async function obtenerUrlVideo(storagePath: string): Promise<string> {
  const cached = urlCache.get(storagePath);
  if (cached) return cached;

  const url = await getDownloadURL(ref(storage, storagePath));
  urlCache.set(storagePath, url);
  return url;
}

export function obtenerFeed(
  partidoId: string,
  cb: (videos: Array<{ id: string } & Video>) => void,
): Unsubscribe {
  const q = query(
    collection(db, "videos"),
    where("partidoId", "==", partidoId),
    where("estado", "==", "publicado"),
    orderBy("createdAt", "desc"),
  );

  return onSnapshot(q, (snapshot) => {
    const videos = snapshot.docs.map(
      (docSnap: QueryDocumentSnapshot<DocumentData>) => ({
        id: docSnap.id,
        ...(docSnap.data() as Video),
      }),
    );
    cb(videos);
  });
}

export function obtenerMisFestejos(
  partidoId: string,
  userId: string,
  cb: (videos: Array<{ id: string } & Video>) => void,
): Unsubscribe {
  const q = query(
    collection(db, "videos"),
    where("partidoId", "==", partidoId),
    where("userId", "==", userId),
    orderBy("createdAt", "desc"),
  );

  return onSnapshot(q, (snapshot) => {
    const videos = snapshot.docs.map(
      (docSnap: QueryDocumentSnapshot<DocumentData>) => ({
        id: docSnap.id,
        ...(docSnap.data() as Video),
      }),
    );
    cb(videos);
  });
}

export function obtenerVideo(
  videoId: string,
  cb: (video: ({ id: string } & Video) | null) => void,
): Unsubscribe {
  const videoRef = doc(db, "videos", videoId);

  return onSnapshot(videoRef, (docSnap) => {
    if (!docSnap.exists()) {
      cb(null);
      return;
    }
    cb({ id: docSnap.id, ...(docSnap.data() as Video) });
  });
}

export async function aplaudir(
  videoId: string,
  userId: string,
): Promise<void> {
  const votoId = `${videoId}_${userId}`;
  const votoRef = doc(db, "votos", votoId);
  const videoRef = doc(db, "videos", videoId);

  await runTransaction(db, async (transaction) => {
    const votoSnap = await transaction.get(votoRef);

    if (votoSnap.exists()) {
      return;
    }

    transaction.set(votoRef, {
      videoId,
      userId,
      createdAt: serverTimestamp(),
    });

    transaction.update(videoRef, {
      aplausos: increment(1),
    });
  });
}

export async function actualizarEstado(
  videoId: string,
  estado: VideoEstado,
  gritoNumero: number | null,
  moderacion: Moderacion | null,
): Promise<void> {
  const videoRef = doc(db, "videos", videoId);
  await updateDoc(videoRef, {
    estado,
    gritoNumero,
    moderacion,
    publishedAt: estado === "publicado" ? serverTimestamp() : null,
  });
}

export function extractFrameBase64(source: Blob | string, timeRatio = 0.5): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";

    const objectUrl = source instanceof Blob ? URL.createObjectURL(source) : null;
    const cleanup = () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timeout extrayendo fotograma del video"));
    }, 15000);

    const done = (base64: string) => {
      clearTimeout(timeout);
      cleanup();
      resolve(base64);
    };

    const fail = (msg: string) => {
      clearTimeout(timeout);
      cleanup();
      reject(new Error(msg));
    };

    const capture = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      canvas.getContext("2d")!.drawImage(video, 0, 0);
      done(canvas.toDataURL("image/png").split(",")[1]);
    };

    video.addEventListener("seeked", capture, { once: true });

    video.addEventListener("loadedmetadata", () => {
      if (video.duration && isFinite(video.duration)) {
        video.currentTime = video.duration * timeRatio;
      } else {
        video.currentTime = 1;
      }
    }, { once: true });

    video.addEventListener("loadeddata", () => {
      if (video.readyState >= 2 && video.currentTime > 0) {
        capture();
      }
    }, { once: true });

    video.addEventListener("error", () => { fail("Error al cargar el video para extracción de fotograma"); }, { once: true });

    video.src = objectUrl ?? (source as string);
    video.load();
  });
}

export async function llamarModeracion(
  videoId: string,
  frameBase64: string,
): Promise<"publicado" | "rechazado"> {
  const fn = httpsCallable<
    { videoId: string; frameBase64: string },
    { estado: "publicado" | "rechazado" }
  >(functions, "moderarVideo");
  const result = await fn({ videoId, frameBase64 });
  return result.data.estado;
}
