import s from "../../styles/app.module.css";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../firebase";
import { dispararGol } from "../../services/partidoService";
import { usePartido } from "../../context/PartidoContext";
import { useToast } from "../../context/ToastContext";

const useEmulators = import.meta.env.VITE_USE_EMULATORS === "true";

export function FabDemo() {
  const { partidoId } = usePartido();
  const { showToast } = useToast();

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

  return (
    <button
      type="button"
      className={s.fab}
      onClick={() => void handleClick()}
      aria-label="Simular gol (modo demo)"
    >
      ⚽ ¡GOL!
      <small>DEMO</small>
    </button>
  );
}
