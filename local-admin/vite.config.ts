import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget =
    env.VITE_PROXY_TARGET || "http://localhost:4000";

  return {
    plugins: [react()],
    server: {
      port: 3099,
      strictPort: true,
      proxy: {
        "/api/v1": {
          target: proxyTarget,
          changeOrigin: true,
          secure: true,
        },
        "/uploads": {
          target: proxyTarget,
          changeOrigin: true,
          secure: true,
        },
      },
    },
  };
});
