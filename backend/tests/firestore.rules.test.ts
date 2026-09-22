import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection, doc, getDoc, getDocs, increment, limit, orderBy, query, runTransaction,
  serverTimestamp, setDoc, updateDoc, where, writeBatch, type Firestore,
} from 'firebase/firestore';
import { paths } from '../src/schema';
import {
  createEnv, guest, MOD_EMAIL, moderator, secondsAgo, seed, storedPhoto, submitBatch,
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

  it('rejects the 21st submission', async () => {
    await seed(env, {
      docs: { [paths.user('alice')]: { lastSubmitAt: secondsAgo(61), lastPhotoId: 'p0', submitCount: 20 } },
    });
    await assertFails(submitBatch(db(guest(env, 'alice')), 'alice', 'p1').commit());
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
    await assertFails(submitBatch(d, 'alice', 'p1', { displayName: 'x'.repeat(41) }).commit());
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

describe('moderation', () => {
  beforeEach(async () => {
    await seed(env, { docs: { [paths.photo('p1')]: storedPhoto('alice', 'p1', 'pending') } });
  });

  const review = (d: Firestore, status: string, email = MOD_EMAIL) =>
    updateDoc(doc(d, paths.photo('p1')), { status, reviewedAt: serverTimestamp(), reviewedBy: email });

  it('lets a moderator approve and bump the counter in one batch', async () => {
    const d = db(moderator(env));
    const batch = writeBatch(d);
    batch.update(doc(d, paths.photo('p1')), { status: 'approved', reviewedAt: serverTimestamp(), reviewedBy: MOD_EMAIL });
    batch.set(doc(d, paths.stats), { approvedCount: increment(1) }, { merge: true });
    await assertSucceeds(batch.commit());
  });

  it('lets a moderator reject', async () => {
    await assertSucceeds(review(db(moderator(env)), 'rejected'));
  });

  it('forbids guests and non-allowlisted Google accounts from reviewing', async () => {
    await assertFails(review(db(guest(env, 'alice')), 'approved', 'alice'));
    await assertFails(review(db(moderator(env, 'stranger@example.com')), 'approved', 'stranger@example.com'));
    const unverified = env.authenticatedContext('u', { email: MOD_EMAIL, email_verified: false });
    await assertFails(review(db(unverified), 'approved'));
  });

  it('forbids spoofing reviewedBy', async () => {
    await assertFails(review(db(moderator(env)), 'approved', 'someone@else.com'));
  });

  it('lets only one of two concurrent moderators win', async () => {
    const first = db(moderator(env));
    await assertSucceeds(review(first, 'approved'));
    await assertFails(review(db(moderator(env)), 'rejected'));
  });

  it('approve inside a transaction fails once the photo is no longer pending', async () => {
    await assertSucceeds(review(db(moderator(env)), 'rejected'));
    const d = db(moderator(env));
    await assertFails(runTransaction(d, async (tx) => {
      const ref = doc(d, paths.photo('p1'));
      await tx.get(ref);
      tx.update(ref, { status: 'approved', reviewedAt: serverTimestamp(), reviewedBy: MOD_EMAIL });
    }));
  });

  it('allows approved → removed but not rejected → approved', async () => {
    const d = db(moderator(env));
    await assertSucceeds(review(d, 'approved'));
    await assertSucceeds(review(d, 'removed'));
    await assertFails(review(d, 'approved'));
  });

  it('only allows the counter to move by exactly one', async () => {
    const d = db(moderator(env));
    await assertSucceeds(setDoc(doc(d, paths.stats), { approvedCount: increment(1) }, { merge: true }));
    await assertFails(setDoc(doc(d, paths.stats), { approvedCount: increment(5) }, { merge: true }));
    await assertSucceeds(setDoc(doc(d, paths.stats), { approvedCount: increment(-1) }, { merge: true }));
    await assertFails(setDoc(doc(db(guest(env, 'alice')), paths.stats), { approvedCount: increment(1) }, { merge: true }));
  });

  it('lets moderators toggle uploadsOpen, not guests', async () => {
    await assertSucceeds(setDoc(doc(db(moderator(env)), paths.config), { uploadsOpen: false, eventName: 'SGU Day' }));
    await assertFails(setDoc(doc(db(guest(env, 'alice')), paths.config), { uploadsOpen: true, eventName: 'SGU Day' }));
  });
});

describe('reading', () => {
  beforeEach(async () => {
    await seed(env, {
      docs: {
        [paths.photo('p1')]: { ...storedPhoto('alice', 'p1', 'approved'), reviewedAt: secondsAgo(10), reviewedBy: MOD_EMAIL },
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

  it('a guest cannot read someone else\'s pending photo, the owner can', async () => {
    await assertFails(getDoc(doc(db(guest(env, 'bob')), paths.photo('p2'))));
    await assertSucceeds(getDoc(doc(db(guest(env, 'alice')), paths.photo('p2'))));
    await assertSucceeds(getDocs(query(collection(db(guest(env, 'alice')), 'photos'), where('ownerUid', '==', 'alice'))));
  });

  it('moderators can list the pending queue', async () => {
    const d = db(moderator(env));
    await assertSucceeds(getDocs(query(collection(d, 'photos'), where('status', '==', 'pending'), orderBy('submittedAt'))));
  });

  it('users cannot read other users\' ledgers', async () => {
    await assertFails(getDoc(doc(db(guest(env, 'bob')), paths.user('alice'))));
  });
});
