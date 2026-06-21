import { useState, useEffect, useRef } from "react";
import s from "../../styles/app.module.css";
import { httpsCallable } from "firebase/functions";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { functions, db } from "../../firebase";
import { usePartido } from "../../context/PartidoContext";
import { useSuscripcion } from "../../context/SuscripcionContext";
import { useToast } from "../../context/ToastContext";
import { startDemoTicker } from "../../services/demoService";

export function FabDemo() {
  const { partidoId } = usePartido();
  const { fixtureFavorito } = useSuscripcion();
  const { showToast } = useToast();
  const [demoActive, setDemoActive] = useState(false);
  const [mockModeracion, setMockModeracion] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => { stopRef.current?.(); }, []);

  useEffect(() => {
    const ref = doc(db, "config/moderation");
    return onSnapshot(ref, (snap) => {
      setMockModeracion(snap.exists() ? (snap.data()?.mockEnabled ?? false) : false);
    });
  }, []);

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

  function handleToggleMock() {
    const next = !mockModeracion;
    void setDoc(doc(db, "config/moderation"), { mockEnabled: next }, { merge: true })
      .then(() => showToast(next ? "Moderación desactivada (mock)" : "Moderación activada (GPT-4o)"))
      .catch((e: Error) => showToast(`Error: ${e.message}`));
  }

  function handleGoalNow() {
    const simulateGoal = httpsCallable<{ partidoId: string }, { golNumero: number }>(
      functions,
      "simulateGoal",
    );
    void simulateGoal({ partidoId })
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
      <button
        type="button"
        className={`${s.fabDemoBtn} ${mockModeracion ? s.fabDemoBtnActive : s.fabDemoBtnMod}`}
        onClick={handleToggleMock}
        aria-label={mockModeracion ? "Moderación OFF (mock)" : "Moderación ON (GPT-4o)"}
        title={mockModeracion ? "Moderación OFF — click para activar" : "Moderación ON — click para desactivar"}
      >
        🛡
      </button>
    </div>
  );
}
