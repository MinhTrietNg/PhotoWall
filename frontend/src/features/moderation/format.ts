/** Time formatting for the moderation table — DESIGN-D21. */

export function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

/** "chờ N phút", turning red past 3 minutes is the caller's job (see ModRow). */
export function formatWaiting(sinceMs: number, nowMs: number): string {
  const minutes = Math.max(0, Math.floor((nowMs - sinceMs) / 60_000));
  if (minutes < 1) return 'vừa gửi';
  if (minutes < 60) return `chờ ${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  return `chờ ${hours} giờ ${minutes % 60} phút`;
}

export const WAITING_OVERDUE_MS = 3 * 60_000;

/** "f03-partners" -> "F03" — the row meta shows the short id, not the full title. */
export function frameShortLabel(frameVariant: string): string {
  return /^f\d+/i.exec(frameVariant)?.[0].toUpperCase() ?? frameVariant;
}
