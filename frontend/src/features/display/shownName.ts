import type { Photo } from '@/lib/backend';

/** What S02 promises a guest who switched "Hiện tên trên màn hình lớn" off. */
const ANONYMOUS = 'Tân sinh viên';

/**
 * The name the big screen may show for a strip. docs/frontend-integration.md
 * §4: "Tân sinh viên" when the guest turned it off on S02, or the admin turned
 * names off for the whole event on M02.
 */
export function shownName(photo: Photo, showNames: boolean): string {
  return showNames && photo.showName !== false ? photo.displayName : ANONYMOUS;
}
