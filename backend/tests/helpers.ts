import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  doc, increment, serverTimestamp, setDoc, Timestamp, writeBatch, type Firestore,
} from 'firebase/firestore';
import { paths } from '../src/schema';

export const MOD_EMAIL = 'mod@example.com';

export async function createEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: 'demo-photowall',
    firestore: { rules: readFileSync(resolve(import.meta.dirname, '../firestore.rules'), 'utf8') },
    storage: { rules: readFileSync(resolve(import.meta.dirname, '../storage.rules'), 'utf8') },
  });
}

export function guest(env: RulesTestEnvironment, uid: string) {
  return env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } } as never);
}

export function moderator(env: RulesTestEnvironment, email = MOD_EMAIL) {
  return env.authenticatedContext(`mod-${email}`, { email, email_verified: true });
}

/** Seeds config, moderator allowlist and optional extra docs with rules disabled. */
export async function seed(
  env: RulesTestEnvironment,
  opts: { uploadsOpen?: boolean; docs?: Record<string, Record<string, unknown>> } = {},
) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    await setDoc(doc(db, paths.config), { uploadsOpen: opts.uploadsOpen ?? true, eventName: 'SGU Day' });
    await setDoc(doc(db, paths.moderator(MOD_EMAIL)), {});
    for (const [path, data] of Object.entries(opts.docs ?? {})) {
      await setDoc(doc(db, path), data);
    }
  });
}

export function photoFields(uid: string, photoId: string) {
  return {
    ownerUid: uid,
    displayName: 'Khả',
    frameVariant: 'light',
    status: 'uploading',
    storagePath: paths.photoObject(photoId),
    createdAt: serverTimestamp(),
  };
}

/** The exact write the client performs to start a submission. */
export function submitBatch(
  db: Firestore, uid: string, photoId: string, photoOverrides: Record<string, unknown> = {},
) {
  const batch = writeBatch(db);
  batch.set(doc(db, paths.photo(photoId)), { ...photoFields(uid, photoId), ...photoOverrides });
  batch.set(
    doc(db, paths.user(uid)),
    { lastSubmitAt: serverTimestamp(), lastPhotoId: photoId, submitCount: increment(1) },
    { merge: true },
  );
  return batch;
}

export function secondsAgo(s: number) {
  return Timestamp.fromMillis(Date.now() - s * 1000);
}

/** A stored photo doc in the given status, as it would look after the owner submitted it. */
export function storedPhoto(uid: string, photoId: string, status: string) {
  return {
    ownerUid: uid,
    displayName: 'Khả',
    frameVariant: 'light',
    status,
    storagePath: paths.photoObject(photoId),
    createdAt: secondsAgo(120),
    submittedAt: secondsAgo(100),
  };
}
