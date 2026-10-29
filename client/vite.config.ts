import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const allowedHost = (process.env.VITE_ALLOWED_HOST ?? env.VITE_ALLOWED_HOST)?.trim();

  return {
    plugins: [react()],
    server: {
      host: true,
      allowedHosts: allowedHost ? [allowedHost] : undefined,
      proxy: {
        "/api": {
          target: "http://server:3001",
          changeOrigin: true,
        },
      },
    },
  };
});
