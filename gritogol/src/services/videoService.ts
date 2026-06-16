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
import { db, storage } from "../firebase";
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
