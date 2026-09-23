/**
 * Moderation console — DESIGN-D20/D21/D22, served at /admin/.
 *
 * One route table for both signed-out and denied moderators (M00) and one for
 * an allowed moderator (M01/M02) — auth state decides which renders, same as
 * the design draws the "not on the allowlist" error on the M00 board itself.
 */
import { Navigate, Route, Routes } from 'react-router-dom';
import { useModeratorAuth } from '@/features/moderation/useModeratorAuth';
import { useModeratorBackend } from '@/lib/backend';
import { ModLogin } from '@/pages/ModLogin';
import { ModQueue } from '@/pages/ModQueue';
import { ModSettings } from '@/pages/ModSettings';

export function App() {
  const backend = useModeratorBackend();
  const auth = useModeratorAuth(backend);

  if (auth.status === 'loading') return null;

  if (auth.status !== 'ok') {
    return (
      <ModLogin
        deniedEmail={auth.status === 'denied' ? auth.email : undefined}
        onSignIn={() => backend.signIn()}
      />
    );
  }

  // Board 07: M02 (settings, uploads switch) is admin-only; moderators only review.
  const isAdmin = auth.account.role === 'admin';

  return (
    <Routes>
      <Route path="/" element={<ModQueue account={auth.account} onSignOut={() => void backend.signOut()} />} />
      {isAdmin ? <Route path="/settings" element={<ModSettings email={auth.email} />} /> : null}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
