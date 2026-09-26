// One place to create the Firebase instances the client helpers take.
// App Check must be initialised before any Firestore/Storage call, so every
// screen should get its Backend from here.
import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { connectEmulators, type Backend } from './client';
import { firebaseConfig, recaptchaSiteKey } from './firebase-config';

export interface InitOptions {
  /** Use the local emulators (`npm run emulators` in backend/) instead of production. */
  emulators?: boolean;
}

export function initBackend(opts: InitOptions = {}): Backend {
  if (opts.emulators) {
    const app = initializeApp({ ...firebaseConfig, projectId: 'demo-photowall', storageBucket: 'demo-photowall.appspot.com' });
    const b = { auth: getAuth(app), db: getFirestore(app), storage: getStorage(app) };
    connectEmulators(b);
    return b;
  }
  const app = initializeApp(firebaseConfig);
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
  const storage = getStorage(app);
  // The SDK would keep retrying a stalled upload for 10 minutes behind "Vài
  // giây thôi". Give up sooner so the guest gets "Gửi lại" while still at the booth.
  storage.maxUploadRetryTime = 45_000;
  storage.maxOperationRetryTime = 20_000;
  return { auth: getAuth(app), db: getFirestore(app), storage };
}
