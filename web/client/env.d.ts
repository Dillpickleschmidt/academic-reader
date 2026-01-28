/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_MODE: "local" | "datalab" | "modal"
  readonly VITE_CONVEX_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
