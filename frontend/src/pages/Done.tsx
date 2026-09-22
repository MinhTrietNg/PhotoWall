/**
 * S08 Thành công / S08b Đã nhận, đang duyệt — DESIGN-D12 / D13, route "/done".
 *
 * One route, two states, chosen by the photo's live moderation status. With no
 * auto-approval service in the backend, S08b is the NORMAL first state and the
 * screen upgrades to S08 in place when a moderator approves. Claude-Plan.md §20.5 #3.
 */
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button, ButtonLink } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { PhotoWallFrame } from '@/features/frames/PhotoWallFrame';
import { findFrame } from '@/features/frames/frameRegistry';
import { useFrames } from '@/features/frames/useFrames';
import { canShareStrip, downloadStrip, shareStrip } from '@/features/submit/download';
import { getSubmission } from '@/features/submit/submission';
import { useBackend, type PhotoStatus } from '@/lib/backend';
import { useSession } from '@/state/SessionContext';
import styles from './Done.module.css';

export function Done() {
  const navigate = useNavigate();
  const backend = useBackend();
  const { registry } = useFrames();
  const { session, resetKeepingName } = useSession();

  const submission = getSubmission();
  const [status, setStatus] = useState<PhotoStatus>('pending');
  const [momentNo, setMomentNo] = useState<number | null>(null);

  const photos = useMemo(() => session.shots.map((s) => s?.blob ?? null), [session.shots]);
  const frame = registry ? findFrame(registry, submission?.frameId ?? null) : undefined;

  useEffect(() => {
    if (!submission?.photoId) return;
    return backend.watchMyPhotos((list) => {
      const mine = list.find((p) => p.id === submission.photoId);
      if (mine) {
        setStatus(mine.status);
        setMomentNo(mine.momentNo ?? null);
      }
    });
  }, [backend, submission?.photoId]);

  if (!submission) return <Navigate to="/" replace />;

  const approved = status === 'approved';
  const name = submission.displayName;
  const canShare = canShareStrip(submission.blob, name);

  return (
    <div className="screen">
      <div className={styles.body}>
        <div className={styles.cardWrap}>
          <div className={`card ${styles.card}`}>
            {frame ? (
              <PhotoWallFrame frame={frame} width={approved ? 90 : 84} photos={photos} />
            ) : null}
            <div className={styles.cardMeta}>
              <span className={styles.cardName}>{name}</span>
              <span className={styles.cardTime}>
                {new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <span
              className={`${styles.disc} ${approved ? styles.discOk : ''}`}
              aria-hidden="true"
            >
              <Icon name={approved ? 'check' : 'hourglass'} size={24} />
            </span>
          </div>
          {approved ? <Confetti /> : null}
        </div>

        <h1 className={`u ${styles.title}`}>
          {approved ? 'Bạn đã lên Wall!' : 'Đã nhận, đang duyệt'}
        </h1>

        <p className={styles.text}>
          {approved ? (
            <>
              Dải ảnh của <b>{name}</b> đang trượt trên màn hình lớn tại gian hàng.
            </>
          ) : (
            <>
              Ban tổ chức xem nhanh trước khi lên màn hình lớn, thường dưới 1 phút. Dải ảnh của{' '}
              <b>{name}</b> sẽ tự xuất hiện trên đó, không cần làm gì thêm.
            </>
          )}
        </p>

        {approved ? (
          momentNo !== null ? (
            <span className="pill">Khoảnh khắc thứ {momentNo}</span>
          ) : null
        ) : (
          <span className={`pill ${styles.pendingPill}`}>Đang chờ ban tổ chức duyệt</span>
        )}
      </div>

      <div className="screen__cta">
        <Button block onClick={() => downloadStrip(submission.blob, name)}>
          Tải dải ảnh về
        </Button>
        <Button
          variant="secondary"
          block
          onClick={() => {
            resetKeepingName();
            navigate('/');
          }}
        >
          Chụp bộ khác
        </Button>
        <div className={styles.textActions}>
          {approved && canShare ? (
            <Button
              variant="text"
              iconStart={<Icon name="share" size={20} />}
              onClick={() => void shareStrip(submission.blob, name).catch(() => undefined)}
            >
              Chia sẻ
            </Button>
          ) : null}
          {submission.photoId ? (
            <ButtonLink variant="text" to={`/me/${submission.photoId}`}>
              Dải ảnh của tôi
            </ButtonLink>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Seven pieces, once, never looping — DESIGN-D12. */
function Confetti() {
  const pieces = [
    { left: '4%', top: '6%', bg: 'var(--pw-red-500)', r: '4px', rot: 20 },
    { left: '88%', top: '2%', bg: 'var(--pw-blue-500)', r: '50%', rot: 0 },
    { left: '94%', top: '38%', bg: 'var(--pw-green-500)', r: '4px', rot: -15 },
    { left: '0%', top: '44%', bg: 'var(--pw-yellow-500)', r: '50%', rot: 0 },
    { left: '90%', top: '74%', bg: 'var(--pw-red-500)', r: '4px', rot: 35 },
    { left: '2%', top: '80%', bg: 'var(--pw-blue-500)', r: '50%', rot: 0 },
    { left: '80%', top: '96%', bg: 'var(--pw-green-500)', r: '3px', rot: 10 },
  ];
  return (
    <div className={styles.confetti} aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            left: p.left,
            top: p.top,
            background: p.bg,
            borderRadius: p.r,
            transform: `rotate(${p.rot}deg)`,
            animationDelay: `${i * 40}ms`,
          }}
        />
      ))}
    </div>
  );
}
