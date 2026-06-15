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
import { ref, uploadBytes } from "firebase/storage";
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

/**
 * Uploads a celebration video blob to Storage and creates a Firestore document
 * in the "revisando" state. Returns the generated videoId.
 */
export async function crearFestejo(
  params: CrearFestejoParams,
): Promise<string> {
  const { partidoId, eventoId, golNumero, userId, alias, blob } = params;

  const videoRef = doc(collection(db, "videos"));
  const videoId = videoRef.id;
  const storagePath = `videos-crudos/${partidoId}/${videoId}.webm`;

  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, blob);

  await setDoc(videoRef, {
    partidoId,
    eventoId,
    golNumero,
    userId,
    autorAlias: alias,
    storagePath,
    estado: "revisando" as VideoEstado,
    gritoNumero: null,
    aplausos: 0,
    moderacion: null,
    createdAt: serverTimestamp(),
    publishedAt: null,
  });

  return videoId;
}

/**
 * Subscribes to the real-time feed of published videos for a match,
 * ordered by most recent first. Invokes the callback on every update.
 */
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

/**
 * Subscribes to real-time updates for a single video document.
 * Invokes the callback on every change, including when the estado transitions.
 */
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

/**
 * Records an applause vote for a video. Uses a Firestore transaction on the
 * voto document (id = videoId_userId) to ensure exactly one vote per user per
 * video — idempotent regardless of how many times it is called.
 */
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

/**
 * Updates a video's moderation state. Called only by the Cloud Function via
 * Admin SDK or by the onVideoSubido trigger — not intended for direct client use.
 */
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
