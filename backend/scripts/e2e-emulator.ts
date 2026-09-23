// End-to-end run of the real client helpers against the emulators, with
// separate "devices": phones, big screen and two moderators.
//   npm run e2e
import assert from 'node:assert/strict';
import { deleteApp, initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import {
  AlreadyReviewedError, approve, connectEmulators, ensureGuest, isModerator, photoUrl, reject,
  approveMany, countPhotos, listApprovedForExport, remove, removeMyPhoto, restore, setUploadsOpen,
  submitPhoto, SubmitError, watchApproved, watchPending, watchStats,
  type ApprovedUpdate, type Backend,
} from '../src/client';
import { stripFileName, toParticipantsCsv } from '../src/export';
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

const strip = () => new Blob([new Uint8Array(300 * 1024)], { type: 'image/jpeg' });

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
const p1 = await submitPhoto(phone1, { image: strip(), displayName: 'Khả', frameVariant: 'f01-gdgoc' });
await waitFor('p1 in pending queue', () => pending.includes(p1));
await expectSubmitError(
  submitPhoto(phone1, { image: strip(), displayName: 'Khả', frameVariant: 'f01-gdgoc' }),
  'rate-limited',
);
await expectSubmitError(
  submitPhoto(phone1, { image: new Blob([new Uint8Array(10)], { type: 'image/png' }), displayName: 'x', frameVariant: 'f01-gdgoc' }),
  'invalid-input',
);
step('phone submits; second submit within 60s is rate-limited');

// Approve → big screen pops it
const approvedAt = Date.now();
await approve(mod1, p1);
const popped = await waitFor('big screen receives p1', () => updates.find((u) => u.added.some((p) => p.id === p1)));
const latency = Date.now() - approvedAt;
assert.equal(popped.photos[0].id, p1);
assert.equal(popped.photos[0].momentNo, 1);
await waitFor('counter = 1', () => approvedCount === 1);
const url = await photoUrl(screen, p1);
assert.equal((await fetch(url)).status, 200);
step(`approve → big screen pop in ${latency} ms, counter = 1, image downloadable`);

// Phone 2: rejected → never shown; restored → on the wall with the next number
const phone2 = device('phone2');
await ensureGuest(phone2);
const p2 = await submitPhoto(phone2, { image: strip(), displayName: 'Bình', frameVariant: 'f02-aws' });
await waitFor('p2 pending', () => pending.includes(p2));
await reject(mod1, p2, 'duplicate');
await new Promise((r) => setTimeout(r, 300));
assert.ok(!updates.some((u) => u.added.some((p) => p.id === p2)));
await restore(mod2, p2);
const restored = await waitFor('big screen receives restored p2', () => updates.flatMap((u) => u.added).find((p) => p.id === p2));
assert.equal(restored.momentNo, 2);
await waitFor('counter = 2', () => approvedCount === 2);
step('reject → hidden; restore → back on the big screen as #2');

// Phone 3: two moderators race; exactly one wins
const phone3 = device('phone3');
await ensureGuest(phone3);
const p3 = await submitPhoto(phone3, { image: strip(), displayName: 'Chi', frameVariant: 'f01-gdgoc' });
await waitFor('p3 pending', () => pending.includes(p3));
const race = await Promise.allSettled([approve(mod1, p3), approve(mod2, p3)]);
assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);
const loser = race.find((r) => r.status === 'rejected') as PromiseRejectedResult;
assert.ok(loser.reason instanceof AlreadyReviewedError, `loser error: ${loser.reason}`);
await waitFor('counter = 3', () => approvedCount === 3);
step('two moderators approve at once → one wins, counter counted once');

// Remove p1 from the big screen
await remove(mod2, p1);
await waitFor('big screen drops p1', () => updates.find((u) => u.removedIds.includes(p1)));
await waitFor('counter = 2', () => approvedCount === 2);
step('remove → big screen drops photo, counter = 2');

// Guest removes their own approved strip (S07): off the wall, kept 24h, never restorable
await removeMyPhoto(phone3, p3);
await waitFor('big screen drops p3', () => updates.find((u) => u.removedIds.includes(p3)));
await waitFor('counter = 1', () => approvedCount === 1);
await assert.rejects(restore(mod1, p3));
step('guest removes own strip → off the wall, not restorable (file kept for the retention window)');

// Bulk "Duyệt 5 ảnh", tab counts and the M02 export
const batchIds: string[] = [];
for (let i = 0; i < 5; i++) {
  const phone = device(`bulk-${i}`);
  await ensureGuest(phone);
  batchIds.push(await submitPhoto(phone, {
    image: strip(), displayName: `Bạn ${i}`, frameVariant: 'f03-isf', showName: i !== 0,
  }));
}
await waitFor('5 pending', () => batchIds.every((id) => pending.includes(id)));
const bulkResult = await approveMany(mod1, batchIds);
assert.deepEqual(bulkResult, { ok: batchIds, conflicts: [], failed: [] });
await waitFor('counter = 6', () => approvedCount === 6);
assert.equal(await countPhotos(mod1, ['approved']), 6);
assert.equal(await countPhotos(mod1, ['rejected', 'removed']), 2); // p1 removed by a moderator, p3 by its owner
const exportRows = await listApprovedForExport(mod1);
assert.equal(exportRows.length, 6);
assert.deepEqual(exportRows.map((r) => r.momentNo), [...exportRows.map((r) => r.momentNo)].sort((a, c) => a! - c!));
assert.equal(exportRows.find((r) => r.id === batchIds[0])!.showName, false);
const csv = toParticipantsCsv(exportRows);
assert.ok(csv.startsWith('\uFEFFKhoảnh khắc,Tên'));
assert.equal(csv.trim().split('\r\n').length, 7);
assert.match(stripFileName(exportRows[0]), /^\d{4}-[a-z0-9-]+\.jpg$/);
step('approveMany 5 → no conflicts; counts and export match the wall; "Hiện tên" off is stored');

// Close uploads
await setUploadsOpen(mod1, false);
const phone4 = device('phone4');
await ensureGuest(phone4);
await expectSubmitError(
  submitPhoto(phone4, { image: strip(), displayName: 'Dũng', frameVariant: 'f01-gdgoc' }),
  'uploads-closed',
);
step('uploadsOpen = false → submissions refused');

unsubs.forEach((u) => u());
await Promise.all(apps.map((a) => deleteApp(a)));
console.log('\nE2E OK');
process.exit(0);
