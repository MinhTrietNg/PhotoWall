import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteObject, getBytes, ref, uploadBytes, type FirebaseStorage } from 'firebase/storage';
import { LIMITS, paths } from '../src/schema';
import { Timestamp } from 'firebase/firestore';
import { ADMIN2_EMAIL, createEnv, guest, MOD2_EMAIL, MOD_EMAIL, moderator, reviewedPhoto, seed, storedPhoto } from './helpers';

let env: RulesTestEnvironment;
const st = (ctx: { storage(): unknown }) => ctx.storage() as FirebaseStorage;
const jpeg = { contentType: 'image/jpeg' };
const small = new Uint8Array(1024);

beforeAll(async () => { env = await createEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
});

async function seedPhoto(status: string) {
  await seed(env, { docs: { [paths.photo('p1')]: storedPhoto('alice', 'p1', status) } });
}

async function seedObject() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(st(ctx), paths.photoObject('p1')), small, jpeg);
  });
}

describe('uploading', () => {
  it('lets the owner upload while the photo is uploading', async () => {
    await seedPhoto('uploading');
    await assertSucceeds(uploadBytes(ref(st(guest(env, 'alice')), paths.photoObject('p1')), small, jpeg));
  });

  it('rejects upload once the photo is pending', async () => {
    await seedPhoto('pending');
    await assertFails(uploadBytes(ref(st(guest(env, 'alice')), paths.photoObject('p1')), small, jpeg));
  });

  it('rejects upload with no photo doc', async () => {
    await seed(env);
    await assertFails(uploadBytes(ref(st(guest(env, 'alice')), paths.photoObject('p1')), small, jpeg));
  });

  it('rejects upload by a non-owner', async () => {
    await seedPhoto('uploading');
    await assertFails(uploadBytes(ref(st(guest(env, 'bob')), paths.photoObject('p1')), small, jpeg));
  });

  it('rejects files of 2 MB or more', async () => {
    await seedPhoto('uploading');
    const big = new Uint8Array(LIMITS.maxUploadBytes);
    await assertFails(uploadBytes(ref(st(guest(env, 'alice')), paths.photoObject('p1')), big, jpeg));
  });

  it('rejects non-JPEG content', async () => {
    await seedPhoto('uploading');
    await assertFails(uploadBytes(ref(st(guest(env, 'alice')), paths.photoObject('p1')), small, { contentType: 'image/png' }));
  });

  it('rejects any path outside photos/{id}/strip.jpg and thumb.jpg', async () => {
    await seedPhoto('uploading');
    await assertFails(uploadBytes(ref(st(guest(env, 'alice')), 'photos/p1/evil.jpg'), small, jpeg));
  });
});

describe('thumb', () => {
  it('lets the owner upload the thumb while the photo is uploading, not after', async () => {
    await seedPhoto('uploading');
    await assertSucceeds(uploadBytes(ref(st(guest(env, 'alice')), paths.photoThumb('p1')), small, jpeg));
    await seedPhoto('pending');
    await assertFails(uploadBytes(ref(st(guest(env, 'alice')), paths.photoThumb('p1')), small, jpeg));
  });

  it('rejects a thumb of 300 KB or more, and a non-owner', async () => {
    await seedPhoto('uploading');
    const big = new Uint8Array(LIMITS.maxThumbBytes);
    await assertFails(uploadBytes(ref(st(guest(env, 'alice')), paths.photoThumb('p1')), big, jpeg));
    await assertFails(uploadBytes(ref(st(guest(env, 'bob')), paths.photoThumb('p1')), small, jpeg));
  });

  it('is readable by others only once approved', async () => {
    await seedPhoto('pending');
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(st(ctx), paths.photoThumb('p1')), small, jpeg);
    });
    await assertFails(getBytes(ref(st(guest(env, 'screen')), paths.photoThumb('p1'))));
    await assertSucceeds(getBytes(ref(st(moderator(env)), paths.photoThumb('p1'))));
    await seedPhoto('approved');
    await assertSucceeds(getBytes(ref(st(guest(env, 'screen')), paths.photoThumb('p1'))));
  });
});

describe('reading and deleting', () => {
  it('anyone signed in can read an approved photo', async () => {
    await seedPhoto('approved');
    await seedObject();
    await assertSucceeds(getBytes(ref(st(guest(env, 'screen')), paths.photoObject('p1'))));
  });

  it('only owner and moderators can read a pending photo', async () => {
    await seedPhoto('pending');
    await seedObject();
    await assertFails(getBytes(ref(st(guest(env, 'bob')), paths.photoObject('p1'))));
    await assertSucceeds(getBytes(ref(st(guest(env, 'alice')), paths.photoObject('p1'))));
    await assertSucceeds(getBytes(ref(st(moderator(env)), paths.photoObject('p1'))));
  });

  it('moderators delete a removed strip only after the retention window', async () => {
    await seed(env, { docs: { [paths.photo('p1')]: reviewedPhoto('alice', 'p1', 'rejected', 60) } });
    await seedObject();
    await assertFails(deleteObject(ref(st(moderator(env)), paths.photoObject('p1'))));
    await assertFails(deleteObject(ref(st(guest(env, 'alice')), paths.photoObject('p1'))));

    await seed(env, { docs: { [paths.photo('p1')]: reviewedPhoto('alice', 'p1', 'rejected', 25 * 3600) } });
    await assertSucceeds(deleteObject(ref(st(moderator(env)), paths.photoObject('p1'))));
  });

  it('moderators never delete a strip that is on the wall', async () => {
    await seed(env, { docs: { [paths.photo('p1')]: reviewedPhoto('alice', 'p1', 'approved', 25 * 3600) } });
    await seedObject();
    await assertFails(deleteObject(ref(st(moderator(env)), paths.photoObject('p1'))));
  });

  it('a guest cannot delete the file even after removing their own strip', async () => {
    await seed(env, {
      docs: { [paths.photo('p1')]: reviewedPhoto('alice', 'p1', 'removed', 1, { reviewedBy: 'owner' }) },
    });
    await seedObject();
    await assertFails(deleteObject(ref(st(guest(env, 'alice')), paths.photoObject('p1'))));
  });

  it('an admin deletes any strip during a confirmed, due wipe', async () => {
    const wipe = { at: Timestamp.fromMillis(Date.now() - 60_000), requestedBy: MOD_EMAIL, confirmedBy: ADMIN2_EMAIL, executedAt: null };
    await seed(env, {
      config: { deletionSchedule: wipe },
      docs: { [paths.photo('p1')]: reviewedPhoto('alice', 'p1', 'approved', 60) },
    });
    await seedObject();
    await assertFails(deleteObject(ref(st(moderator(env, MOD2_EMAIL)), paths.photoObject('p1'))));
    await assertSucceeds(deleteObject(ref(st(moderator(env)), paths.photoObject('p1'))));
  });
});
