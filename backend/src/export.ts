// Pure helpers for M02 "Dữ liệu" — no Firebase here, so they are easy to test and
// the ZIP and the timelapse script agree on file names.
import type { ExportRow } from './client';

// Excel treats a leading = + - @ as a formula; neutralise names that start with one.
function csvCell(value: unknown): string {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const iso = (t: ExportRow['reviewedAt']) => (t ? t.toDate().toISOString() : '');

/** "Xuất danh sách tham gia (.csv)". UTF-8 with BOM so Excel shows Vietnamese correctly. */
export function toParticipantsCsv(rows: ExportRow[]): string {
  const head = ['Khoảnh khắc', 'Tên', 'Hiện tên', 'Khung', 'Gửi lúc', 'Duyệt lúc', 'Người duyệt', 'Mã ảnh'];
  const body = rows.map((r) => [
    r.momentNo ?? '', r.displayName, r.showName ? 'có' : 'không', r.frameVariant,
    iso(r.submittedAt), iso(r.reviewedAt), r.reviewedBy ?? '', r.id,
  ]);
  return `\uFEFF${[head, ...body].map((line) => line.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

/**
 * File name of a strip inside the ZIP, e.g. "0129-minh-triet.jpg". Sorted by name
 * the files are in moment order, which is what scripts/timelapse.ts relies on.
 */
export function stripFileName(row: { id: string; displayName: string; momentNo?: number | null }): string {
  const slug = row.displayName
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'khach';
  const n = row.momentNo != null ? String(row.momentNo).padStart(4, '0') : `x-${row.id.slice(0, 6)}`;
  return `${n}-${slug}.jpg`;
}
