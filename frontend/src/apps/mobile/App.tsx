/**
 * The guest mobile app. Routes are fixed by the design — DESIGN-D30 / §5 of the
 * plan. Do not add routes; in particular there is deliberately no /wall on the
 * phone (invariant I9).
 */
import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Dialog } from '@/components/Dialog';
import { useBackend } from '@/lib/backend';
import { useSession } from '@/state/SessionContext';
import { CameraPage } from '@/pages/CameraPage';
import { Closed } from '@/pages/Closed';
import { Done } from '@/pages/Done';
import { EnterName } from '@/pages/EnterName';
import { Finish } from '@/pages/Finish';
import { MyStrip } from '@/pages/MyStrip';
import { ShotReview } from '@/pages/ShotReview';
import { Upload } from '@/pages/Upload';
import { Welcome } from '@/pages/Welcome';

/** Routes a guest must not be on once the organisers stop accepting photos. */
const CAPTURE_ROUTES = ['/name', '/camera', '/finish', '/upload'];

export function App() {
  const { ready } = useSession();

  // Everything reads the session, so wait for IndexedDB rather than flashing
  // an empty flow and then filling it in.
  if (!ready) return null;

  return (
    <>
      <UploadsClosedGuard />
      <ResumePrompt />

      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/name" element={<EnterName />} />
        <Route path="/camera/:n" element={<CameraPage />} />
        <Route path="/camera/:n/review" element={<ShotReview />} />
        <Route path="/finish" element={<Finish />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/done" element={<Done />} />
        <Route path="/me/:id" element={<MyStrip />} />
        <Route path="/closed" element={<Closed />} />
        {/* 404 -> Welcome, per the design. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

function UploadsClosedGuard() {
  const backend = useBackend();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState<boolean | null>(null);

  useEffect(() => backend.watchConfig((c) => setOpen(c?.uploadsOpen ?? null)), [backend]);

  useEffect(() => {
    if (open !== false) return;
    if (CAPTURE_ROUTES.some((route) => pathname.startsWith(route))) {
      navigate('/closed', { replace: true });
    }
  }, [open, pathname, navigate]);

  return null;
}

/**
 * "Tiếp tục bộ đang chụp?" — offered when shots from the last 30 minutes are
 * still on disk. DESIGN-D32 / Claude-Plan.md §12.3.
 */
function ResumePrompt() {
  const { resumable, resume, discard } = useSession();
  const navigate = useNavigate();
  const shots = resumable?.shots.filter(Boolean).length ?? 0;

  return (
    <Dialog
      open={Boolean(resumable)}
      tone="default"
      icon="photoCamera"
      title="Tiếp tục bộ đang chụp?"
      body={`Bạn còn ${shots}/4 tấm từ lần trước. Tiếp tục hay bắt đầu lại từ đầu?`}
      cancelLabel="Bắt đầu lại"
      confirmLabel="Tiếp tục"
      onCancel={() => {
        discard();
        navigate('/', { replace: true });
      }}
      onConfirm={() => {
        const next = resumable?.shots.findIndex((s) => !s) ?? -1;
        resume();
        navigate(next === -1 ? '/finish' : `/camera/${next + 1}`);
      }}
    />
  );
}
