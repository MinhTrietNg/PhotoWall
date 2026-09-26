/**
 * S07 Thành công / S07b Đã nhận, đang duyệt — route "/done".
 *
 * One route, two states, chosen by the photo's live moderation status. With no
 * auto-approval service in the backend, S07b is the NORMAL first state and the
 * screen upgrades to S07 in place when a moderator approves. Claude-Plan.md §20.5 #3.
 *
 * Both states are a full-bleed colour band — green when approved, yellow while
 * waiting — with the strip tilted inside it, then centred copy, then the CTA
 * stack. The band is what makes the outcome readable before any text is.
 *
 * This is also the only place a guest can take their strip back: there is no
 * "my strip" screen and no stored session, so download, share and "Gỡ dải ảnh
 * này" all live here.
 */
import { useEffect, useMemo, useState } from 'react';
import { Screen } from '@/components/Screen';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { Icon } from '@/components/Icon';
import { IconButtonLink } from '@/components/IconButton';
import { PhotoWallFrame } from '@/features/frames/PhotoWallFrame';
import { findFrame } from '@/features/frames/frameRegistry';
import { useFrames } from '@/features/frames/useFrames';
import { canShareStrip, downloadStrip, shareStrip } from '@/features/submit/download';
import { getSubmission } from '@/features/submit/submission';
import { GUEST_SELF_REMOVE_ENABLED } from '@/config';
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
  const [confirmRemove, setConfirmRemove] = useState(false);

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
  // Taken down by a moderator (or SafeSearch kept it back and it was rejected):
  // say so, or the guest waits on the hourglass and comes to the booth to ask.
  const declined = status === 'rejected' || status === 'removed';
  const name = submission.displayName;
  const canShare = canShareStrip(submission.blob, name);
  const photoId = submission.photoId;
  const canRemove = GUEST_SELF_REMOVE_ENABLED && Boolean(photoId);

  return (
    <Screen>
      <div className={`${styles.band} ${approved ? styles.bandOk : styles.bandWait}`}>
        {approved ? <Confetti /> : null}

        <span className={styles.close}>
          <IconButtonLink to="/" label="Đóng" className={styles.closeBtn}>
            <Icon name="close" />
          </IconButtonLink>
        </span>

        <div className={`${styles.tilt} ${approved ? '' : styles.tiltWait}`}>
          <span className={styles.strip}>
            {frame ? <PhotoWallFrame frame={frame} width="fit" photos={photos} /> : null}
          </span>
          <span className={`${styles.disc} ${approved ? styles.discOk : ''}`} aria-hidden="true">
            <Icon name={approved ? 'check' : 'hourglass'} size={32} />
          </span>
        </div>
      </div>

      <div className={styles.copy}>
        <h1 className={`u ${styles.title} ${approved ? styles.titleOk : ''}`}>
          {approved ? 'Bạn đã lên Wall!' : declined ? 'Dải ảnh này không lên Wall' : 'Đã nhận, đang duyệt'}
        </h1>

        <p className={styles.text}>
          {approved ? (
            <>
              Dải ảnh của <b>bạn</b> đang trượt trên màn hình lớn tại gian hàng.
            </>
          ) : declined ? (
            'Ban tổ chức đã không đưa dải ảnh này lên màn hình lớn. Bạn vẫn tải về được, hoặc chụp bộ khác nhé.'
          ) : (
            'Bạn hãy chờ trong giây lát, ban tổ chức đang duyệt ảnh của bạn.'
          )}
        </p>

        {approved ? (
          momentNo !== null ? (
            <span className={`pill pill--lg ${styles.statusPill} ${styles.statusOk}`}>
              <Icon name="checkCircle" size={16} />
              Khoảnh khắc thứ {momentNo}
            </span>
          ) : null
        ) : (
          <span className={`pill pill--lg ${styles.statusPill} ${styles.statusWait}`}>
            <Icon name="hourglass" size={16} />
            Đang chờ ban tổ chức duyệt
          </span>
        )}
      </div>

      <div className="screen__cta">
        <Button
          block
          iconStart={<Icon name="download" />}
          onClick={() => downloadStrip(submission.blob, name)}
        >
          Tải dải ảnh về
        </Button>
        <Button
          variant="secondary"
          block
          iconStart={<Icon name="photoCamera" />}
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
              iconStart={<Icon name="shareIos" />}
              onClick={() => void shareStrip(submission.blob, name).catch(() => undefined)}
            >
              Chia sẻ
            </Button>
          ) : null}
          {canRemove ? (
            <Button
              variant="text"
              dangerText
              iconStart={<Icon name="delete" />}
              onClick={() => setConfirmRemove(true)}
            >
              Gỡ dải ảnh này
            </Button>
          ) : null}
        </div>
      </div>

      <Dialog
        open={confirmRemove}
        title="Gỡ dải ảnh của bạn?"
        body="Ảnh sẽ biến mất khỏi màn hình lớn ngay và không khôi phục được."
        confirmLabel="Gỡ dải ảnh"
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          setConfirmRemove(false);
          if (!photoId) return;
          // Home only once the backend has it: a failed removal must not look
          // like one, and the strip is still on this screen to try again.
          backend
            .removeMyPhoto(photoId)
            .then(() => {
              resetKeepingName();
              navigate('/', { replace: true });
            })
            .catch(() => undefined);
        }}
      />
    </Screen>
  );
}

/**
 * Seven pieces, scattered across the band, fired once — never looping.
 *
 * Both axes are a share of the band, not the artboard's pixels: the band
 * shrinks on short phones, and px offsets put the lower pieces outside it,
 * where the band's own clip swallowed them. The fractions are the artboard's
 * values over 390 wide and 330 tall.
 */
const CONFETTI = [
  { left: '6.2%', top: '7.9%', size: 18, radius: '4px', color: 'var(--pw-yellow-500)', rot: 20 },
  { left: '76.9%', top: '5.5%', size: 14, radius: '50%', color: 'var(--pw-red-500)', rot: 0 },
  { left: '84.6%', top: '36.4%', size: 20, radius: '4px', color: 'var(--pw-blue-500)', rot: -15 },
  { left: '10.3%', top: '45.5%', size: 12, radius: '50%', color: 'var(--pw-green-500)', rot: 0 },
  { left: '69.2%', top: '60.6%', size: 16, radius: '4px', color: 'var(--pw-yellow-500)', rot: 35 },
  { left: '15.4%', top: '66.7%', size: 22, radius: '50%', color: 'var(--pw-blue-500)', rot: 0 },
  { left: '79.5%', top: '18.2%', size: 10, radius: '4px', color: 'var(--pw-green-500)', rot: 10 },
];

function Confetti() {
  return (
    <div className={styles.confetti} aria-hidden="true">
      {CONFETTI.map((p, i) => (
        <span
          key={i}
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            background: p.color,
            borderRadius: p.radius,
            transform: `rotate(${p.rot}deg)`,
            animationDelay: `${i * 40}ms`,
          }}
        />
      ))}
    </div>
  );
}
