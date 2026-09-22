import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteObject, getBytes, ref, uploadBytes, type FirebaseStorage } from 'firebase/storage';
import { LIMITS, paths } from '../src/schema';
import { createEnv, guest, moderator, reviewedPhoto, seed, storedPhoto } from './helpers';

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

  it('rejects any path outside photos/{id}/strip.jpg', async () => {
    await seedPhoto('uploading');
    await assertFails(uploadBytes(ref(st(guest(env, 'alice')), 'photos/p1/evil.jpg'), small, jpeg));
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

  it('a guest deletes their own strip right after removing it', async () => {
    await seed(env, {
      docs: { [paths.photo('p1')]: reviewedPhoto('alice', 'p1', 'removed', 1, { reviewedBy: 'owner' }) },
    });
    await seedObject();
    await assertFails(deleteObject(ref(st(guest(env, 'bob')), paths.photoObject('p1'))));
    await assertSucceeds(deleteObject(ref(st(guest(env, 'alice')), paths.photoObject('p1'))));
  });
});
