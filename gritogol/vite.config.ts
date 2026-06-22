import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  build: { target: "ES2024" },
  server: {
    host: "0.0.0.0",
    port: 5173,
    watch: { usePolling: process.env["CHOKIDAR_USEPOLLING"] === "true" },
  },
});
