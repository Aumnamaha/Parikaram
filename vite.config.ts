import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST || "localhost";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  // Tauri supports Chrome, Edge 103+, and Safari
  optimizeDeps: {
    include: ["@tauri-apps/api"],
  },

  server: {
    port: 1420,
    strictPort: true,
    host: true,
  },
  preview: {
    port: 1420,
    strictPort: true,
    host: true,
  },
});
