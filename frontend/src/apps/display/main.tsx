/**
 * Big screen kiosk (1920x1080) — DESIGN-D18 / D19, served at /display/.
 * See Claude/Claude-Plan.md §6 (DESIGN-D18/D19) and §22 Phase 9.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Splash } from '@/components/Splash';
import { DisplayBackendProvider } from '@/lib/backend';
import { Display } from '@/pages/Display';
import '@/styles/tokens.css';
import '@/styles/base.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <DisplayBackendProvider fallback={<Splash />}>
      <Display />
    </DisplayBackendProvider>
  </StrictMode>,
);
