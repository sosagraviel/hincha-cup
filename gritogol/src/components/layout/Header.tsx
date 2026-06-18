import { usePartido } from "../../context/PartidoContext";
import { codigosPartido } from "../../utils/format";

export function Header() {
  const { partido } = usePartido();

  const equiposLabel = partido
    ? codigosPartido(partido.equipoLocal, partido.equipoVisitante)
    : "— – —";

  return (
    <header className="flex items-baseline justify-between px-6 pt-[18px] pb-[10px]">
      <div>
        <div className="font-display text-[30px] font-bold tracking-[1px] text-foreground leading-none">
          GRITO<span className="text-gold">GOL</span>
        </div>
        <div className="text-[11px] text-muted tracking-[0.4px]">
          tu grito vale un gol
        </div>
      </div>
      <div className="text-right">
        <div className="text-[10px] text-muted tracking-[1px]">MUNDIAL 2026</div>
        <div className="text-[12px] text-primary font-bold">{equiposLabel}</div>
      </div>
    </header>
  );
}
