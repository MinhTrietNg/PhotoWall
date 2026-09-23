/**
 * GA4 events. Names and parameters are fixed by the design —
 * Claude/Claude-Plan.md §20.8. Do not rename or add without updating that table.
 *
 * GA4 itself is not wired up yet; until it is, events go to the console in dev
 * and are dropped in production. Swap `send` for gtag/firebase-analytics later.
 */

type AnalyticsEvent =
  | { name: 'pw_start'; params: { utm_source: 'display' | 'qr' | 'direct' } }
  | { name: 'pw_name_done'; params?: undefined }
  | {
      name: 'pw_capture';
      params: { index: number; source: 'camera' | 'gallery'; retakes: number };
    }
  | { name: 'pw_frame_select'; params: { variant: string } }
  | { name: 'pw_upload_ok'; params: { ms: number; bytes: number } }
  | { name: 'pw_upload_fail'; params: { reason: string } }
  | { name: 'pw_download'; params?: undefined };

export function track<E extends AnalyticsEvent>(name: E['name'], params?: E['params']): void {
  if (import.meta.env.DEV) {
    console.debug('[analytics]', name, params ?? {});
  }
}
