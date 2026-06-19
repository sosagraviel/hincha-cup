import { useState } from "react";
import s from "../../styles/app.module.css";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../firebase";
import { dispararGol } from "../../services/partidoService";
import { usePartido } from "../../context/PartidoContext";
import { useToast } from "../../context/ToastContext";

const useEmulators = import.meta.env.VITE_USE_EMULATORS === "true";
const STORAGE_KEY = "gritogol_moderation_disabled";

export function getModerationDisabled(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function FabDemo() {
  const { partidoId } = usePartido();
  const { showToast } = useToast();
  const [modDisabled, setModDisabled] = useState(getModerationDisabled);

  if (!import.meta.env.DEV) return null;

  async function handleClick() {
    try {
      if (useEmulators) {
        const simulateGoal = httpsCallable<{ partidoId: string }, { golNumero: number }>(
          functions,
          "simulateGoal",
        );
        await simulateGoal({ partidoId });
      } else {
        await dispararGol(partidoId);
      }
      showToast("¡Gol de demo disparado!");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Error";
      showToast(`Error: ${msg}`);
    }
  }

  function toggleModeration() {
    const next = !modDisabled;
    localStorage.setItem(STORAGE_KEY, String(next));
    setModDisabled(next);
    showToast(next ? "Moderación desactivada" : "Moderación activada");
  }

  return (
    <div className={s.fabContainer}>
      <button
        type="button"
        className={s.fab}
        onClick={() => void handleClick()}
        aria-label="Simular gol (modo demo)"
      >
        ⚽ ¡GOL!
        <small>DEMO</small>
      </button>
      <button
        type="button"
        onClick={toggleModeration}
        style={{
          fontSize: "11px",
          padding: "4px 10px",
          borderRadius: "12px",
          border: "1px solid",
          cursor: "pointer",
          background: modDisabled ? "#ef4444" : "#22c55e",
          color: "#fff",
          borderColor: modDisabled ? "#dc2626" : "#16a34a",
        }}
      >
        {modDisabled ? "Moderación OFF" : "Moderación ON"}
      </button>
    </div>
  );
}
