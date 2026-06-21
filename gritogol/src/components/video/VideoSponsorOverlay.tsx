export function VideoSponsorOverlay() {
  return (
    <div className="absolute bottom-0 left-0 right-0 pt-20 pb-7 px-3 bg-gradient-to-t from-[rgba(6,11,20,0.95)] to-transparent pointer-events-none z-[3] flex items-end justify-center">
      <span className="text-[24px] font-black tracking-[4px] uppercase text-[var(--celeste)] drop-shadow-[0_0_16px_rgba(111,195,238,1)]">⚡ MARCA ALIADA</span>
    </div>
  );
}
