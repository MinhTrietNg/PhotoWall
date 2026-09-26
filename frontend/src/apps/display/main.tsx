/**
 * Big screen kiosk (1920x1080) — DESIGN-D18 / D19, served at /display/.
 * See Claude/Claude-Plan.md §6 (DESIGN-D18/D19) and §22 Phase 9.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Splash } from '@/components/Splash';
import { DisplayBackendProvider, ModeratorBackendProvider } from '@/lib/backend';
import '@/styles/tokens.css';
import '@/styles/base.css';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    {/* Both providers share one Firebase app (initBackend is memoised), so the
        wall reads Firestore as the signed-in moderator. */}
    <ModeratorBackendProvider fallback={<Splash />}>
      <DisplayBackendProvider fallback={<Splash />}>
        <App />
      </DisplayBackendProvider>
    </ModeratorBackendProvider>
  </StrictMode>,
);
