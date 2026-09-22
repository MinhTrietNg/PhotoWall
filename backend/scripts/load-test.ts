// Load test against the emulators: many phones each submitting one strip, a few
// moderators approving, one big screen.
//   npm run load-test                                    (800 phones)
//   npx tsx scripts/load-test.ts --sessions 200 --ramp 30   (emulators already running)
// Checks correctness under concurrency; latency numbers are local, not production.
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { collection, getCountFromServer, getFirestore, query, where } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import {
  AlreadyReviewedError, approve, connectEmulators, ensureGuest, reject,
  submitPhoto, SubmitError, watchApproved, watchMyPhotos, watchPending, watchStats,
  type Backend, type Photo,
} from '../src/client';
import { EMULATOR_PROJECT, seedEmulator } from './seed-emulator';

const { values: args } = parseArgs({
  options: {
    sessions: { type: 'string', default: '800' },
    moderators: { type: 'string', default: '3' },
    ramp: { type: 'string', default: '120' }, // seconds over which sessions arrive
    'reject-rate': { type: 'string', default: '0.1' },
    'settle': { type: 'string', default: '180' }, // seconds to let listeners catch up at the end
  },
});
const SESSIONS = Number(args.sessions);
const MODERATORS = Number(args.moderators);
const RAMP_MS = Number(args.ramp) * 1000;
const REJECT_RATE = Number(args['reject-rate']);
const SETTLE_MS = Number(args.settle) * 1000;
const loopDelay = monitorEventLoopDelay({ resolution: 20 });
loopDelay.enable();

// ------------------------------------------------------------ plumbing

