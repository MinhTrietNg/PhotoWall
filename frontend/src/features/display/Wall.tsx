/**
 * The marquee viewport and everything that happens inside it — DESIGN-D18 / D19.
 *
 * Owns the approved-photo feed, the conveyor (see conveyor.ts for why it is not
 * a CSS loop), and the arrival sequence: dim the viewport, raise the yellow
 * card, hold 5 s, then fly the strip to the head of the track where it becomes
 * a MỚI tile. The tape never stops for any of it.
 *
 * With prefers-reduced-motion the conveyor gives way to the slideshow the
 * design asks for instead: one page every 8 s, 150 ms fades, no fly.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Icon } from '@/components/Icon';
import { useDisplayBackend, type DisplayConfig, type Photo } from '@/lib/backend';
import { ArrivalCard, type CardPhase } from './ArrivalCard';
import { ArrivalQueue, itemPhotos, type ArrivalItem } from './arrivalQueue';
import { Conveyor, NEW_TAG_MS, Playlist, TILE_H, TILE_W } from './conveyor';
import { StripTile } from './StripTile';
import { keepStrips, useStripSrc } from './stripSrc';
import styles from './Wall.module.css';

/** Claude-Plan.md P9.7: the newest 80 approved strips, a bounded DOM for 8 hours. */
const WALL_MAX = 80;
/**
 * "Tốc độ trượt" left empty. D29 and D30 both write the pace down as ~40 px/s;
 * the "70 s per loop" beside it is that pace over the fourteen tiles the
 * artboard draws, and would race on a wall of eighty.
 */
const DEFAULT_PX_PER_SEC = 40;
const RISE_MS = 700;
const HOLD_MS = 5000;
const FLY_MS = 600;
const FADE_MS = 150;
const PAGE_MS = 8000;
/** `.pw-track { top: 8px }`. */
const TRACK_TOP = 8;

interface Card {
  id: number;
  item: ArrivalItem;
  phase: CardPhase;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Flight {
  photo: Photo;
  from: Box;
  to: Box;
}

/** The strip in the air between the card and its tile. */
function Flyer({ flight }: { flight: Flight }) {
  const ref = useRef<HTMLDivElement>(null);
  const src = useStripSrc(useDisplayBackend(), flight.photo.id);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { from, to } = flight;
    const sx = to.w / from.w;
    const sy = to.h / from.h;
    const cx = to.x + to.w / 2 - from.w / 2;
    const cy = to.y + to.h / 2 - from.h / 2;
    // Border and radius are counter-scaled so the strip lands wearing the
    // tile's 3px border and 20px corners, not a stretched copy of the card's.
    el.animate(
      [
        {
          transform: `translate(${from.x}px, ${from.y}px) rotate(-3deg)`,
          borderWidth: '4px',
          borderRadius: '16px',
          boxShadow: '4px 4px 0 0',
        },
        {
          transform: `translate(${cx}px, ${cy}px) scale(${sx}, ${sy})`,
          borderWidth: `${3 / sx}px`,
          borderRadius: `${20 / sx}px`,
          boxShadow: '0 0 0 0',
        },
      ],
      // D29: "600 ms bay emphasized-decel".
      { duration: FLY_MS, easing: 'cubic-bezier(0.05, 0.7, 0.1, 1)', fill: 'forwards' },
    );
  }, [flight]);

  return (
    <div
      ref={ref}
      className={`${styles.flyer} ${src ? '' : styles.flyerLoading}`}
      style={{ width: flight.from.w, height: flight.from.h } as CSSProperties}
    >
      {src ? <img src={src} alt="" draggable={false} /> : null}
    </div>
  );
}

