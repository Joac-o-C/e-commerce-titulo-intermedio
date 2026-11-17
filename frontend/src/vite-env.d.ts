/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  /** Nombre de la tienda (opcional, por defecto "Tienda"). */
  readonly VITE_STORE_NAME?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
