/**
 * pw-partner-logos — the big-screen footer row. DESIGN-D18, Claude-Plan.md §8.
 *
 * The single place the logo row's rules live:
 *  - the fixed order, which is also the order inside frame F03, and is NOT the
 *    text order PartnerLine uses on S01 / E03;
 *  - the two "×" after the fourth and the fifth logo, grouping the row as
 *    [Đoàn hội Khoa CNTT] × [GDGoC] × [AWS];
 *  - the two measured exceptions: GDGoC's 2.07:1 mark gets 15.2px of inset to
 *    look the same size, and the AWS badge is a square poster cropped into the
 *    circle on its own blue, not a transparent mark.
 * The PNGs are the organisers' own. Never redraw, recolour or stretch them.
 */
import styles from './PartnerLogos.module.css';

interface Logo {
  src: string;
  name: string;
  variant?: 'wide' | 'poster';
  /** A "×" follows this logo. */
  cross?: boolean;
}

const LOGOS: readonly Logo[] = [
  { src: '/logos/logo-doan.png', name: 'Đoàn TNCS Hồ Chí Minh' },
  { src: '/logos/logo-sgu.png', name: 'Trường Đại học Sài Gòn' },
  { src: '/logos/logo-hsv.png', name: 'Hội Sinh viên Việt Nam' },
  { src: '/logos/logo-isf-cntt.png', name: 'Khoa CNTT — ISF, SGU', cross: true },
  { src: '/logos/logo-gdgoc-brackets.png', name: 'GDGoC on Campus · SGU', variant: 'wide', cross: true },
  { src: '/logos/badge-aws.png', name: 'AWS Student Builder Groups', variant: 'poster' },
];

export function PartnerLogos() {
  return (
    <ul className={styles.row} aria-label="Đơn vị đồng hành">
      {LOGOS.map((logo) => (
        <li key={logo.src} className={styles.item}>
          <span className={[styles.disc, logo.variant ? styles[logo.variant] : null].filter(Boolean).join(' ')}>
            <img src={logo.src} alt={logo.name} draggable={false} />
          </span>
          {logo.cross ? (
            <span className={`u ${styles.cross}`} aria-hidden="true">
              ×
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
