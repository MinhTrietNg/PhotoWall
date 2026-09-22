import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Splash } from '@/components/Splash';
import { ModeratorBackendProvider } from '@/lib/backend';
import '@/styles/tokens.css';
import '@/styles/base.css';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    {/* Served under /admin/ — see firebase.json's rewrite. */}
    <BrowserRouter basename="/admin">
      <ModeratorBackendProvider fallback={<Splash />}>
        <App />
      </ModeratorBackendProvider>
    </BrowserRouter>
  </StrictMode>,
);
