/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE: string;
  readonly VITE_SERVER_ORIGIN: string;
  /**
   * Explicit public origin for media/upload URLs.
   * e.g. "https://api.nakhsha.ir"  (no trailing slash)
   * Takes precedence over VITE_SERVER_ORIGIN when resolving relative paths.
   */
  readonly VITE_API_ORIGIN: string;
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
