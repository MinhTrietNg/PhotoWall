/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'mock' (default in dev) | 'firebase' */
  readonly VITE_BACKEND?: 'mock' | 'firebase';
  /** '1' to point the real backend at the local emulators. */
  readonly VITE_EMULATORS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
