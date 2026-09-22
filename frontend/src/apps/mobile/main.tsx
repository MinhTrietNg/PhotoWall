import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Splash } from '@/components/Splash';
import { BackendProvider } from '@/lib/backend';
import { SessionProvider } from '@/state/SessionContext';
import '@/styles/tokens.css';
import '@/styles/base.css';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <BackendProvider fallback={<Splash />}>
        <SessionProvider>
          <App />
        </SessionProvider>
      </BackendProvider>
    </BrowserRouter>
  </StrictMode>,
);
