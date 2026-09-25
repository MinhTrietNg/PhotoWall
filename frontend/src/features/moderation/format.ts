/** Text formatting for the moderation table — DESIGN-D21. */
import { AUTO_REVIEWER, LIKELIHOODS, SAFESEARCH_CATEGORIES } from '@backend/schema';
import type { ModeratorAccount, Photo, SafeSearchResult } from '@/lib/backend';

/**
 * "SafeSearch: violence · LIKELY" — the design's reason chip, for the category
 * rated highest, or null when nothing reached POSSIBLE. UNKNOWN counts: the
 * function sends those to a person too.
 */
export function safeSearchFlag(result: SafeSearchResult | undefined): string | null {
  if (!result) return null;
  const rank = (c: (typeof SAFESEARCH_CATEGORIES)[number]) =>
    result[c] === 'UNKNOWN' ? Infinity : LIKELIHOODS.indexOf(result[c]);
  const top = [...SAFESEARCH_CATEGORIES].sort((a, b) => rank(b) - rank(a))[0];
  return rank(top) >= LIKELIHOODS.indexOf('POSSIBLE') ? `SafeSearch: ${top} · ${result[top]}` : null;
}

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

/** "f03-isf" -> "F03" — the row meta shows the short id, not the full title. */
export function frameShortLabel(frameVariant: string): string {
  return /^f\d+/i.exec(frameVariant)?.[0].toUpperCase() ?? frameVariant;
}

/**
 * "#131 · khung F03 · phiên a3f9…131". The number is the photo's "Khoảnh khắc"
 * once it has one; before its first approval there is no number yet, so the
 * row falls back to the end of the document id — the same thing the search
 * box matches on.
 */
export function rowMeta(photo: Photo): string {
  const uid = photo.ownerUid;
  const session = uid.length > 8 ? `${uid.slice(0, 4)}…${uid.slice(-3)}` : uid;
  return `#${photoNumber(photo)} · khung ${frameShortLabel(photo.frameVariant)} · phiên ${session}`;
}

export function photoNumber(photo: Photo): string {
  return photo.momentNo != null ? String(photo.momentNo) : photo.id.slice(-4);
}

/** "Lan" for lan@gdgoc.dev when the allowlist knows her, else the email's local part. */
export function reviewerName(email: string | undefined, moderators: readonly ModeratorAccount[]): string {
  if (!email) return 'BTC';
  if (email === AUTO_REVIEWER) return 'Tự động';
  const account = moderators.find((m) => m.email === email);
  return account?.name?.split(' ')[0] ?? email.split('@')[0];
}

/** "còn 23 h" / "còn 34 m" until a removed strip is deleted for good. */
export function formatRetention(removedAtMs: number, retentionHours: number, nowMs: number): string {
  const left = removedAtMs + retentionHours * 3_600_000 - nowMs;
  if (left <= 0) return 'đã xoá hẳn';
  const hours = Math.floor(left / 3_600_000);
  return hours >= 1 ? `còn ${hours} h` : `còn ${Math.max(1, Math.floor(left / 60_000))} m`;
}
