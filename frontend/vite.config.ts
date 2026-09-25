import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Three separate web apps, one Firebase Hosting target:
//   /          -> mobile guest flow   (index.html)
//   /display/  -> big screen kiosk    (display/index.html)
//   /admin/    -> moderation console  (admin/index.html)
// firebase.json rewrites each prefix to its own index.html.
export default defineConfig({
  plugins: [react()],
  // The bucket's CORS allowlist only opens this port in development.
  server: { port: 5173, strictPort: true, host: true },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
      '@backend': resolve(import.meta.dirname, '../backend/src'),
    },
    // REQUIRED. Without this there are two copies of the Firebase SDK (this app's
    // and backend/'s) and Firestore throws "Type does not match the expected instance".
    dedupe: [
      'firebase',
      '@firebase/app',
      '@firebase/auth',
      '@firebase/firestore',
      '@firebase/storage',
      '@firebase/app-check',
    ],
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        mobile: resolve(import.meta.dirname, 'index.html'),
        display: resolve(import.meta.dirname, 'display/index.html'),
        admin: resolve(import.meta.dirname, 'admin/index.html'),
      },
    },
  },
});
