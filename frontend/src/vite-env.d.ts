/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  /** Nombre de la tienda (opcional, por defecto "Tienda"). */
  readonly VITE_STORE_NAME?: string
  /** `true` muestra el selector de tema (Fase 6, para comparar propuestas). */
  readonly VITE_THEME_SELECTION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
