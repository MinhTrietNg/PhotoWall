/**
 * The big screen behind the same Google sign-in as the console: only an
 * account on the moderators allowlist (moderator or admin) gets the wall, so
 * a stray phone that scans the display URL sees M00, not the kiosk. The
 * sign-in persists across the kiosk's own reloads.
 */
import { Splash } from '@/components/Splash';
import { useModeratorAuth } from '@/features/moderation/useModeratorAuth';
import { useModeratorBackend } from '@/lib/backend';
import { Display } from '@/pages/Display';
import { ModLogin } from '@/pages/ModLogin';

export function App() {
  const backend = useModeratorBackend();
  const auth = useModeratorAuth(backend);

  if (auth.status === 'loading') return <Splash />;

  if (auth.status !== 'ok') {
    return (
      <ModLogin
        title="Màn hình lớn Photo Wall"
        body="Đăng nhập bằng tài khoản Google của người kiểm duyệt hoặc Admin để mở màn hình lớn. Khách tham gia không vào trang này."
        deniedEmail={auth.status === 'denied' ? auth.email : undefined}
        onSignIn={() => backend.signIn()}
      />
    );
  }

  return <Display />;
}
