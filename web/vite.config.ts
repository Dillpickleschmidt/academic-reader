import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: "../",
  define: {
    // Expose BACKEND_MODE as VITE_BACKEND_MODE for client code
    "import.meta.env.VITE_BACKEND_MODE": JSON.stringify(
      process.env.BACKEND_MODE || "datalab",
    ),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
})
