/**
 * The guest capture session — name, consent, four shots, chosen frame.
 *
 * Persisted to IndexedDB so leaving the flow does not lose shots. On return
 * within 30 minutes the app offers "Tiếp tục bộ đang chụp?"; anything older is
 * discarded. Claude-Plan.md §12.
 *
 * Deliberately NOT a state-management library — one context is enough here.
 */
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { idbDelete, idbGet, idbSet } from '@/lib/idb';
import {
  RESUME_WINDOW_MS,
  SHOT_COUNT,
  emptySession,
  type CaptureSession,
  type Shot,
} from '@/types/session';

const STORAGE_KEY = 'capture-session';

interface SessionContextValue {
  session: CaptureSession;
  /** False until IndexedDB has been consulted — screens wait on this. */
  ready: boolean;
  /**
   * A session from a previous visit is on disk and still inside the 30-minute
   * window. Show the resume prompt; call resume() or discard().
   */
  resumable: CaptureSession | null;
  resume: () => void;
  discard: () => void;

  setName: (name: string) => void;
  setShowName: (show: boolean) => void;
  setConsent: (given: boolean) => void;
  /** slot is 1-based. Passing null clears it. */
  setShot: (slot: number, shot: Shot | null) => void;
  clearShots: () => void;
  selectFrame: (id: string) => void;
  /** After a successful submit, or "Chụp bộ khác". Keeps the name. */
  resetKeepingName: () => void;
}

const Ctx = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<CaptureSession>(emptySession);
  const [ready, setReady] = useState(false);
  const [resumable, setResumable] = useState<CaptureSession | null>(null);
  // Skip the very first persist so we never write back what we just read.
  const hydrated = useRef(false);

  useEffect(() => {
    let alive = true;
    idbGet<CaptureSession>(STORAGE_KEY).then((stored) => {
      if (!alive) return;
      const hasShots = stored?.shots?.some(Boolean) ?? false;
      const fresh = stored ? Date.now() - stored.startedAt < RESUME_WINDOW_MS : false;

      if (stored && hasShots && fresh) {
        // Offer it rather than applying it — the design asks first.
        setResumable(stored);
      } else if (stored && !fresh) {
        void idbDelete(STORAGE_KEY);
      } else if (stored) {
        // No shots yet, but the name/consent are worth keeping.
        setSession(stored);
      }
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    void idbSet(STORAGE_KEY, session);
  }, [session, ready]);

  const update = useCallback((patch: Partial<CaptureSession>) => {
    setSession((prev) => ({ ...prev, ...patch }));
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      ready,
      resumable,

      resume: () => {
        if (resumable) setSession(resumable);
        setResumable(null);
      },

      discard: () => {
        setResumable(null);
        setSession(emptySession());
        void idbDelete(STORAGE_KEY);
      },

      setName: (displayName) => update({ displayName }),
      setShowName: (showName) => update({ showName }),
      setConsent: (consentGiven) => update({ consentGiven }),

      setShot: (slot, shot) =>
        setSession((prev) => {
          const shots = [...prev.shots];
          const previous = shots[slot - 1];
          shots[slot - 1] = shot
            ? // Retakes carry over so analytics can report them.
              { ...shot, retakes: previous ? previous.retakes + 1 : 0 }
            : null;
          return { ...prev, shots };
        }),

      clearShots: () =>
        setSession((prev) => ({
          ...prev,
          shots: Array.from({ length: SHOT_COUNT }, () => null),
          startedAt: Date.now(),
        })),

      selectFrame: (selectedFrameId) => update({ selectedFrameId }),

      resetKeepingName: () =>
        setSession((prev) => ({
          ...emptySession(),
          displayName: prev.displayName,
          showName: prev.showName,
          consentGiven: prev.consentGiven,
        })),
    }),
    [session, ready, resumable, update],
  );

  return <Ctx value={value}>{children}</Ctx>;
}

export function useSession(): SessionContextValue {
  const value = use(Ctx);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}
