import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

interface ModerarVideoInput {
  videoId: string;
  framesBase64: string[];
}

interface ModerarVideoResult {
  ok: boolean;
  aprobado: boolean;
  razon?: string;
}

export async function llamarModerarVideo(
  videoId: string,
  framesBase64: string[],
): Promise<ModerarVideoResult> {
  const fn = httpsCallable<ModerarVideoInput, ModerarVideoResult>(
    functions,
    "moderarVideo",
  );
  const result = await fn({ videoId, framesBase64 });
  return result.data;
}
