/**
 * The guest's name, remembered on this phone beyond the capture session.
 *
 * The session in IndexedDB already carries the name, but it is thrown away
 * with the session: "Bắt đầu lại", the 30-minute window running out, cleared
 * site data. A guest who comes back for a second strip should find their name
 * already typed, so it also lives here, on its own.
 *
 * localStorage, so it outlives the tab. Every access is guarded — a private
 * window or blocked site data just means the field starts empty.
 */
const STORAGE_KEY = 'photowall.guest-name';

export function readRememberedName(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function rememberName(name: string) {
  try {
    if (name.trim()) localStorage.setItem(STORAGE_KEY, name);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Not remembered this time; the session still has it.
  }
}
