import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import s from "../styles/app.module.css";
import { AuthProvider } from "../context/AuthContext";
import { CopaProvider } from "../context/CopaContext";
import { PartidoProvider, usePartido } from "../context/PartidoContext";
import { ToastProvider } from "../context/ToastContext";
import { Header } from "../components/layout/Header";
import { LiveBar } from "../components/layout/LiveBar";
import { CopaTicker } from "../components/layout/CopaTicker";
import { ImpactMarcador } from "../components/layout/ImpactMarcador";
import { TabBar } from "../components/layout/TabBar";
import { Toast } from "../components/ui/Toast";
import { FabDemo } from "../components/ui/FabDemo";
import { GoalOverlay } from "../components/goal/GoalOverlay";
import {
  suscribirEventos,
  eventoVentanaAbierta,
} from "../services/partidoService";
import type { Evento } from "../types/firestore";
import { MuroView } from "../components/views/MuroView";
import { ImpactoView } from "../components/views/ImpactoView";
import { PerfilView } from "../components/views/PerfilView";

function AppShellInner() {
  const { partidoId } = usePartido();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const seenEventsRef = useRef<Set<string>>(new Set());
  const [eventoActivo, setEventoActivo] = useState<
    ({ id: string } & Evento) | null
  >(null);
  const [overlayDismissed, setOverlayDismissed] = useState(false);

  useEffect(() => {
    seenEventsRef.current.clear();
    setOverlayDismissed(false);
    setEventoActivo(null);
  }, [partidoId]);

  useEffect(() => {
    const unsubscribe = suscribirEventos(partidoId, (eventos) => {
      const abierto = eventos.find(eventoVentanaAbierta);
      if (!abierto) return;

      if (seenEventsRef.current.has(abierto.id)) {
        if (!overlayDismissed) setEventoActivo(abierto);
        return;
      }

      seenEventsRef.current.add(abierto.id);
      setOverlayDismissed(false);
      setEventoActivo(abierto);
    });

    return unsubscribe;
  }, [partidoId, overlayDismissed]);

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [location.pathname]);

  function renderTab() {
    if (location.pathname.startsWith("/impacto")) return <ImpactoView />;
    if (location.pathname.startsWith("/perfil")) return <PerfilView />;
    return <MuroView />;
  }

  return (
    <div className={s.app}>
      <Header />
      <LiveBar />
      <CopaTicker />
      <ImpactMarcador />

      <main ref={mainRef} className={s.main}>
        {renderTab()}
      </main>

      <FabDemo />
      <TabBar />
      <Toast />

      {eventoActivo && !overlayDismissed && (
        <GoalOverlay
          evento={eventoActivo}
          onClose={() => {
            setOverlayDismissed(true);
            setEventoActivo(null);
          }}
        />
      )}
    </div>
  );
}

export default function AppPage() {
  return (
    <AuthProvider>
      <PartidoProvider>
        <CopaProvider>
          <ToastProvider>
            <AppShellInner />
          </ToastProvider>
        </CopaProvider>
      </PartidoProvider>
    </AuthProvider>
  );
}
