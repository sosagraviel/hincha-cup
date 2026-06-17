function rrect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function dibujarInsignia(
  puesto: string,
  partidoLabel: string,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 1080;
  c.height = 1350;
  const ctx = c.getContext("2d");
  if (!ctx) return c;

  ctx.fillStyle = "#0B1322";
  ctx.fillRect(0, 0, 1080, 1350);

  ctx.strokeStyle = "#F4B63F";
  ctx.lineWidth = 10;
  rrect(ctx, 60, 60, 960, 1230, 40);
  ctx.stroke();

  ctx.textAlign = "center";

  ctx.fillStyle = "#F4B63F";
  ctx.font = "700 38px Barlow, sans-serif";
  ctx.fillText("★  I N S I G N I A   D E   H I N C H A  ★", 540, 300);

  ctx.fillStyle = "#EDF4FA";
  ctx.font = "160px Barlow Condensed, sans-serif";
  ctx.fillText(puesto, 540, 560);

  ctx.fillStyle = "#92A6BE";
  ctx.font = "44px Barlow, sans-serif";
  ctx.fillText(partidoLabel, 540, 650);

  ctx.strokeStyle = "#26395A";
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 14]);
  ctx.beginPath();
  ctx.moveTo(180, 760);
  ctx.lineTo(900, 760);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "#3BC273";
  ctx.font = "700 46px Barlow, sans-serif";
  ctx.fillText("Mi grito desbloqueó 1 pelota", 540, 880);
  ctx.fillText("para quien más la necesita", 540, 945);

  ctx.font = "110px Barlow Condensed, sans-serif";
  ctx.fillStyle = "#EDF4FA";
  ctx.fillText("GRITO", 488, 1170);
  const w = ctx.measureText("GRITO").width;
  ctx.fillStyle = "#3B82F6";
  ctx.textAlign = "left";
  ctx.fillText("GOL", 488 + w / 2, 1170);
  ctx.textAlign = "center";

  ctx.fillStyle = "#92A6BE";
  ctx.font = "34px Barlow, sans-serif";
  ctx.fillText("tu grito vale un gol", 540, 1225);

  return c;
}

export async function compartirInsignia(
  puesto: string,
  partidoLabel: string,
  texto: string,
  onDone: (msg: string) => void,
): Promise<void> {
  const fontsReady =
    document.fonts &&
    Promise.all([
      document.fonts.load("700 160px 'Barlow Condensed'"),
      document.fonts.load("700 46px Barlow"),
    ]).catch(() => undefined);

  await fontsReady;

  const canvas = dibujarInsignia(puesto, partidoLabel);

  await new Promise<void>((resolve) => {
    canvas.toBlob((blob) => {
      void (async () => {
        const archivo = blob
          ? new File([blob], "insignia-gritogol.png", { type: "image/png" })
          : null;

        if (
          archivo &&
          navigator.canShare &&
          navigator.canShare({ files: [archivo] })
        ) {
          try {
            await navigator.share({
              files: [archivo],
              title: "GritoGol",
              text: texto,
            });
            onDone("¡Insignia compartida!");
            resolve();
            return;
          } catch (error: unknown) {
            if (error instanceof Error && error.name === "AbortError") {
              resolve();
              return;
            }
          }
        }

        if (navigator.share) {
          try {
            await navigator.share({ title: "GritoGol", text: texto });
            onDone("¡Insignia compartida!");
            resolve();
            return;
          } catch (error: unknown) {
            if (error instanceof Error && error.name === "AbortError") {
              resolve();
              return;
            }
          }
        }

        if (blob) {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "insignia-gritogol.png";
          document.body.appendChild(a);
          a.click();
          a.remove();
        }

        if (navigator.clipboard?.writeText) {
          try {
            await navigator.clipboard.writeText(texto);
            onDone("Insignia descargada y texto copiado para pegar");
          } catch {
            onDone("Insignia descargada como imagen");
          }
        } else {
          onDone("Insignia descargada como imagen");
        }

        resolve();
      })();
    }, "image/png");
  });
}
