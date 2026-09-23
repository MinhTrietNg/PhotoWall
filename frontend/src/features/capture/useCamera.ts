/**
 * getUserMedia plumbing for the capture screen: facing mode, mirror, and a
 * single-frame grab. DESIGN-D06 / D08 / D15.
 *
 * Distinguishes "denied" from "unavailable" because the design has a dedicated
 * screen (E01) for the permission case with Safari-specific instructions.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

type CameraFacing = 'user' | 'environment';
type CameraError = 'denied' | 'unavailable' | null;

/**
 * Cap the stored shot's long edge. The widest slot on any frame is 932px, so
 * anything beyond this is memory we pay for and then throw away. Claude-Plan.md §30.
 */
const MAX_SHOT_EDGE = 1600;
const SHOT_QUALITY = 0.92;

interface UseCameraResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  ready: boolean;
  error: CameraError;
  facing: CameraFacing;
  mirrored: boolean;
  /** True when the device exposes more than one video input. */
  canSwitch: boolean;
  setMirrored: (next: boolean) => void;
  switchCamera: () => void;
  retry: () => void;
  /** Grabs the current frame as a JPEG, applying the mirror if it is on. */
  capture: () => Promise<{ blob: Blob; width: number; height: number }>;
}

export function useCamera(): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [facing, setFacing] = useState<CameraFacing>('user');
  // Front camera reads as a mirror to the person holding it, so default on.
  const [mirrored, setMirrored] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<CameraError>(null);
  const [canSwitch, setCanSwitch] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    function stop() {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    async function start() {
      setReady(false);
      setError(null);

      if (!navigator.mediaDevices?.getUserMedia) {
        setError('unavailable');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facing,
            width: { ideal: 1440 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        stop();
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setReady(true);

        // Only offer "Đổi camera" when there is actually another one.
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        if (!cancelled) {
          setCanSwitch(devices.filter((d) => d.kind === 'videoinput').length > 1);
        }
      } catch (e) {
        if (cancelled) return;
        const name = (e as DOMException)?.name;
        setError(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
      }
    }

    void start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [facing, attempt]);

  const capture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) throw new Error('camera chưa sẵn sàng');

    const sw = video.videoWidth;
    const sh = video.videoHeight;
    const scale = Math.min(1, MAX_SHOT_EDGE / Math.max(sw, sh));
    const width = Math.round(sw * scale);
    const height = Math.round(sh * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('trình duyệt không hỗ trợ canvas 2D');

    // What the guest previewed mirrored must be SAVED mirrored, or text and
    // gestures flip in the exported strip. Claude-Plan.md §30.
    if (mirrored) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('không chụp được ảnh'))),
        'image/jpeg',
        SHOT_QUALITY,
      );
    });

    return { blob, width, height };
  }, [mirrored]);

  return {
    videoRef,
    ready,
    error,
    facing,
    mirrored,
    canSwitch,
    setMirrored,
    switchCamera: () => setFacing((f) => (f === 'user' ? 'environment' : 'user')),
    retry: () => setAttempt((n) => n + 1),
    capture,
  };
}

/**
 * A gallery pick the browser could not turn into pixels. Carries a message the
 * guest can act on, because the capture screen shows it verbatim.
 */
export class ImageDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageDecodeError';
  }
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

function loadViaImgElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('img decode failed'));
    img.src = url;
  });
}

/**
 * Decodes a picked file, trying every path the browser might support.
 *
 * createImageBitmap is preferred because it is the only one that lets us ask
 * for EXIF orientation explicitly. But it is not enough on its own:
 *   - Safari < 16 throws on the options bag, so retry without it.
 *   - Chrome cannot decode HEIC at all, which is what an iPhone hands over by
 *     default, so fall back to <img>, which delegates to the platform decoder.
 * <img> applies EXIF orientation by default (`image-orientation: from-image` is
 * the CSS initial value), so the fallback is not a downgrade in correctness.
 */
async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    for (const options of [{ imageOrientation: 'from-image' } as const, undefined]) {
      try {
        const bitmap = await createImageBitmap(file, options);
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          release: () => bitmap.close(),
        };
      } catch {
        // Try the next strategy.
      }
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await loadViaImgElement(url);
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    const kind = file.type || file.name.split('.').pop() || 'không rõ';
    throw new ImageDecodeError(
      `Không đọc được ảnh này (${kind}). Máy ảnh iPhone hay lưu dạng HEIC — ` +
        'đổi sang "Tương thích nhất" trong Cài đặt → Camera, hoặc chọn ảnh khác.',
    );
  }
}

/**
 * Decodes a gallery pick, honouring EXIF orientation and capping the long edge.
 * The design treats the gallery as a first-class path, not a fallback.
 */
export async function shotFromFile(
  file: File,
): Promise<{ blob: Blob; width: number; height: number }> {
  const decoded = await decodeImage(file);
  try {
    if (!decoded.width || !decoded.height) {
      throw new ImageDecodeError('Ảnh này rỗng hoặc hỏng. Chọn ảnh khác nhé.');
    }

    const scale = Math.min(1, MAX_SHOT_EDGE / Math.max(decoded.width, decoded.height));
    const width = Math.round(decoded.width * scale);
    const height = Math.round(decoded.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new ImageDecodeError('Trình duyệt này không hỗ trợ canvas 2D.');
    ctx.drawImage(decoded.source, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new ImageDecodeError('Không nén được ảnh này.'))),
        'image/jpeg',
        SHOT_QUALITY,
      );
    });
    return { blob, width, height };
  } finally {
    decoded.release();
  }
}
