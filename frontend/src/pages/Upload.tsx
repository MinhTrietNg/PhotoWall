/**
 * S07 Đang gửi — DESIGN-D11, route "/upload".
 * E02 Gửi lỗi — DESIGN-D16, rendered in place when the upload fails.
 * E03 is reached by redirect when the backend reports `uploads-closed`.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Progress } from '@/components/Progress';
import { StateBlock } from '@/components/StateBlock';
import { Steps } from '@/components/Steps';
import { TopBar } from '@/components/TopBar';
import { PhotoWallFrame } from '@/features/frames/PhotoWallFrame';
import { findFrame } from '@/features/frames/frameRegistry';
import { useFrames } from '@/features/frames/useFrames';
import { useUpload } from '@/features/submit/useUpload';
import { useSession } from '@/state/SessionContext';
import { isSessionComplete } from '@/types/session';
import styles from './Upload.module.css';

export function Upload() {
  const navigate = useNavigate();
  const { session } = useSession();
  const { registry } = useFrames();
  const { state, start, retry } = useUpload();
  const started = useRef(false);

  const frame = registry ? findFrame(registry, session.selectedFrameId) : undefined;
  const photos = useMemo(() => session.shots.map((s) => s?.blob ?? null), [session.shots]);
  const complete = isSessionComplete(session);

  useEffect(() => {
    if (started.current || !complete || !frame) return;
    started.current = true;
    const shots = session.shots.filter((s): s is NonNullable<typeof s> => Boolean(s));
    void start(
      shots.map((s) => s.blob),
      frame,
      session.displayName,
    );
  }, [complete, frame, session.shots, session.displayName, start]);

  useEffect(() => {
    if (state.phase === 'done' && state.photoId) navigate('/done', { replace: true });
    if (state.errorCode === 'uploads-closed') navigate('/closed', { replace: true });
  }, [state.phase, state.photoId, state.errorCode, navigate]);

  if (!complete) return <Navigate to="/camera/1" replace />;

  if (state.phase === 'failed') return <UploadFailed state={state} onRetry={retry} />;

  return (
    <div className="screen">
      <TopBar title="Bước 3 / 3" />
      <Steps current={3} />

      <div className={styles.body}>
        <div className={styles.loaderRow}>
          <div className={`card ${styles.loaderCard}`} aria-hidden="true">
            <span style={{ background: 'var(--pw-blue-500)' }} />
            <span style={{ background: 'var(--pw-red-500)' }} />
            <span style={{ background: 'var(--pw-yellow-500)' }} />
            <span style={{ background: 'var(--pw-green-500)' }} />
          </div>
          {frame ? (
            <span className={styles.miniStrip}>
              <PhotoWallFrame frame={frame} width={40} photos={photos} />
            </span>
          ) : null}
        </div>

        <h1 className={`u ${styles.title}`}>
          Đang gửi lên
          <br />
          Photo Wall…
        </h1>
        <p className={styles.sub}>Vài giây thôi. Đừng đóng trang nhé.</p>

        <Progress
          value={state.phase === 'composing' ? null : state.progress}
          label={state.phase === 'composing' ? 'Đang ghép 4 ảnh…' : 'Ghép 4 ảnh xong · đang gửi'}
        />
      </div>

      <div className="screen__cta">
        <Button variant="text" block onClick={() => navigate('/review')}>
          Huỷ
        </Button>
      </div>
    </div>
  );
}

/** E02 — DESIGN-D16. The blob is still in memory; retry resumes, never resubmits. */
function UploadFailed({
  state,
  onRetry,
}: {
  state: ReturnType<typeof useUpload>['state'];
  onRetry: () => void;
}) {
  const navigate = useNavigate();

  const copy =
    state.errorCode === 'rate-limited'
      ? {
          title: 'Chờ một chút nhé',
          body: `Bạn vừa gửi một dải ảnh. Chờ ${state.retryAfterSeconds ?? 60} giây nữa để gửi tiếp.`,
        }
      : state.errorCode === 'quota-exceeded'
        ? { title: 'Bạn đã gửi đủ số ảnh', body: 'Cảm ơn bạn đã tham gia Photo Wall!' }
        : state.errorCode === 'invalid-input'
          ? {
              title: 'Ảnh chưa hợp lệ',
              body: 'Có lỗi khi ghép ảnh. Thử chụp lại dải ảnh giúp mình nhé.',
            }
          : {
              title: 'Gửi ảnh chưa thành công',
              body: 'Mạng hơi chập chờn. 4 ảnh của bạn vẫn còn đây, chỉ cần gửi lại thôi.',
            };

  const canResume = state.errorCode === 'upload-failed' && Boolean(state.photoId);

  return (
    <div className="screen">
      <TopBar title="Bước 3 / 3" backTo="/review" />
      <Steps current={3} />

      <StateBlock
        tone="error"
        icon={state.errorCode === 'rate-limited' ? 'hourglass' : 'wifiOff'}
        title={copy.title}
        body={copy.body}
      />

      <div className="screen__cta">
        {canResume ? (
          <Button block onClick={onRetry}>
            Gửi lại
          </Button>
        ) : null}
        <Button variant="secondary" block onClick={() => navigate('/review')}>
          Xem lại dải ảnh
        </Button>
      </div>
    </div>
  );
}
