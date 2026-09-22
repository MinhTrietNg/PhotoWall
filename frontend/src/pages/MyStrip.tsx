/**
 * S09 Dải ảnh của tôi — DESIGN-D14, route "/me/:id".
 *
 * The largest on-phone rendering of the strip (186px, lifted on a blue shadow)
 * and the only screen where a guest can destroy something — which is why the
 * design makes that the quietest control on the page, a red text button under
 * everything else rather than a filled one.
 *
 * The header is not the shared TopBar: the artboard has a close button and a
 * green status pill, and no centred title.
 */
import { useEffect, useMemo, useState } from 'react';
import { Screen } from '@/components/Screen';
import { Navigate, useParams } from 'react-router-dom';
import { Button, ButtonLink } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { Icon } from '@/components/Icon';
import { IconButton, IconButtonLink } from '@/components/IconButton';
import { StateBlock } from '@/components/StateBlock';
import { PhotoWallFrame } from '@/features/frames/PhotoWallFrame';
import { findFrame } from '@/features/frames/frameRegistry';
import { useFrames } from '@/features/frames/useFrames';
import { canShareStrip, downloadStrip, shareStrip } from '@/features/submit/download';
import { getSubmission } from '@/features/submit/submission';
import { GUEST_SELF_REMOVE_ENABLED } from '@/config';
import { useBackend, type Photo } from '@/lib/backend';
import { useSession } from '@/state/SessionContext';
import styles from './MyStrip.module.css';

const STRIP_WIDTH = 186;

const STATUS_LABEL: Record<Photo['status'], string> = {
  uploading: 'Đang gửi',
  pending: 'Chờ duyệt',
  approved: 'Đang hiển thị',
  // Guests are never told which of the two it was — DESIGN-D21.
  rejected: 'Đã gỡ bởi BTC',
  removed: 'Đã gỡ bởi BTC',
};

export function MyStrip() {
  const { id } = useParams();
  const backend = useBackend();
  const { registry } = useFrames();
  const { session } = useSession();

  const [photo, setPhoto] = useState<Photo | null>(null);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const submission = getSubmission();
  // Still in memory from this session? Then we already have the exact bytes.
  const local = submission?.photoId === id ? submission : null;

  useEffect(() => {
    if (!id) return;
    return backend.watchMyPhotos((list) => setPhoto(list.find((p) => p.id === id) ?? null));
  }, [backend, id]);

  useEffect(() => {
    if (!id || local) return;
    let alive = true;
    backend
      .photoUrl(id)
      .then((url) => alive && setRemoteUrl(url))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [backend, id, local]);

  const shots = useMemo(() => session.shots.map((s) => s?.blob ?? null), [session.shots]);
  const frame = registry
    ? findFrame(registry, local?.frameId ?? photo?.frameVariant ?? null)
    : undefined;

  if (!id) return <Navigate to="/" replace />;

  const gone = photo?.status === 'removed' || photo?.status === 'rejected';
  const removedByMe = photo?.reviewedBy === 'owner';
  const displayName = local?.displayName ?? photo?.displayName ?? session.displayName;
  const canShare = local ? canShareStrip(local.blob, displayName) : false;

  return (
    <Screen tone="dark">
      <header className={styles.header}>
        <IconButtonLink to="/" label="Đóng" tone="on-ink">
          <Icon name="close" />
        </IconButtonLink>
        <span className={`pill pill--lg ${styles.statusPill} ${gone ? styles.statusGone : ''}`}>
          <Icon name={gone ? 'warning' : 'check'} size={16} />
          {gone ? 'Đã gỡ khỏi Wall' : 'Dải ảnh của bạn'}
        </span>
      </header>

      {gone ? (
        <StateBlock
          tone="error"
          title="Dải ảnh đã được gỡ"
          body={
            removedByMe
              ? 'Bạn đã gỡ dải ảnh này khỏi màn hình lớn. Bạn vẫn có thể chụp một bộ mới.'
              : 'Ban tổ chức đã gỡ dải ảnh này khỏi màn hình lớn. Bạn vẫn có thể chụp một bộ mới.'
          }
          action={
            <ButtonLink to="/" block>
              Chụp bộ khác
            </ButtonLink>
          }
        />
      ) : (
        <>
          <div className={styles.body}>
            <div className={styles.strip}>
              {frame ? (
                // Prefer the local shots; after a reload fall back to the stored JPEG.
                local || !remoteUrl ? (
                  <PhotoWallFrame frame={frame} width={STRIP_WIDTH} photos={shots} />
                ) : (
                  <img
                    src={remoteUrl}
                    alt={`Dải ảnh của ${displayName}`}
                    className={styles.remote}
                    style={{ width: STRIP_WIDTH }}
                  />
                )
              ) : null}
            </div>

            <div className={styles.meta}>
              <span className={`u ${styles.name}`}>{displayName}</span>
              <span className={styles.time}>
                {photo
                  ? `${new Date(photo.createdAtMs).toLocaleTimeString('vi-VN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })} · ${STATUS_LABEL[photo.status]}`
                  : 'Đang tải…'}
              </span>
            </div>
          </div>

          {/* Download is the main action; share rides beside it as an icon. */}
          <div className={styles.actions}>
            <Button
              className={styles.download}
              iconStart={<Icon name="download" />}
              disabled={!local && !remoteUrl}
              onClick={() => {
                if (local) downloadStrip(local.blob, displayName);
                else if (remoteUrl) window.open(remoteUrl, '_blank', 'noopener');
              }}
            >
              Tải dải ảnh về
            </Button>
            {canShare && local ? (
              <IconButton
                label="Chia sẻ"
                tone="on-ink"
                size="l"
                onClick={() => void shareStrip(local.blob, displayName).catch(() => undefined)}
              >
                <Icon name="share" />
              </IconButton>
            ) : null}
          </div>

          {GUEST_SELF_REMOVE_ENABLED ? (
            <div className={styles.removeRow}>
              <Button
                variant="text"
                iconStart={<Icon name="delete" />}
                className={styles.remove}
                onClick={() => setConfirmRemove(true)}
              >
                Gỡ dải ảnh của tôi
              </Button>
            </div>
          ) : null}
        </>
      )}

      <Dialog
        open={confirmRemove}
        title="Gỡ dải ảnh của bạn?"
        body="Ảnh sẽ biến mất khỏi màn hình lớn ngay và không khôi phục được."
        confirmLabel="Gỡ dải ảnh"
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          setConfirmRemove(false);
          // watchMyPhotos flips the screen to the "đã gỡ" state once it lands.
          backend.removeMyPhoto(id).catch(() => undefined);
        }}
      />
    </Screen>
  );
}
