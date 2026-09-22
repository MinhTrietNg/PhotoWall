// Seeds the local emulator with config and the moderator allowlist.
//   npm run seed -- mod1@gmail.com mod2@gmail.com
// (emulators must be running: `npm run emulators`)
import { pathToFileURL } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, type Firestore } from 'firebase/firestore';
import { paths, type AppConfig } from '../src/schema';

export const EMULATOR_PROJECT = 'demo-photowall';

export async function seedEmulator(moderatorEmails: string[], opts: { clear?: boolean } = {}) {
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
    for (const email of moderatorEmails) await setDoc(doc(db, paths.moderator(email)), {});
  });
  await env.cleanup();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const emails = process.argv.slice(2);
  await seedEmulator(emails.length ? emails : ['mod@example.com']);
  console.log(`Seeded config + moderators: ${emails.join(', ') || 'mod@example.com'}`);
}
