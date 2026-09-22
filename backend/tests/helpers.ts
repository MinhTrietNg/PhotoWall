import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeTestEnvironment, type RulesTestEnvironment, type RulesTestContext } from '@firebase/rules-unit-testing';
import type { Auth } from 'firebase/auth';
import {
  doc, increment, serverTimestamp, setDoc, Timestamp, writeBatch, type Firestore,
} from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';
import type { Backend } from '../src/client';
import { paths } from '../src/schema';

/** Seeded with role 'admin'. */
export const MOD_EMAIL = 'mod@example.com';
/** Seeded with role 'moderator'. */
export const MOD2_EMAIL = 'mod2@example.com';

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

/** Wraps a test context so the real client helpers in src/client.ts can run against the rules. */
export function asBackend(ctx: RulesTestContext, user: { uid: string; email?: string }): Backend {
  return {
    auth: { currentUser: user } as unknown as Auth,
    db: ctx.firestore() as unknown as Firestore,
    storage: ctx.storage() as unknown as FirebaseStorage,
  };
}

export const guestBackend = (env: RulesTestEnvironment, uid: string) => asBackend(guest(env, uid), { uid });
export const modBackend = (env: RulesTestEnvironment, email = MOD_EMAIL) =>
  asBackend(moderator(env, email), { uid: `mod-${email}`, email });

/** Seeds config, moderator allowlist and optional extra docs with rules disabled. */
export async function seed(
  env: RulesTestEnvironment,
  opts: {
    uploadsOpen?: boolean;
    config?: Record<string, unknown>;
    docs?: Record<string, Record<string, unknown>>;
  } = {},
) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    await setDoc(doc(db, paths.config), { uploadsOpen: opts.uploadsOpen ?? true, eventName: 'SGU Day', ...opts.config });
    await setDoc(doc(db, paths.moderator(MOD_EMAIL)), { role: 'admin' });
    await setDoc(doc(db, paths.moderator(MOD2_EMAIL)), { role: 'moderator' });
    for (const [path, data] of Object.entries(opts.docs ?? {})) {
      await setDoc(doc(db, path), data);
    }
  });
}

export function photoFields(uid: string, photoId: string) {
  return {
    ownerUid: uid,
    displayName: 'Khả',
    frameVariant: 'f01-gdgoc',
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

export const hoursAgo = (h: number) => secondsAgo(h * 3600);

/** A stored photo doc in the given status, as it would look after the owner submitted it. */
export function storedPhoto(uid: string, photoId: string, status: string, extra: Record<string, unknown> = {}) {
  return {
    ownerUid: uid,
    displayName: 'Khả',
    frameVariant: 'f01-gdgoc',
    status,
    storagePath: paths.photoObject(photoId),
    createdAt: secondsAgo(120),
    submittedAt: secondsAgo(100),
    ...extra,
  };
}

/** A photo a moderator reviewed `ago` seconds ago. */
export function reviewedPhoto(
  uid: string, photoId: string, status: string, ago: number, extra: Record<string, unknown> = {},
) {
  return storedPhoto(uid, photoId, status, { reviewedAt: secondsAgo(ago), reviewedBy: MOD_EMAIL, ...extra });
}
