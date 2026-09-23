import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, increment, limit, orderBy, query, runTransaction,
  serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch, type Firestore,
} from 'firebase/firestore';
import {
  AlreadyReviewedError, approve, cancelDeletion, confirmDeletion, deleteModerator, purgeExpired,
  reject, remove, removeMyPhoto, restore, runDueDeletion, saveModerator, scheduleDeletion,
  updateConfig, type Backend,
} from '../src/client';
import { paths } from '../src/schema';
import {
  ADMIN2_EMAIL, createEnv, guest, guestBackend, hoursAgo, MOD2_EMAIL, MOD_EMAIL, modBackend, moderator,
  reviewedPhoto, secondsAgo, seed, storedPhoto, submitBatch,
} from './helpers';

let env: RulesTestEnvironment;
const db = (ctx: { firestore(): unknown }) => ctx.firestore() as Firestore;

beforeAll(async () => { env = await createEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

describe('submitting a photo', () => {
  it('allows a valid first submission', async () => {
    await seed(env);
    await assertSucceeds(submitBatch(db(guest(env, 'alice')), 'alice', 'p1').commit());
  });

  it('allows two different people to use the same display name', async () => {
    await seed(env);
    await assertSucceeds(submitBatch(db(guest(env, 'alice')), 'alice', 'p1', { displayName: 'Bảo Anh' }).commit());
    await assertSucceeds(submitBatch(db(guest(env, 'bob')), 'bob', 'p2', { displayName: 'Bảo Anh' }).commit());
  });

  it('accepts every frame id the frontend ships', async () => {
    for (const [i, frame] of ['f01-gdgoc', 'f02-aws', 'f03-partners'].entries()) {
      await seed(env);
      const uid = `guest-${i}`;
      await assertSucceeds(submitBatch(db(guest(env, uid)), uid, `p${i}`, { frameVariant: frame }).commit());
    }
  });

  it('accepts a 24-character name and the "Hiện tên" choice', async () => {
    await seed(env);
    await assertSucceeds(submitBatch(db(guest(env, 'alice')), 'alice', 'p1', {
      displayName: 'x'.repeat(24), showName: false,
    }).commit());
    expect(await readAs(paths.photo('p1'))).toMatchObject({ showName: false });
  });

  it('rejects when uploads are closed', async () => {
    await seed(env, { uploadsOpen: false });
    await assertFails(submitBatch(db(guest(env, 'alice')), 'alice', 'p1').commit());
  });

  it('rejects when config is missing (fails closed)', async () => {
    await assertFails(submitBatch(db(guest(env, 'alice')), 'alice', 'p1').commit());
  });

  it('rejects a second submission within 60 seconds', async () => {
    await seed(env, {
      docs: { [paths.user('alice')]: { lastSubmitAt: secondsAgo(30), lastPhotoId: 'p0', submitCount: 1 } },
    });
    await assertFails(submitBatch(db(guest(env, 'alice')), 'alice', 'p1').commit());
  });

  it('allows a second submission after 60 seconds', async () => {
    await seed(env, {
      docs: { [paths.user('alice')]: { lastSubmitAt: secondsAgo(61), lastPhotoId: 'p0', submitCount: 1 } },
    });
    await assertSucceeds(submitBatch(db(guest(env, 'alice')), 'alice', 'p1').commit());
  });

  it('rejects the 4th submission by default (maxSubmitsPerUser = 3)', async () => {
    await seed(env, {
      docs: { [paths.user('alice')]: { lastSubmitAt: secondsAgo(61), lastPhotoId: 'p0', submitCount: 3 } },
    });
    await assertFails(submitBatch(db(guest(env, 'alice')), 'alice', 'p1').commit());
  });

  it('follows maxSubmitsPerUser from config', async () => {
    await seed(env, {
      config: { maxSubmitsPerUser: 5 },
      docs: { [paths.user('alice')]: { lastSubmitAt: secondsAgo(61), lastPhotoId: 'p0', submitCount: 3 } },
    });
    await assertSucceeds(submitBatch(db(guest(env, 'alice')), 'alice', 'p1').commit());
  });

  it('refuses submissions after closesAt, accepts before', async () => {
    await seed(env, { config: { closesAt: secondsAgo(1) } });
    await assertFails(submitBatch(db(guest(env, 'alice')), 'alice', 'p1').commit());
    await seed(env, { config: { closesAt: secondsAgo(-3600) } });
    await assertSucceeds(submitBatch(db(guest(env, 'bob')), 'bob', 'p2').commit());
  });

  it('rejects a photo written without the ledger', async () => {
    await seed(env);
    const d = db(guest(env, 'alice'));
    const batch = submitBatch(d, 'alice', 'p1');
    const lone = writeBatch(d);
    lone.set(doc(d, paths.photo('p2')), {
      ownerUid: 'alice', displayName: 'x', frameVariant: 'f01-gdgoc', status: 'uploading',
      storagePath: paths.photoObject('p2'), createdAt: serverTimestamp(),
    });
    await assertSucceeds(batch.commit());
    await assertFails(lone.commit());
  });

  it('rejects two photos in one batch (rate-limit bypass)', async () => {
    await seed(env);
    const d = db(guest(env, 'alice'));
    const batch = submitBatch(d, 'alice', 'p1');
    batch.set(doc(d, paths.photo('p2')), {
      ownerUid: 'alice', displayName: 'x', frameVariant: 'f01-gdgoc', status: 'uploading',
      storagePath: paths.photoObject('p2'), createdAt: serverTimestamp(),
    });
    await assertFails(batch.commit());
  });

  it('rejects extra fields', async () => {
    await seed(env);
    await assertFails(submitBatch(db(guest(env, 'alice')), 'alice', 'p1', { isVip: true }).commit());
  });

  it('rejects a spoofed ownerUid', async () => {
    await seed(env);
    await assertFails(submitBatch(db(guest(env, 'alice')), 'alice', 'p1', { ownerUid: 'bob' }).commit());
  });

  it('rejects a client-chosen createdAt', async () => {
    await seed(env);
    await assertFails(
      submitBatch(db(guest(env, 'alice')), 'alice', 'p1', { createdAt: secondsAgo(3600) }).commit(),
    );
  });

  it('rejects a photo created directly as approved', async () => {
    await seed(env);
    await assertFails(submitBatch(db(guest(env, 'alice')), 'alice', 'p1', { status: 'approved' }).commit());
  });

  it('rejects a bad display name, frame variant or storage path', async () => {
    await seed(env);
    const d = db(guest(env, 'alice'));
    await assertFails(submitBatch(d, 'alice', 'p1', { displayName: '' }).commit());
    await assertFails(submitBatch(d, 'alice', 'p1', { displayName: 'x'.repeat(25) }).commit());
    await assertFails(submitBatch(d, 'alice', 'p1', { showName: 'no' }).commit());
    await assertFails(submitBatch(d, 'alice', 'p1', { frameVariant: 'neon' }).commit());
    await assertFails(submitBatch(d, 'alice', 'p1', { frameVariant: '' }).commit());
    await assertFails(submitBatch(d, 'alice', 'p1', { frameVariant: 'F01-GDGOC' }).commit());
    await assertFails(submitBatch(d, 'alice', 'p1', { storagePath: 'photos/other/strip.jpg' }).commit());
  });

  it('lets the owner move uploading → pending, and nothing else', async () => {
    await seed(env, { docs: { [paths.photo('p1')]: { ...storedPhoto('alice', 'p1', 'uploading'), submittedAt: null } } });
    const ref = doc(db(guest(env, 'alice')), paths.photo('p1'));
    await assertFails(updateDoc(ref, { status: 'approved', submittedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db(guest(env, 'bob')), paths.photo('p1')), {
      status: 'pending', submittedAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(ref, { status: 'pending', submittedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { displayName: 'changed' }));
  });
});


async function readAs<T = Record<string, unknown>>(path: string): Promise<T> {
  let data: unknown;
  await env.withSecurityRulesDisabled(async (ctx) => {
    data = (await getDoc(doc(db(ctx), path))).data();
  });
  return data as T;
}

describe('moderation', () => {
  beforeEach(async () => {
    await seed(env, {
      docs: {
        [paths.photo('p1')]: storedPhoto('alice', 'p1', 'pending'),
        [paths.photo('p2')]: storedPhoto('bob', 'p2', 'pending'),
      },
    });
  });

  const rawReview = (d: Firestore, status: string, email = MOD_EMAIL) =>
    updateDoc(doc(d, paths.photo('p1')), { status, reviewedAt: serverTimestamp(), reviewedBy: email });

  it('approve assigns increasing moment numbers and counts the wall', async () => {
    const m = modBackend(env);
    await assertSucceeds(approve(m, 'p1'));
    await assertSucceeds(approve(m, 'p2'));
    expect((await readAs(paths.photo('p1'))).momentNo).toBe(1);
    expect((await readAs(paths.photo('p2'))).momentNo).toBe(2);
    expect(await readAs(paths.stats)).toMatchObject({ approvedCount: 2, momentSeq: 2 });
  });

  it('refuses an approval that skips the counter or fakes the moment number', async () => {
    const d = db(moderator(env));
    await assertFails(rawReview(d, 'approved'));
    const batch = writeBatch(d);
    batch.update(doc(d, paths.photo('p1')), {
      status: 'approved', reviewedAt: serverTimestamp(), reviewedBy: MOD_EMAIL, momentNo: 7,
    });
    batch.set(doc(d, paths.stats), { approvedCount: increment(1), momentSeq: 1 }, { merge: true });
    await assertFails(batch.commit());
  });

  it('plain moderators (not only admins) can review', async () => {
    await assertSucceeds(approve(modBackend(env, MOD2_EMAIL), 'p1'));
  });

  it('reject stores an allowed reason and refuses others', async () => {
    const d = db(moderator(env));
    await assertFails(updateDoc(doc(d, paths.photo('p1')), {
      status: 'rejected', reviewedAt: serverTimestamp(), reviewedBy: MOD_EMAIL, reviewReason: 'ugly',
    }));
    await assertSucceeds(reject(modBackend(env), 'p1', 'inappropriate'));
    expect((await readAs(paths.photo('p1'))).reviewReason).toBe('inappropriate');
  });

  it('forbids guests and non-allowlisted Google accounts from reviewing', async () => {
    await assertFails(rawReview(db(guest(env, 'alice')), 'rejected', 'alice'));
    await assertFails(rawReview(db(moderator(env, 'stranger@example.com')), 'rejected', 'stranger@example.com'));
    const unverified = env.authenticatedContext('u', { email: MOD_EMAIL, email_verified: false });
    await assertFails(rawReview(db(unverified), 'rejected'));
  });

  it('forbids spoofing reviewedBy', async () => {
    await assertFails(rawReview(db(moderator(env)), 'rejected', 'someone@else.com'));
  });

  it('lets only one of two moderators act on the same photo', async () => {
    await approve(modBackend(env), 'p1');
    await expect(reject(modBackend(env, MOD2_EMAIL), 'p1')).rejects.toBeInstanceOf(AlreadyReviewedError);
  });

  it('remove takes a photo off the wall but keeps its moment number', async () => {
    const m = modBackend(env);
    await approve(m, 'p1');
    await assertSucceeds(remove(m, 'p1', 'duplicate'));
    expect(await readAs(paths.photo('p1'))).toMatchObject({ status: 'removed', momentNo: 1, reviewReason: 'duplicate' });
    expect(await readAs(paths.stats)).toMatchObject({ approvedCount: 0, momentSeq: 1 });
  });

  it('only allows the counter to move by one, and only for moderators', async () => {
    await assertFails(setDoc(doc(db(moderator(env)), paths.stats), { approvedCount: increment(5) }, { merge: true }));
    await assertFails(setDoc(doc(db(guest(env, 'alice')), paths.stats), { approvedCount: increment(1) }, { merge: true }));
  });
});

describe('restore and purge', () => {
  it('restores a removed photo within the window, keeping its number', async () => {
    await seed(env, {
      docs: {
        [paths.photo('p1')]: reviewedPhoto('alice', 'p1', 'removed', 3600, { momentNo: 4, reviewReason: 'duplicate' }),
        [paths.stats]: { approvedCount: 0, momentSeq: 4 },
      },
    });
    await assertSucceeds(restore(modBackend(env, MOD2_EMAIL), 'p1'));
    const p = await readAs(paths.photo('p1'));
    expect(p).toMatchObject({ status: 'approved', momentNo: 4 });
    expect(p).not.toHaveProperty('reviewReason');
    expect(await readAs(paths.stats)).toMatchObject({ approvedCount: 1, momentSeq: 4 });
  });

  it('restoring a rejected photo gives it the next number', async () => {
    await seed(env, {
      docs: {
        [paths.photo('p1')]: reviewedPhoto('alice', 'p1', 'rejected', 60, { reviewReason: 'duplicate' }),
        [paths.stats]: { approvedCount: 2, momentSeq: 5 },
      },
    });
    await assertSucceeds(restore(modBackend(env), 'p1'));
    expect((await readAs(paths.photo('p1'))).momentNo).toBe(6);
  });

  it('refuses to restore after the window, after a purge, or after a guest removal', async () => {
    await seed(env, {
      docs: {
        [paths.photo('old')]: reviewedPhoto('alice', 'old', 'removed', 25 * 3600, { momentNo: 1 }),
        [paths.photo('gone')]: reviewedPhoto('alice', 'gone', 'rejected', 60, { purgedAt: secondsAgo(1) }),
        [paths.photo('mine')]: reviewedPhoto('alice', 'mine', 'removed', 60, {
          reviewedBy: 'owner', purgedAt: secondsAgo(1), momentNo: 2,
        }),
        [paths.stats]: { approvedCount: 0, momentSeq: 2 },
      },
    });
    const m = modBackend(env);
    for (const id of ['old', 'gone', 'mine']) await assertFails(restore(m, id));
  });

  it('follows removedRetentionHours from config', async () => {
    await seed(env, {
      config: { removedRetentionHours: 48 },
      docs: {
        [paths.photo('p1')]: reviewedPhoto('alice', 'p1', 'removed', 25 * 3600, { momentNo: 1 }),
        [paths.stats]: { approvedCount: 0, momentSeq: 1 },
      },
    });
    await assertSucceeds(restore(modBackend(env), 'p1'));
  });

  it('purges only photos past the retention window', async () => {
    await seed(env, {
      docs: {
        [paths.photo('old')]: reviewedPhoto('alice', 'old', 'rejected', 25 * 3600),
        [paths.photo('new')]: reviewedPhoto('alice', 'new', 'rejected', 60),
      },
    });
    expect(await purgeExpired(modBackend(env))).toBe(1);
    expect(await readAs(paths.photo('old'))).toHaveProperty('purgedAt');
    expect(await readAs(paths.photo('new'))).not.toHaveProperty('purgedAt');
    await assertFails(updateDoc(doc(db(moderator(env)), paths.photo('new')), { purgedAt: serverTimestamp() }));
  });
});

describe('guest removes their own strip (S09)', () => {
  it('removes a pending strip, keeps it for the retention window, never restorable', async () => {
    await seed(env, { docs: { [paths.photo('p1')]: storedPhoto('alice', 'p1', 'pending') } });
    await assertSucceeds(removeMyPhoto(guestBackend(env, 'alice'), 'p1'));
    const p = await readAs(paths.photo('p1'));
    expect(p).toMatchObject({ status: 'removed', reviewedBy: 'owner' });
    expect(p).not.toHaveProperty('purgedAt');
    await assertFails(restore(modBackend(env), 'p1'));
  });

  it('a guest removal is purged once the retention window has passed', async () => {
    await seed(env, {
      docs: { [paths.photo('p1')]: reviewedPhoto('alice', 'p1', 'removed', 25 * 3600, { reviewedBy: 'owner' }) },
    });
    expect(await purgeExpired(modBackend(env))).toBe(1);
  });

  it('removes an approved strip and decrements the counter', async () => {
    await seed(env, {
      docs: {
        [paths.photo('p1')]: reviewedPhoto('alice', 'p1', 'approved', 60, { momentNo: 1 }),
        [paths.stats]: { approvedCount: 3, momentSeq: 3 },
      },
    });
    await assertSucceeds(removeMyPhoto(guestBackend(env, 'alice'), 'p1'));
    expect(await readAs(paths.stats)).toMatchObject({ approvedCount: 2, momentSeq: 3, lastOwnerRemoval: 'p1' });
  });

  it("cannot remove someone else's strip", async () => {
    await seed(env, {
      docs: {
        [paths.photo('p1')]: reviewedPhoto('alice', 'p1', 'approved', 60, { momentNo: 1 }),
        [paths.stats]: { approvedCount: 1, momentSeq: 1 },
      },
    });
    const d = db(guest(env, 'bob'));
    const batch = writeBatch(d);
    batch.update(doc(d, paths.photo('p1')), {
      status: 'removed', reviewedAt: serverTimestamp(), reviewedBy: 'owner',
    });
    batch.set(doc(d, paths.stats), { approvedCount: increment(-1), lastOwnerRemoval: 'p1' }, { merge: true });
    await assertFails(batch.commit());
  });

  it('cannot touch the counter without removing a strip, nor remove without the counter', async () => {
    await seed(env, {
      docs: {
        [paths.photo('p1')]: reviewedPhoto('alice', 'p1', 'approved', 60, { momentNo: 1 }),
        [paths.stats]: { approvedCount: 3, momentSeq: 3 },
      },
    });
    const d = db(guest(env, 'alice'));
    await assertFails(setDoc(doc(d, paths.stats), { approvedCount: increment(-1), lastOwnerRemoval: 'p1' }, { merge: true }));
    await assertFails(updateDoc(doc(d, paths.photo('p1')), {
      status: 'removed', reviewedAt: serverTimestamp(), reviewedBy: 'owner',
    }));
  });
});

describe('settings (config/app)', () => {
  beforeEach(async () => { await seed(env); });

  it('an admin can change every setting; uploadsChangedAt is stamped on flip', async () => {
    await assertSucceeds(updateConfig(modBackend(env), {
      uploadsOpen: false,
      eventName: 'SGU Day 2026',
      closesAt: Timestamp.fromMillis(Date.now() + 3_600_000),
      maxSubmitsPerUser: 5,
      allowGallery: false,
      removedRetentionHours: 12,
      marqueePxPerSec: 40,
      showNames: false,
      arrivalCard: true,
      qrUrl: 'https://photowall-gdgocsgu.web.app/?utm_source=qr',
      frames: [{ id: 'f02-aws', enabled: true }, { id: 'f01-gdgoc', enabled: false }],
    }));
    expect(await readAs(paths.config)).toHaveProperty('uploadsChangedAt');
  });

  it('plain moderators and guests cannot change settings', async () => {
    await assertFails(updateConfig(modBackend(env, MOD2_EMAIL), { eventName: 'x' }));
    await assertFails(setDoc(doc(db(guest(env, 'alice')), paths.config), { uploadsOpen: true, eventName: 'x' }));
  });

  it('refuses invalid settings', async () => {
    const a = modBackend(env);
    await assertFails(updateConfig(a, { maxSubmitsPerUser: 50 }));
    await assertFails(updateConfig(a, { qrUrl: 'http://insecure.example' }));
    await assertFails(updateConfig(a, { autoApprove: true } as never));
  });

  it('refuses flipping uploadsOpen without the server stamp', async () => {
    await assertFails(updateDoc(doc(db(moderator(env)), paths.config), { uploadsOpen: false }));
  });
});

describe('moderators allowlist', () => {
  beforeEach(async () => { await seed(env); });
  const admin = (): Backend => modBackend(env);

  it('any moderator can list it; guests cannot', async () => {
    await assertSucceeds(getDocs(collection(db(moderator(env, MOD2_EMAIL)), 'moderators')));
    await assertFails(getDocs(collection(db(guest(env, 'alice')), 'moderators')));
  });

  it('an admin adds and removes moderators', async () => {
    await assertSucceeds(saveModerator(admin(), 'New.Person@Gmail.com', { role: 'moderator', name: 'Mai', org: 'AWS SC' }));
    expect(await readAs('moderators/new.person@gmail.com')).toMatchObject({ role: 'moderator', name: 'Mai' });
    await assertSucceeds(deleteModerator(admin(), 'new.person@gmail.com'));
  });

  it('plain moderators cannot manage the list', async () => {
    await assertFails(saveModerator(modBackend(env, MOD2_EMAIL), 'x@example.com', { role: 'admin' }));
    await assertFails(deleteModerator(modBackend(env, MOD2_EMAIL), MOD_EMAIL));
  });

  it('refuses uppercase ids and unknown roles', async () => {
    await assertFails(setDoc(doc(db(moderator(env)), 'moderators/Bad@Example.com'), { role: 'moderator' }));
    await assertFails(saveModerator(admin(), 'x@example.com', { role: 'owner' as never }));
  });

  it('an admin cannot demote or delete themselves', async () => {
    await assertFails(saveModerator(admin(), MOD_EMAIL, { role: 'moderator' }));
    await assertFails(deleteModerator(admin(), MOD_EMAIL));
  });
});

describe('reading', () => {
  beforeEach(async () => {
    await seed(env, {
      docs: {
        [paths.photo('p1')]: reviewedPhoto('alice', 'p1', 'approved', 10),
        [paths.photo('p2')]: storedPhoto('alice', 'p2', 'pending'),
      },
    });
  });

  it('big screen can list approved photos only', async () => {
    const d = db(guest(env, 'screen'));
    const approved = query(collection(d, 'photos'), where('status', '==', 'approved'), orderBy('reviewedAt', 'desc'), limit(200));
    await assertSucceeds(getDocs(approved));
    await assertFails(getDocs(query(collection(d, 'photos'), where('status', '==', 'pending'))));
    await assertFails(getDocs(collection(d, 'photos')));
  });

  it("a guest cannot read someone else's pending photo, the owner can", async () => {
    await assertFails(getDoc(doc(db(guest(env, 'bob')), paths.photo('p2'))));
    await assertSucceeds(getDoc(doc(db(guest(env, 'alice')), paths.photo('p2'))));
    await assertSucceeds(getDocs(query(collection(db(guest(env, 'alice')), 'photos'), where('ownerUid', '==', 'alice'))));
  });

  it('moderators can list every tab', async () => {
    const d = db(moderator(env, MOD2_EMAIL));
    await assertSucceeds(getDocs(query(collection(d, 'photos'), where('status', '==', 'pending'), orderBy('submittedAt'))));
    await assertSucceeds(getDocs(query(collection(d, 'photos'), where('status', 'in', ['rejected', 'removed']), orderBy('reviewedAt', 'desc'))));
  });

  it("users cannot read other users' ledgers", async () => {
    await assertFails(getDoc(doc(db(guest(env, 'bob')), paths.user('alice'))));
  });
});

describe('scheduled wipe (M02 "Xoá toàn bộ dữ liệu sau sự kiện")', () => {
  const inHours = (h: number) => Timestamp.fromMillis(Date.now() + h * 3_600_000);
  const schedule = (over: Record<string, unknown> = {}) => ({
    at: inHours(-1), requestedBy: MOD_EMAIL, confirmedBy: ADMIN2_EMAIL, executedAt: null, ...over,
  });

  it('an admin schedules a future wipe; moderators and past dates are refused', async () => {
    await seed(env);
    await assertFails(scheduleDeletion(modBackend(env, MOD2_EMAIL), new Date(Date.now() + 86_400_000)));
    await assertFails(scheduleDeletion(modBackend(env), new Date(Date.now() - 60_000)));
    await assertSucceeds(scheduleDeletion(modBackend(env), new Date(Date.now() + 86_400_000)));
    expect((await readAs(paths.config)).deletionSchedule).toMatchObject({ requestedBy: MOD_EMAIL, confirmedBy: null });
  });

  it('needs a second, different admin to confirm', async () => {
    await seed(env, { config: { deletionSchedule: schedule({ at: inHours(24), confirmedBy: null }) } });
    await assertFails(confirmDeletion(modBackend(env)));
    await assertFails(confirmDeletion(modBackend(env, MOD2_EMAIL)));
    await assertSucceeds(confirmDeletion(modBackend(env, ADMIN2_EMAIL)));
  });

  it('any admin can cancel before it runs', async () => {
    await seed(env, { config: { deletionSchedule: schedule({ at: inHours(24) }) } });
    await assertFails(cancelDeletion(modBackend(env, MOD2_EMAIL)));
    await assertSucceeds(cancelDeletion(modBackend(env, ADMIN2_EMAIL)));
  });

  it('refuses deleting before the date or without confirmation', async () => {
    for (const s of [schedule({ at: inHours(24) }), schedule({ confirmedBy: null })]) {
      await seed(env, {
        config: { deletionSchedule: s },
        docs: { [paths.photo('p1')]: reviewedPhoto('alice', 'p1', 'approved', 60) },
      });
      await assertFails(deleteDoc(doc(db(moderator(env)), paths.photo('p1'))));
      expect(await runDueDeletion(modBackend(env))).toBeNull();
    }
  });

  it('when due and confirmed, an admin wipes photos, ledgers and the counter', async () => {
    await seed(env, {
      config: { deletionSchedule: schedule() },
      docs: {
        [paths.photo('p1')]: reviewedPhoto('alice', 'p1', 'approved', 60, { momentNo: 1 }),
        [paths.photo('p2')]: storedPhoto('bob', 'p2', 'pending'),
        [paths.user('alice')]: { lastSubmitAt: secondsAgo(100), lastPhotoId: 'p1', submitCount: 1 },
        [paths.stats]: { approvedCount: 1, momentSeq: 1 },
      },
    });
    await assertFails(deleteDoc(doc(db(moderator(env, MOD2_EMAIL)), paths.photo('p1'))));
    expect(await runDueDeletion(modBackend(env))).toEqual({ photos: 2, users: 1 });
    expect(await readAs(paths.photo('p1'))).toBeUndefined();
    expect(await readAs(paths.stats)).toBeUndefined();
    expect(await readAs(paths.moderator(MOD_EMAIL))).toBeDefined();
    const c = await readAs(paths.config);
    expect(c.uploadsOpen).toBe(true);
    expect((c.deletionSchedule as { executedAt: unknown }).executedAt).toBeTruthy();
    expect(await runDueDeletion(modBackend(env))).toBeNull();
  });
});
