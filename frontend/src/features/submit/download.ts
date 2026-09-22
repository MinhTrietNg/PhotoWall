/**
 * Saving and sharing the strip.
 *
 * The design is explicit: right after sending, use the blob already in memory
 * (URL.createObjectURL + <a download>); only fall back to photoUrl() after a
 * reload. Claude-Plan.md §14.1.
 */
import { track } from '@/lib/analytics';

function fileName(displayName: string): string {
  const slug =
    displayName
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/gi, 'd')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'photowall';
  return `photowall-${slug}.jpg`;
}

export function downloadStrip(blob: Blob, displayName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName(displayName);
  document.body.append(a);
  a.click();
  a.remove();
  // Give the browser a beat to start the download before dropping the URL.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  track('pw_download');
}

export function canShareStrip(blob: Blob, displayName: string): boolean {
  if (typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [new File([blob], fileName(displayName), { type: blob.type })] });
  } catch {
    return false;
  }
}

export async function shareStrip(blob: Blob, displayName: string): Promise<void> {
  const file = new File([blob], fileName(displayName), { type: blob.type });
  await navigator.share({
    files: [file],
    title: 'Photo Wall',
    text: 'Dải ảnh của mình ở Photo Wall!',
  });
}
