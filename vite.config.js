import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const appRoot = resolve(projectRoot, "studio");

export default defineConfig({
  base: "/Bio/",
  root: appRoot,
  envDir: projectRoot,
  plugins: [react()],
  server: {
    host: "127.0.0.1"
  },
  build: {
    outDir: resolve(projectRoot, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        public: resolve(appRoot, "index.html"),
        admin: resolve(appRoot, "admin/index.html")
      }
    }
  }
});
