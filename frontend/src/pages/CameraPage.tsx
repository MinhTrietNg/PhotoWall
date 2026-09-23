/**
 * S03 Chụp ảnh — DESIGN-D06 / D08, route "/camera/:n".
 * E01 Camera bị từ chối — DESIGN-D15.
 *
 * E01 is NOT a separate screen. The artboard keeps the whole camera chrome —
 * top bar, tray, viewport box, controls — and swaps only what is inside the
 * viewport, then puts two buttons where the caption and strip card would be.
 * Building it that way also means the file input is never unmounted mid-pick.
 *
 * The only dark screen in the guest flow, so the viewfinder reads as the subject.
 * Must not scroll at 360px: the viewport height is driven by the design's own
 * formula, min(100vw - 32, (100dvh - 420) * 4/3).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Icon, MirrorGlyph, SwitchCameraGlyph } from '@/components/Icon';
import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { ShotTray } from '@/features/capture/ShotTray';
import { setPendingShot } from '@/features/capture/pendingShot';
import { ImageDecodeError, shotFromFile, useCamera } from '@/features/capture/useCamera';
import { PhotoWallFrame } from '@/features/frames/PhotoWallFrame';
import { useFrames } from '@/features/frames/useFrames';
import { useSession } from '@/state/SessionContext';
import { SHOT_COUNT } from '@/types/session';
import styles from './CameraPage.module.css';

const COUNTDOWN_FROM = 3;

function useSlot(): number {
  const { n } = useParams();
  const parsed = Number(n);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= SHOT_COUNT ? parsed : 1;
}

export function CameraPage() {
  const slot = useSlot();
  const navigate = useNavigate();
  const { session } = useSession();
  const { registry } = useFrames();
  const camera = useCamera();

  const [timerOn, setTimerOn] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Mirrors `busy` so grab() can guard against re-entry without taking `busy`
  // as a dependency — a stale closure there would wedge the shutter for good.
  const busyRef = useRef(false);

  const denied = camera.error !== null;
  const isLast = slot === SHOT_COUNT;
  const doneCount = session.shots.filter(Boolean).length;
  const previewFrame =
    registry?.frames.find((f) => f.id === session.selectedFrameId) ?? registry?.frames[0];

  const grab = useCallback(
    async (source: 'camera' | 'gallery', file?: File) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setPickError(null);
      try {
        const shot = file ? await shotFromFile(file) : await camera.capture();
        setFlash(true);
        setPendingShot({ slot, source, ...shot });
        navigate(`/camera/${slot}/review`);
      } catch (error) {
        busyRef.current = false;
        setBusy(false);
        setFlash(false);
        // Never swallow this. A silent failure here leaves a hole in the strip
        // that only surfaces four screens later, when /frame bounces the guest
        // back to the slot they thought they had filled.
        console.error('[photowall] capture failed', error);
        setPickError(
          error instanceof ImageDecodeError
            ? error.message
            : 'Chưa lấy được ảnh. Thử lại hoặc chọn ảnh khác nhé.',
        );
      }
    },
    [camera, navigate, slot],
  );

  // 3s timer: tick down, buzz 10ms per tick, then fire the shutter.
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      setCountdown(null);
      void grab('camera');
      return;
    }
    navigator.vibrate?.(10);
    const id = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(id);
  }, [countdown, grab]);

  function onShutter() {
    if (busy || countdown !== null) return;
    if (timerOn) setCountdown(COUNTDOWN_FROM);
    else void grab('camera');
  }

  const openPicker = () => fileRef.current?.click();

  return (
    <Screen tone="dark">
      <TopBar
        tone="dark"
        title={`Ảnh ${slot} / ${SHOT_COUNT}`}
        backTo={slot === 1 ? '/name' : `/camera/${slot - 1}/review`}
        right={
          <>
            <button
              type="button"
              className={`pill tap-target ${styles.tool} ${
                timerOn ? styles.toolOn : styles.toolOff
              }`}
              aria-pressed={timerOn}
              onClick={() => setTimerOn((v) => !v)}
            >
              <Icon name="timer" size={16} />
              {COUNTDOWN_FROM}s
            </button>
            <button
              type="button"
              className={`pill tap-target ${styles.tool} ${styles.toolIcon} ${
                camera.mirrored ? styles.toolOn : styles.toolOff
              }`}
              aria-pressed={camera.mirrored}
              aria-label="Lật gương"
              onClick={() => camera.setMirrored(!camera.mirrored)}
            >
              <MirrorGlyph size={16} />
            </button>
          </>
        }
      />

      <ShotTray shots={session.shots} current={slot} />

      <div className={styles.viewportWrap}>
        <div className={styles.viewport}>
          {denied ? (
            /* E01 fills the viewport box rather than replacing the screen. */
            <div className={styles.deniedInner}>
              <span className={styles.deniedDisc} aria-hidden="true">
                <Icon name="videocamOff" size={24} />
              </span>
              <p className={`u ${styles.deniedTitle}`}>Chưa bật được camera</p>
              <p className={styles.deniedText}>
                Trình duyệt chưa cho phép truy cập camera. Cho phép lại trong cài đặt trang, hoặc
                chọn {SHOT_COUNT} ảnh có sẵn.
              </p>
            </div>
          ) : (
            <>
              <video
                ref={camera.videoRef}
                className={styles.video}
                style={camera.mirrored ? { transform: 'scaleX(-1)' } : undefined}
                playsInline
                muted
                autoPlay
              />

              {/* Rule of thirds — keeps faces out of the crop zone. */}
              <span className={`${styles.gridLine} ${styles.gridV1}`} aria-hidden="true" />
              <span className={`${styles.gridLine} ${styles.gridV2}`} aria-hidden="true" />
              <span className={`${styles.gridLine} ${styles.gridH1}`} aria-hidden="true" />
              <span className={`${styles.gridLine} ${styles.gridH2}`} aria-hidden="true" />

              <span className={`${styles.corner} ${styles.tl}`} aria-hidden="true" />
              <span className={`${styles.corner} ${styles.tr}`} aria-hidden="true" />
              <span className={`${styles.corner} ${styles.bl}`} aria-hidden="true" />
              <span className={`${styles.corner} ${styles.br}`} aria-hidden="true" />

              <span className={`pill ${styles.slotPill}`}>
                Ô ảnh {slot} / {SHOT_COUNT}
              </span>

              <span className={styles.hint}>
                {isLast ? 'Tấm cuối · đổi dáng nào' : 'Đưa mặt vào giữa khung nhé'}
              </span>

              {countdown !== null ? (
                <div className={styles.countdown} role="status" aria-live="assertive">
                  <span className={`u ${styles.countdownNumber}`}>{countdown}</span>
                </div>
              ) : null}

              {flash ? <span className={styles.flash} aria-hidden="true" /> : null}
            </>
          )}
        </div>
      </div>

      {denied ? (
        <div className={styles.deniedActions}>
          <Button size="m" block iconStart={<Icon name="photoCamera" size={20} />} onClick={camera.retry}>
            Cho phép camera
          </Button>
          <Button
            variant="secondary"
            size="m"
            block
            iconStart={<Icon name="gallery" size={20} />}
            onClick={openPicker}
          >
            Chọn ảnh cho ô {slot}
          </Button>
        </div>
      ) : (
        <>
          <p className={styles.caption}>
            {isLast
              ? 'Tấm cuối — đổi một dáng khác cho dải ảnh sinh động.'
              : slot === 1
                ? `Tấm đầu tiên — cười tươi lên nào.${timerOn ? ' Hẹn giờ 3 s đang bật.' : ''}`
                : `Cười tươi lên nào.${timerOn ? ' Hẹn giờ 3 s đang bật.' : ''}`}
          </p>

          {previewFrame ? (
            <div className={styles.stripCard}>
              <span className={styles.stripThumb}>
                <PhotoWallFrame
                  frame={previewFrame}
                  width={40}
                  photos={session.shots.map((s) => s?.blob ?? null)}
                  showSlotNumbers
                />
              </span>
              <div className={styles.stripText}>
                <span className={`lbl ${styles.stripLabel}`}>
                  Dải ảnh của bạn · {doneCount}/{SHOT_COUNT}
                </span>
                <span className={styles.stripHint}>
                  Gợi ý 4 dáng: <b>cười</b> → <b>nghiêm</b> → <b>bất ngờ</b> → <b>chỉ tay</b>.
                </span>
              </div>
            </div>
          ) : null}
        </>
      )}

      <div className={styles.controls}>
        <div className={styles.control}>
          <IconButton label="Chọn từ thư viện" tone="on-ink" size="l" onClick={openPicker}>
            <Icon name="gallery" />
          </IconButton>
          <span className={styles.controlLabel}>Thư viện</span>
        </div>

        {/* Dimmed rather than removed when denied — the design keeps the row intact. */}
        <div className={`${styles.control} ${denied ? styles.controlDim : ''}`}>
          <button
            type="button"
            className={styles.shutter}
            aria-label="Chụp ảnh"
            disabled={denied || busy || !camera.ready}
            onClick={onShutter}
          >
            <span className={styles.shutterCore} />
          </button>
          <span className={styles.controlLabel}>Chụp ảnh</span>
        </div>

        <div className={`${styles.control} ${denied ? styles.controlDim : ''}`}>
          {camera.canSwitch || denied ? (
            <>
              <IconButton
                label="Đổi camera"
                tone="on-ink"
                size="l"
                disabled={denied}
                onClick={camera.switchCamera}
              >
                <SwitchCameraGlyph />
              </IconButton>
              <span className={styles.controlLabel}>Đổi camera</span>
            </>
          ) : (
            <span className={styles.controlSpacer} aria-hidden="true" />
          )}
        </div>
      </div>

      <p className={styles.footnote}>
        {denied
          ? 'Safari: AA → Cài đặt trang web → Camera → Cho phép'
          : 'Mỗi tấm được xem lại trước khi ghép · ← thoát vẫn giữ ảnh đã chụp.'}
      </p>

      {/*
       * One file input, outside every branch. It used to live inside each of
       * them: when getUserMedia rejected while the native picker was already
       * open, the input was torn out from under the guest and their choice was
       * dropped with no change event.
       */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void grab('gallery', file);
        }}
      />

      {pickError ? (
        <div className={styles.pickError} role="alert">
          <Icon name="warning" size={20} />
          <span>{pickError}</span>
          <button type="button" aria-label="Đóng" onClick={() => setPickError(null)}>
            ✕
          </button>
        </div>
      ) : null}
    </Screen>
  );
}
