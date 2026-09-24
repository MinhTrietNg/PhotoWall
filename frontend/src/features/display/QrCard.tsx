/**
 * pw-qr card + "Đến lượt bạn" — DESIGN-D18 / D03.
 *
 * Encoded in the browser rather than at build time, because the link is an M02
 * setting ("Link trong mã QR") an admin can change during the event. The rules
 * that matter are the design's: dark modules on white, a quiet zone of four
 * modules, nothing drawn over it. Each module is a whole number of pixels so a
 * phone camera across the booth sees hard edges, not antialiased grey.
 *
 * The link carries utm_source=display so pw_start can tell a scan of this
 * screen from any other way in (Claude-Plan.md §20.8).
 */
import { useMemo } from 'react';
import { encode } from 'uqr';
import { Icon } from '@/components/Icon';
import styles from './QrCard.module.css';

/** The widest the code may be inside its white box. */
const QR_MAX_PX = 296;
const QUIET_ZONE = 4;

function withSource(link: string): string {
  try {
    const url = new URL(link);
    if (!url.searchParams.has('utm_source')) url.searchParams.set('utm_source', 'display');
    return url.toString();
  } catch {
    return link;
  }
}

export function QrCard({ url }: { url: string }) {
  const code = useMemo(() => {
    const { data, size } = encode(withSource(url), { ecc: 'M', border: QUIET_ZONE });
    let path = '';
    data.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) path += `M${x} ${y}h1v1h-1z`;
      }),
    );
    return { path, size, px: Math.floor(QR_MAX_PX / size) * size };
  }, [url]);

  return (
    <div className={styles.card}>
      <div className={styles.codeBox}>
        <svg
          width={code.px}
          height={code.px}
          viewBox={`0 0 ${code.size} ${code.size}`}
          shapeRendering="crispEdges"
          role="img"
          aria-label="Mã QR mở Photo Wall trên điện thoại"
        >
          <rect width={code.size} height={code.size} fill="#fff" />
          <path d={code.path} fill="currentColor" />
        </svg>
      </div>
      <div className={styles.text}>
        <p className={`u ${styles.title}`}>Đến lượt bạn</p>
        <p className={styles.hint}>
          <Icon name="qrCodeScanner" size={32} />
          Quét QR để lên Wall
        </p>
      </div>
    </div>
  );
}
