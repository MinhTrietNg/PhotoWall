// End-to-end run of the real client helpers against the emulators, with
// separate "devices": phones, big screen and two moderators.
//   npm run e2e
import assert from 'node:assert/strict';
import { deleteApp, initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import {
  AlreadyReviewedError, approve, connectEmulators, ensureGuest, isModerator, loadFeedPage, photoUrl, reject,
  remove, setUploadsOpen, submitPhoto, SubmitError, watchApproved, watchNewInFeed, watchPending, watchStats,
  type ApprovedUpdate, type Backend,
} from '../src/client';
import { EMULATOR_PROJECT, seedEmulator } from './seed-emulator';

const MOD = 'mod@example.com';
const apps: ReturnType<typeof initializeApp>[] = [];

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

async function moderatorDevice(name: string) {
  const b = device(name);
  // The auth emulator accepts an unsigned JSON "id token".
  const token = JSON.stringify({ sub: `google-${name}`, email: MOD, email_verified: true });
  await signInWithCredential(b.auth, GoogleAuthProvider.credential(token));
  return b;
}

const strip = () => ({
  image: new Blob([new Uint8Array(300 * 1024)], { type: 'image/jpeg' }),
  thumbnail: new Blob([new Uint8Array(30 * 1024)], { type: 'image/jpeg' }),
});

async function waitFor<T>(label: string, fn: () => T | undefined, timeoutMs = 5000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v !== undefined && v !== false) return v;
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for: ${label}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function expectSubmitError(p: Promise<unknown>, code: SubmitError['code']) {
  await assert.rejects(p, (e) => e instanceof SubmitError && e.code === code);
}

function step(msg: string) {
  console.log(`✓ ${msg}`);
}

await seedEmulator([MOD], { clear: true });

// Big screen
const screen = device('screen');
await ensureGuest(screen);
const updates: ApprovedUpdate[] = [];
let approvedCount = 0;
const unsubs = [watchApproved(screen, (u) => updates.push(u))];
unsubs.push(watchStats(screen, (s) => { approvedCount = s.approvedCount; }));

// Moderators
const mod1 = await moderatorDevice('mod1');
const mod2 = await moderatorDevice('mod2');
assert.equal(await isModerator(mod1), true);
const stranger = device('stranger');
await ensureGuest(stranger);
assert.equal(await isModerator(stranger), false);
let pending: string[] = [];
unsubs.push(watchPending(mod1, (ps) => { pending = ps.map((p) => p.id); }));
step('big screen and moderators connected');

// Phone 1: submit, then get rate-limited
const phone1 = device('phone1');
await ensureGuest(phone1);
const p1 = await submitPhoto(phone1, { ...strip(), displayName: 'Khả', frameVariant: 'light' });
await waitFor('p1 in pending queue', () => pending.includes(p1));
await expectSubmitError(
  submitPhoto(phone1, { ...strip(), displayName: 'Khả', frameVariant: 'light' }),
  'rate-limited',
);
await expectSubmitError(
  submitPhoto(phone1, { ...strip(), image: new Blob([new Uint8Array(10)], { type: 'image/png' }), displayName: 'x', frameVariant: 'light' }),
  'invalid-input',
);
step('phone submits; second submit within 60s is rate-limited');

// Approve → big screen pops it
const approvedAt = Date.now();
await approve(mod1, p1);
const popped = await waitFor('big screen receives p1', () => updates.find((u) => u.added.some((p) => p.id === p1)));
const latency = Date.now() - approvedAt;
assert.equal(popped.photos[0].id, p1);
await waitFor('counter = 1', () => approvedCount === 1);
const url = await photoUrl(screen, p1);
assert.equal((await fetch(url)).status, 200);
step(`approve → big screen pop in ${latency} ms, counter = 1, image downloadable`);

// Phone 2: rejected → object deleted, never shown
const phone2 = device('phone2');
await ensureGuest(phone2);
const p2 = await submitPhoto(phone2, { ...strip(), displayName: 'Bình', frameVariant: 'dark' });
await waitFor('p2 pending', () => pending.includes(p2));
await reject(mod1, p2);
await assert.rejects(photoUrl(phone2, p2));
await assert.rejects(photoUrl(phone2, p2, 'thumb'));
assert.ok(!updates.some((u) => u.added.some((p) => p.id === p2)));
step('reject → strip + thumbnail deleted, never reaches big screen');

// Phone 3: two moderators race; exactly one wins
const phone3 = device('phone3');
await ensureGuest(phone3);
const p3 = await submitPhoto(phone3, { ...strip(), displayName: 'Chi', frameVariant: 'light' });
await waitFor('p3 pending', () => pending.includes(p3));
const race = await Promise.allSettled([approve(mod1, p3), approve(mod2, p3)]);
assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);
const loser = race.find((r) => r.status === 'rejected') as PromiseRejectedResult;
assert.ok(loser.reason instanceof AlreadyReviewedError, `loser error: ${loser.reason}`);
await waitFor('counter = 2', () => approvedCount === 2);
step('two moderators approve at once → one wins, counter counted once');

// Phone feed: paginate, then "N ảnh mới" button
const reader = device('reader');
await ensureGuest(reader);
const page1 = await loadFeedPage(reader, null, 1);
assert.deepEqual(page1.photos.map((p) => p.id), [p3]);
const page2 = await loadFeedPage(reader, page1.next, 1);
assert.deepEqual(page2.photos.map((p) => p.id), [p1]);
assert.equal((await loadFeedPage(reader, page2.next, 1)).photos.length, 0);
assert.equal((await fetch(await photoUrl(reader, p3, 'thumb'))).status, 200);
let fresh: string[] = [];
unsubs.push(watchNewInFeed(reader, page1.photos[0], (ps) => { fresh = ps.map((p) => p.id); }));
const phone5 = device('phone5');
await ensureGuest(phone5);
const p5 = await submitPhoto(phone5, { ...strip(), displayName: 'Em', frameVariant: 'dark' });
await waitFor('p5 pending', () => pending.includes(p5));
assert.deepEqual(fresh, []);
await approve(mod1, p5);
await waitFor('feed sees 1 new photo', () => fresh.length === 1 && fresh[0] === p5);
await waitFor('counter = 3', () => approvedCount === 3);
step('feed paginates newest-first, thumbnail loads, "new photos" fires on approve');

// Remove p1 from the big screen
await remove(mod2, p1);
await waitFor('big screen drops p1', () => updates.find((u) => u.removedIds.includes(p1)));
await waitFor('counter = 2', () => approvedCount === 2);
step('remove → big screen drops photo, counter = 2');

// Close uploads
await setUploadsOpen(mod1, false);
const phone4 = device('phone4');
await ensureGuest(phone4);
await expectSubmitError(
  submitPhoto(phone4, { ...strip(), displayName: 'Dũng', frameVariant: 'light' }),
  'uploads-closed',
);
step('uploadsOpen = false → submissions refused');

unsubs.forEach((u) => u());
await Promise.all(apps.map((a) => deleteApp(a)));
console.log('\nE2E OK');
process.exit(0);