/** Where `el` sits inside `root`, in stage px, ignoring transforms. */
function boxWithin(el: HTMLElement, root: HTMLElement): Box {
  let x = 0;
  let y = 0;
  for (let node: HTMLElement | null = el; node && node !== root; node = node.offsetParent as HTMLElement | null) {
    x += node.offsetLeft + (node === el ? 0 : node.clientLeft);
    y += node.offsetTop + (node === el ? 0 : node.clientTop);
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

function WallState({ tone, title, body }: { tone: 'empty' | 'loading'; title: string; body: string }) {
  return (
    <div className={styles.state} role="status">
      <span className={`${styles.stateDisc} ${styles[tone]}`}>
        <Icon name={tone === 'empty' ? 'photoCamera' : 'hourglass'} size={48} />
      </span>
      <p className={`u ${styles.stateTitle}`}>{title}</p>
      <p className={styles.stateBody}>{body}</p>
    </div>
  );
}

export function Wall({ config, reduced }: { config: DisplayConfig; reduced: boolean }) {
  const api = useDisplayBackend();
  const viewportRef = useRef<HTMLDivElement>(null);
  const cardStripRef = useRef<HTMLDivElement>(null);

  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [page, setPage] = useState(0);
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const [playlist] = useState(() => new Playlist());
  const [queue] = useState(() => new ArrivalQueue());
  const [conveyor] = useState(() => new Conveyor(() => playlist.next()));
  /** Tiles per slideshow page: four on the artboard, more on a wider window. */
  const [perPage, setPerPage] = useState(() => conveyor.perView);
  /** Card -> flight hand-off: the tiles laid down for the strip that is flying. */
  const landing = useRef<string[]>([]);
  /** Tiles that went straight in with no card, so they fade in instead. */
  const appearing = useRef(new Set<string>());
  /** Slideshow MỚI tags: photo id -> when it landed. */
  const fresh = useRef(new Map<string, number>());

  const speed = config.marqueePxPerSec ?? DEFAULT_PX_PER_SEC;
  const live = useRef({ config, reduced, speed, card, paused: false });
  live.current = { ...live.current, config, reduced, speed, card };

  const markFresh = useCallback(
    (ids: string[]) => {
      const now = performance.now();
      for (const id of ids) fresh.current.set(id, now);
      setPage(0);
      setTimeout(() => {
        for (const id of ids) if (fresh.current.get(id) === now) fresh.current.delete(id);
        bump();
      }, NEW_TAG_MS);
    },
    [bump],
  );

  const startNext = useCallback(() => {
    const item = queue.next();
    const next: Card | null = item ? { id: performance.now(), item, phase: 'rise' } : null;
    // Written through at once: two snapshots can land before the next render,
    // and the second must see this card as playing, not start another over it.
    live.current.card = next;
    setCard(next);
  }, [queue]);

  // The marquee is as wide as the window lets it be (see stage.ts), so the
  // conveyor is told the real width rather than the artboard's.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      conveyor.viewW = el.clientWidth;
      setPerPage(conveyor.perView);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [conveyor]);

  // ---------------------------------------------------------------- feed

  useEffect(() => {
    let newest = -Infinity;
    let first = true;
    let prune: ReturnType<typeof setTimeout> | undefined;

    const unsubscribe = api.watchApproved((update) => {
      const now = performance.now();
      playlist.set(update.photos);
      setPhotos(update.photos);

      for (const id of update.removedIds) {
        conveyor.drop(id, now);
        queue.forget(id);
        playlist.inFlight.delete(id);
        fresh.current.delete(id);
      }

      // `added` also carries strips that only slid into the newest-80 window
      // because another one left it. A real arrival is newer than anything
      // this screen has already seen.
      const arrivals = first
        ? []
        : update.added
            .filter((p) => (p.reviewedAtMs ?? 0) > newest)
            .sort((a, b) => (a.reviewedAtMs ?? 0) - (b.reviewedAtMs ?? 0));
      for (const p of update.photos) newest = Math.max(newest, p.reviewedAtMs ?? 0);
      first = false;

      if (arrivals.length > 0) {
        const { config: cfg, reduced: calm, card: playing } = live.current;
        if (!cfg.arrivalCard) {
          if (calm) markFresh(arrivals.map((p) => p.id));
          else {
            const tiles = conveyor.insert([...arrivals].reverse(), now, 0);
            for (const tile of tiles) appearing.current.add(tile.key);
            conveyor.reveal(tiles.map((t) => t.key));
          }
        } else {
          for (const p of arrivals) playlist.inFlight.add(p.id);
          queue.push(arrivals, playing?.item ?? null);
          if (!playing) startNext();
        }
      }
      bump();

      clearTimeout(prune);
      prune = setTimeout(() => keepStrips(new Set(update.photos.map((p) => p.id))), 1000);
    }, WALL_MAX);

    return () => {
      unsubscribe();
      clearTimeout(prune);
    };
  }, [api, bump, conveyor, markFresh, playlist, queue, startNext]);

  // ------------------------------------------------------ arrival sequence

  useEffect(() => {
    if (!card) return;
    const wait = { rise: reduced ? FADE_MS : RISE_MS, hold: HOLD_MS, fly: reduced ? FADE_MS : FLY_MS };

    const id = setTimeout(() => {
      const photosOnCard = itemPhotos(card.item);

      if (card.phase === 'rise') {
        setCard({ ...card, phase: 'hold' });
        return;
      }

      if (card.phase === 'hold') {
        const strip = cardStripRef.current;
        const viewport = viewportRef.current;
        if (!reduced && strip && viewport) {
          const now = performance.now();
          const ahead = (live.current.paused ? 0 : live.current.speed) * (FLY_MS / 1000);
          const tiles = conveyor.insert(photosOnCard, now, ahead);
          landing.current = tiles.map((t) => t.key);
          setFlight({
            photo: photosOnCard[0],
            from: boxWithin(strip, viewport),
            to: { x: conveyor.x(tiles[0], now, ahead), y: TRACK_TOP, w: TILE_W, h: TILE_H },
          });
          bump();
        }
        setCard({ ...card, phase: 'fly' });
        return;
      }

      // Landed.
      for (const p of photosOnCard) playlist.inFlight.delete(p.id);
      if (reduced) markFresh(photosOnCard.map((p) => p.id));
      conveyor.reveal(landing.current);
      landing.current = [];
      setFlight(null);
      bump();
      startNext();
    }, wait[card.phase]);

    return () => clearTimeout(id);
  }, [card, reduced, bump, conveyor, markFresh, playlist, startNext]);

  // ------------------------------------------------------------ conveyor

  const tileEls = useRef(new Map<string, HTMLDivElement>());
  const tileRefs = useRef(new Map<string, (el: HTMLDivElement | null) => void>());

  /** One stable ref callback per tile, so a re-render never re-positions it. */
  const tileRef = useCallback(
    (key: string) => {
      let ref = tileRefs.current.get(key);
      if (!ref) {
        ref = (el) => {
          if (el) {
            const tile = conveyor.tiles.find((t) => t.key === key);
            if (tile) el.style.transform = `translate3d(${conveyor.x(tile, performance.now())}px, 0, 0)`;
            tileEls.current.set(key, el);
          } else {
            tileEls.current.delete(key);
            tileRefs.current.delete(key);
            appearing.current.delete(key);
          }
        };
        tileRefs.current.set(key, ref);
      }
      return ref;
    },
    [conveyor],
  );

  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      // A dropped frame slows the tape for a moment; it never teleports it.
      const dt = Math.min(100, now - last);
      last = now;
      const { paused, speed: pxPerSec } = live.current;
      if (conveyor.step(now, paused ? 0 : (pxPerSec * dt) / 1000)) bump();
      for (const tile of conveyor.tiles) {
        const el = tileEls.current.get(tile.key);
        if (el) el.style.transform = `translate3d(${conveyor.x(tile, now)}px, 0, 0)`;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [reduced, bump, conveyor]);

  // ------------------------------------------------------------ slideshow

  useEffect(() => {
    if (!reduced) return;
    const id = setInterval(() => setPage((p) => p + 1), PAGE_MS);
    return () => clearInterval(id);
  }, [reduced]);

  // --------------------------------------------------------------- render

  const onWall = (photos ?? []).filter((p) => !playlist.inFlight.has(p.id));
  const pages = Math.max(1, Math.ceil(onWall.length / perPage));
  const pageIndex = page % pages;

  let body;
  if (photos === null) {
    body = <WallState tone="loading" title="Đang tải…" body="Vài giây thôi. Ảnh sẽ tự hiện lên." />;
  } else if (photos.length === 0 && !card) {
    body = (
      <WallState
        tone="empty"
        title="Chưa có dải ảnh nào"
        body="Hãy là người đầu tiên để lại khoảnh khắc — quét mã QR bên cạnh nhé."
      />
    );
  } else if (reduced) {
    body = (
      <div key={pageIndex} className={styles.page}>
        {onWall.slice(pageIndex * perPage, (pageIndex + 1) * perPage).map((photo) => (
          <StripTile
            key={photo.id}
            photo={photo}
            showNames={config.showNames}
            isNew={fresh.current.has(photo.id)}
          />
        ))}
      </div>
    );
  } else {
    body = conveyor.tiles.map((tile) => (
      <StripTile
        key={tile.key}
        ref={tileRef(tile.key)}
        className={`${styles.tile} ${appearing.current.has(tile.key) ? styles.appear : ''}`}
        photo={tile.photo}
        showNames={config.showNames}
        isNew={tile.newSince !== null}
        hidden={tile.hidden}
        leaving={tile.leavingSince !== null}
      />
    ));
  }

  return (
    <div
      ref={viewportRef}
      className={styles.viewport}
      // Debug only — the kiosk has no pointer, and the cursor is hidden.
      onMouseEnter={() => (live.current.paused = true)}
      onMouseLeave={() => (live.current.paused = false)}
    >
      {body}
      <span className={`${styles.fade} ${styles.fadeLeft}`} aria-hidden="true" />
      <span className={`${styles.fade} ${styles.fadeRight}`} aria-hidden="true" />

      {card ? (
        <>
          <div className={`${styles.dim} ${card.phase === 'fly' ? styles.dimOut : ''}`} aria-hidden="true" />
          <ArrivalCard key={card.id} item={card.item} phase={card.phase} showNames={config.showNames} stripRef={cardStripRef} />
        </>
      ) : null}
      {flight ? <Flyer flight={flight} /> : null}
    </div>
  );
}