const apps: FirebaseApp[] = [];
const unsubs: (() => void)[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function device(name: string): Backend {
  const app = initializeApp(
    { projectId: EMULATOR_PROJECT, apiKey: 'demo-key', storageBucket: `${EMULATOR_PROJECT}.appspot.com` },
    name,
  );
  apps.push(app);
  const b = { auth: getAuth(app), db: getFirestore(app), storage: getStorage(app) };
  connectEmulators(b);
  return b;
}

const samples: Record<string, number[]> = {};
const counters: Record<string, number> = {};
const record = (metric: string, ms: number) => (samples[metric] ??= []).push(ms);
const count = (key: string) => { counters[key] = (counters[key] ?? 0) + 1; };

function pct(xs: number[], p: number) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

// Moderation start time per photo; screen latency is measured from here.
const approveStartedAt = new Map<string, number>();
const approvedIds = new Set<string>();
const rejectedIds = new Set<string>();

const strip = () => new Blob([new Uint8Array(500 * 1024)], { type: 'image/jpeg' });

// ------------------------------------------------------------ actors

/** A phone: signs in, submits one strip, waits until it is reviewed. */
async function phone(i: number) {
  const b = device(`phone-${i}`);
  await ensureGuest(b);
  const t0 = performance.now();
  try {
    const id = await submitPhoto(b, { image: strip(), displayName: `Load ${i}`, frameVariant: i % 2 ? 'light' : 'dark' });
    record('submit (batch + upload + pending)', performance.now() - t0);
    count('submit ok');
    await new Promise<void>((resolve) => {
      const un = watchMyPhotos(b, (ps) => {
        if (ps.find((p) => p.id === id && (p.status === 'approved' || p.status === 'rejected'))) {
          un();
          resolve();
        }
      });
    });
  } catch (e) {
    const cause = e instanceof SubmitError && e.cause ? ` (${(e.cause as { code?: string }).code ?? (e.cause as Error).message})` : '';
    count(`submit error: ${e instanceof SubmitError ? e.code : (e as Error).message}${cause}`);
  }
}

async function moderatorDevice(name: string) {
  const b = device(name);
  // The auth emulator accepts an unsigned JSON "id token".
  const token = JSON.stringify({ sub: `google-${name}`, email: 'mod@example.com', email_verified: true });
  await signInWithCredential(b.auth, GoogleAuthProvider.credential(token));
  return b;
}

async function moderator(n: number, stop: () => boolean) {
  const b = await moderatorDevice(`mod-${n}`);
  let queue: Photo[] = [];
  unsubs.push(watchPending(b, (ps) => { queue = ps; }));
  while (!stop()) {
    const candidates = queue.filter((p) => !approvedIds.has(p.id) && !rejectedIds.has(p.id));
    if (!candidates.length) {
      await sleep(100);
      continue;
    }
    // Random pick so moderators sometimes collide, like real people would.
    const p = candidates[Math.floor(Math.random() * candidates.length)];
    await sleep(200 + Math.random() * 300); // "looking at" the photo
    const doReject = Math.random() < REJECT_RATE;
    const started = performance.now();
    const ownsTimer = !doReject && !approveStartedAt.has(p.id);
    if (ownsTimer) approveStartedAt.set(p.id, started);
    try {
      if (doReject) {
        await reject(b, p.id);
        rejectedIds.add(p.id);
        count('reject ok');
      } else {
        await approve(b, p.id);
        approvedIds.add(p.id);
        count('approve ok');
      }
      record('moderate (transaction)', performance.now() - started);
    } catch (e) {
      if (ownsTimer && !approvedIds.has(p.id)) approveStartedAt.delete(p.id);
      count(e instanceof AlreadyReviewedError ? 'moderator collision (expected)' : `moderate error: ${(e as Error).message}`);
    }
  }
}

// ------------------------------------------------------------ run

console.log(`Load test: ${SESSIONS} phones, ${MODERATORS} moderators, ramp ${RAMP_MS / 1000}s`);
await seedEmulator(['mod@example.com'], { clear: true });

const screen = device('screen');
const onScreen = new Set<string>();
let approvedCount = 0;
unsubs.push(watchApproved(screen, (u) => {
  for (const p of u.added) {
    onScreen.add(p.id);
    const started = approveStartedAt.get(p.id);
    if (started) record('approve → big screen', performance.now() - started);
  }
}));
unsubs.push(watchStats(screen, (s) => { approvedCount = s.approvedCount; }));

let submittersDone = false;
const mods = Array.from({ length: MODERATORS }, (_, n) => moderator(n, () => submittersDone));

const startedAt = performance.now();
const sessions: Promise<unknown>[] = [];
for (let i = 0; i < SESSIONS; i++) {
  sessions.push(phone(i).catch((e) => count(`session error: ${(e as Error).message}`)));
  await sleep(RAMP_MS / SESSIONS);
}
await Promise.all(sessions);
submittersDone = true;
await Promise.all(mods);

// Let listeners catch up.
const settleStart = Date.now();
const deadline = settleStart + SETTLE_MS;
// Ground truth from the server, not the moderators' own bookkeeping: under load a
// commit can time out client-side yet succeed, so a "lost" approve may have won.
// Only moderators may read unapproved photos, so audit with a moderator account.
const auditor = await moderatorDevice('auditor');
const countWhere = async (status: string) => (await getCountFromServer(
  query(collection(auditor.db, 'photos'), where('status', '==', status)),
)).data().count;
const serverApproved = await countWhere('approved');
while ((onScreen.size < serverApproved || approvedCount !== serverApproved) && Date.now() < deadline) {
  await sleep(200);
}
const unreviewed = (await countWhere('pending')) + (await countWhere('uploading'));
const settledAfter = (Date.now() - settleStart) / 1000;
console.log(`Settle: ${settledAfter.toFixed(0)}s; server approved ${serverApproved}, moderators saw ${approvedIds.size}, counter ${approvedCount}, on screen ${onScreen.size}`);
console.log(`Node event-loop delay p99: ${Math.round(loopDelay.percentile(99) / 1e6)} ms, max ${Math.round(loopDelay.max / 1e6)} ms`);
const totalSeconds = (performance.now() - startedAt) / 1000;
const rssMb = Math.round(process.memoryUsage().rss / 1e6);

console.log(`\nDone in ${totalSeconds.toFixed(0)}s, RSS ${rssMb} MB\n`);
console.table(Object.fromEntries(Object.entries(samples).map(([k, xs]) => [k, {
  n: xs.length, p50: Math.round(pct(xs, 50)), p95: Math.round(pct(xs, 95)), max: Math.round(Math.max(...xs)),
}])));
console.table(counters);

const failures = Object.entries(counters)
  .filter(([k]) => k.includes('error'))
  .reduce((n, [, v]) => n + v, 0);
// Correctness only: emulator latency does not reflect production (one Java
// process fanning out to every listener) — measure latency against the real project.
const checks = {
  'counter == server approved': approvedCount === serverApproved,
  'big screen shows every approved': onScreen.size === serverApproved,
  'no rejected photo on screen': [...rejectedIds].every((id) => !onScreen.has(id)),
  'no photo left unreviewed': unreviewed === 0,
  'error rate < 1%': failures / SESSIONS < 0.01,
};
console.table(checks);

unsubs.forEach((u) => u());
await Promise.all(apps.map((a) => deleteApp(a)));
const ok = Object.values(checks).every(Boolean);
console.log(ok ? '\nLOAD TEST OK' : '\nLOAD TEST FAILED');
process.exit(ok ? 0 : 1);
