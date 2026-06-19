import { useState, useEffect, useRef } from "react";
import s from "../../styles/app.module.css";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../firebase";
import { usePartido } from "../../context/PartidoContext";
import { useSuscripcion } from "../../context/SuscripcionContext";
import { useToast } from "../../context/ToastContext";
import { startDemoTicker } from "../../services/demoService";

export function FabDemo() {
  const { partidoId } = usePartido();
  const { fixtureFavorito } = useSuscripcion();
  const { showToast } = useToast();
  const [demoActive, setDemoActive] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => { stopRef.current?.(); }, []);

  if (!import.meta.env.DEV) return null;

  function handleToggleDemo() {
    if (demoActive) {
      stopRef.current?.();
      stopRef.current = null;
      setDemoActive(false);
      showToast("Demo detenido");
    } else {
      if (!fixtureFavorito) {
        showToast("Seleccioná un partido favorito primero");
        return;
      }
      const stop = startDemoTicker({
        fixtureId: fixtureFavorito,
        partidoId,
        tickIntervalMs: 15_000,
        goalDelayMs: 60_000,
      });
      stopRef.current = stop;
      setDemoActive(true);
      showToast("Demo iniciado — gol en ~60 s");
    }
  }

  function handleGoalNow() {
    const simulateGoal = httpsCallable<{ partidoId: string }, { golNumero: number }>(
      functions,
      "simulateGoal",
    );
    void simulateGoal({ partidoId })
      .then(() => showToast("¡Gol disparado!"))
      .catch((e: Error) => showToast(`Error: ${e.message}`));
  }

  return (
    <div className={s.fabDemoGroup}>
      <span className={s.fabDemoLabel}>{demoActive ? "live" : "demo"}</span>
      <button
        type="button"
        className={`${s.fabDemoBtn} ${demoActive ? s.fabDemoBtnActive : s.fabDemoBtnPrimary}`}
        onClick={handleToggleDemo}
        aria-label={demoActive ? "Detener demo" : "Iniciar demo automático"}
        title={demoActive ? "Detener demo" : "Iniciar demo (gol en ~60 s)"}
      >
        {demoActive ? "⏹" : "▶"}
      </button>
      <button
        type="button"
        className={s.fabDemoBtn}
        onClick={handleGoalNow}
        aria-label="Disparar gol ahora"
        title="Disparar gol ahora"
      >
        ⚽
      </button>
    </div>
  );
}
