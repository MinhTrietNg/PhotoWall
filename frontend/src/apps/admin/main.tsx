/**
 * Moderation console (fixed 1280) — DESIGN-D20 / D21 / D22, served at /admin/.
 *
 * Placeholder. Build in Phase 10: Google sign-in + allowlist check, the three
 * tabs, the 44/96/1fr/170/330/220 table grid, bulk actions, the remove dialog,
 * and the A / R / arrow-key shortcuts.
 * Read Claude/Claude-Plan.md §20.5 (#9 #10 #11 #12) BEFORE building M02 —
 * most of the settings screen has no backend to write to yet.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/tokens.css';
import '@/styles/base.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <main style={{ padding: 32 }}>
      <h1 className="u" style={{ font: 'var(--pw-type-h2)' }}>
        Photo Wall · Kiểm duyệt
      </h1>
      <p style={{ font: 'var(--pw-type-body)', color: 'var(--pw-ink-2)' }}>
        Chưa dựng — xem Claude/Claude-Plan.md §22 Phase 10.
      </p>
    </main>
  </StrictMode>,
);
