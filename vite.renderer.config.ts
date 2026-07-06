import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

// https://vitejs.dev/config
export default defineConfig(async () => {
  const { default: react } = await import("@vitejs/plugin-react");
  const { default: tailwindcss } = await import("@tailwindcss/vite");

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    worker: {
      format: "es" as const,
    },
  };
});
