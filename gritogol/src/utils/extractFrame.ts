export async function extractFramesBase64(blob: Blob, count = 3): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";

    video.onloadedmetadata = () => {
      const duration = isFinite(video.duration) && video.duration > 0
        ? video.duration
        : 5;

      // evenly spaced positions: 25%, 50%, 75% of duration
      const positions = Array.from(
        { length: count },
        (_, i) => ((i + 1) / (count + 1)) * duration,
      );

      const frames: string[] = [];
      let idx = 0;

      const captureFrame = () => {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error("Canvas 2D context not available"));
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push(canvas.toDataURL("image/png").split(",")[1] ?? "");
        idx++;
        if (idx < positions.length) {
          video.currentTime = positions[idx];
        } else {
          URL.revokeObjectURL(url);
          resolve(frames);
        }
      };

      video.onseeked = captureFrame;
      video.currentTime = positions[0];
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load video for frame extraction"));
    };

    video.src = url;
    video.load();
  });
}
