import s from "../../styles/app.module.css";
import { useAuth } from "../../context/AuthContext";

interface GanasteOverlayProps {
  onClose: () => void;
}

export function GanasteOverlay({ onClose }: GanasteOverlayProps) {
  const { alias } = useAuth();

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center text-center bg-[rgba(6,11,20,0.96)]"
      style={{
        paddingTop: "max(32px, env(safe-area-inset-top))",
        paddingRight: "max(32px, env(safe-area-inset-right))",
        paddingBottom: "max(32px, env(safe-area-inset-bottom))",
        paddingLeft: "max(32px, env(safe-area-inset-left))",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Ganaste"
    >
      <div className="flex flex-col items-center gap-5 w-full max-w-[320px]">
        <div className="text-[64px] leading-none">🏆</div>

        <div className="font-['Anton',sans-serif] text-[64px] leading-[0.95] text-[var(--celeste)] tracking-[2px]">
          ¡GANASTE!
        </div>

        <div className="text-[22px] font-bold text-[var(--tiza)]">{alias}</div>

        <div className="w-full border-2 border-[var(--sol)] rounded-[var(--radius)] bg-gradient-to-b from-[#1a2540] to-[#13203a] py-[22px] px-[18px] flex flex-col gap-3">
          <div>
            <div className="text-[10px] tracking-[2.5px] text-[var(--sol)] font-bold uppercase">
              ★ Tu Premio ★
            </div>
            <div className="text-[17px] font-bold text-[var(--tiza)] mt-1">
              una camiseta de tu equipo
            </div>
          </div>
          <div className="border-t border-dashed border-[var(--linea)] pt-3">
            <div className="text-[13px] font-bold text-[var(--cesped)]">
              tu video ayudó a la escuela con 20 pelotas
            </div>
          </div>
        </div>

        <button type="button" className={s.btnFantasma} onClick={onClose}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
