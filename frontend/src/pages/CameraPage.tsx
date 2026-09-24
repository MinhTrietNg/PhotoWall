/**
 * S03 Chụp ảnh — DESIGN-D06 / D08, route "/camera/:n".
 * E01 Camera bị từ chối — DESIGN-D15.
 *
 * E01 is NOT a separate screen. The artboard keeps the whole camera chrome —
 * top bar, tray, viewport box, controls — and swaps only what is inside the
 * viewport, "Cho phép camera" included. Building it that way also means the
 * file input is never unmounted mid-pick.
 *
 * The only dark screen in the guest flow, so the viewfinder reads as the subject:
 * nothing but the tray above it and the three controls below. Must not scroll
 * at 360px: the viewport takes the height between the two and derives its
 * width from 4:3.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Icon, MirrorGlyph, SwitchCameraGlyph } from '@/components/Icon';
import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { ShotTray } from '@/features/capture/ShotTray';
import { useCameraPref } from '@/features/capture/cameraPrefs';
import { setPendingShot } from '@/features/capture/pendingShot';
import { ImageDecodeError, shotFromFile, useCamera } from '@/features/capture/useCamera';
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
  const camera = useCamera();

  // Remembered across shots, like the mirror: turned off for shot 1, it stays off.
  const [timerOn, setTimerOn] = useCameraPref('timerOn');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Mirrors `busy` so grab() can guard against re-entry without taking `busy`
  // as a dependency — a stale closure there would wedge the shutter for good.
  const busyRef = useRef(false);

  const denied = camera.error !== null;

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
        // that only surfaces screens later, when /finish bounces the guest
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
        // Out of the camera, home. The shots stay in the session and the name
        // is remembered, so "Bắt đầu chụp ảnh" picks up at the first empty slot.
        backTo="/"
        right={
          <>
            <button
              type="button"
              className={`pill tap-target ${styles.tool} ${
                timerOn ? styles.toolOn : styles.toolOff
              }`}
              aria-pressed={timerOn}
              onClick={() => setTimerOn(!timerOn)}
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
              <p className={styles.deniedText}>Trình duyệt chưa cho phép truy cập camera.</p>
              <Button
                size="m"
                className={styles.deniedAction}
                iconStart={<Icon name="photoCamera" size={20} />}
                onClick={camera.retry}
              >
                Cho phép camera
              </Button>
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

      <div className={styles.controls}>
        <div className={styles.control}>
          <IconButton label="Chọn từ thư viện" tone="on-ink" size="l" onClick={openPicker}>
            <Icon name="gallery" />
          </IconButton>
          <span className={styles.controlLabel}>Thư viện</span>
        </div>

        {/*
         * With no camera the row stays exactly as drawn, and both camera
         * controls ask for permission again — the artboard sends them back to
         * the live camera rather than greying them out.
         */}
        <div className={styles.control}>
          <button
            type="button"
            className={styles.shutter}
            aria-label="Chụp ảnh"
            disabled={busy || (!denied && !camera.ready)}
            onClick={denied ? camera.retry : onShutter}
          >
            <span className={styles.shutterCore} />
          </button>
          <span className={styles.controlLabel}>Chụp ảnh</span>
        </div>

        <div className={styles.control}>
          {camera.canSwitch || denied ? (
            <>
              <IconButton
                label="Đổi camera"
                tone="on-ink"
                size="l"
                onClick={denied ? camera.retry : camera.switchCamera}
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
