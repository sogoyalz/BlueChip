/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_DASHBOARD_URL?: string;
  /** Honoured for continuity with the pre-Vite deployment configuration. */
  readonly REACT_APP_API_URL?: string;
  readonly REACT_APP_DASHBOARD_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
