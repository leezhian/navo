import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // node-pty 会在运行时按平台动态加载 pty.node，不能被 Rollup 打进主进程 bundle。
      external: ["node-pty"],
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
