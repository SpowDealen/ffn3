import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.FFN3_API_PROXY_TARGET?.trim() || "http://localhost:3000";

  return {
    plugins: [react()],
    // Development only: production keeps the configured/same-origin API base.
    server: {
      proxy: {
        "/api": {
          target,
          changeOrigin: true,
        },
      },
    },
  };
});
