import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Bind on all interfaces so tunnel agents (cloudflared/ngrok) can always reach Vite.
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,

    // 👇 เพิ่มโดเมน ngrok/trycloudflare สำหรับใช้งานผ่าน tunnel
    allowedHosts: [
      "localhost",
      "dd4cb5231c1a.ngrok-free.app",
      ".trycloudflare.com",
    ],

    proxy: {
      "/api": {
        target: "http://127.0.0.1:4001",
        changeOrigin: true
      }
    }
  }
});
