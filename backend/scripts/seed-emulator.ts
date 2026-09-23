// Seeds the local emulator with config and the moderator allowlist.
//   npm run seed -- admin1@gmail.com admin2@gmail.com --mod mod1@gmail.com
// Emails after --mod get role 'moderator'; the rest get 'admin'.
// (emulators must be running: `npm run emulators`)
import { pathToFileURL } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, type Firestore } from 'firebase/firestore';
import { paths, type AppConfig } from '../src/schema';

export const EMULATOR_PROJECT = 'demo-photowall';

export async function seedEmulator(
  adminEmails: string[], opts: { clear?: boolean; moderators?: string[] } = {},
) {
  const env = await initializeTestEnvironment({
    projectId: EMULATOR_PROJECT,
    firestore: { host: '127.0.0.1', port: 8080 },
    storage: { host: '127.0.0.1', port: 9199 },
  });
  if (opts.clear) {
    await env.clearFirestore();
    await env.clearStorage();
  }
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    const config: AppConfig = { uploadsOpen: true, eventName: 'SGU Day 2026' };
    await setDoc(doc(db, paths.config), config);
    for (const email of adminEmails) await setDoc(doc(db, paths.moderator(email)), { role: 'admin' });
    for (const email of opts.moderators ?? []) await setDoc(doc(db, paths.moderator(email)), { role: 'moderator' });
  });
  await env.cleanup();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const split = argv.indexOf('--mod');
  const admins = split < 0 ? argv : argv.slice(0, split);
  const moderators = split < 0 ? [] : argv.slice(split + 1);
  const adminList = admins.length ? admins : ['mod@example.com'];
  await seedEmulator(adminList, { moderators });
  console.log(`Seeded config · admin: ${adminList.join(', ')}${moderators.length ? ` · moderator: ${moderators.join(', ')}` : ''}`);
}
