// "Tự động duyệt" (M02). The one piece of PhotoWall that runs on a server: a
// guest's browser cannot be trusted to approve its own strip, so SafeSearch and
// the approval happen here, with the Admin SDK.
//
// Flow: a strip goes uploading -> pending (the guest's last write) -> if
// config/app.autoApprove is on, Cloud Vision rates it -> nothing at or above
// "Ngưỡng SafeSearch" -> approved exactly like a moderator's "Duyệt", with
// reviewedBy 'auto'. Anything flagged, or any error, stays in Chờ duyệt with
// the ratings stored for the moderator to see.
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { flaggedCategories, toLikelihood, toThreshold, type SafeSearchResult } from './safesearch.js';

initializeApp();
const db = getFirestore();
let vision: ImageAnnotatorClient | undefined;

/** Mirrors AUTO_REVIEWER in backend/src/schema.ts. */
const AUTO_REVIEWER = 'auto';

async function rate(photoId: string): Promise<SafeSearchResult> {
  // Emulator only: Vision has no emulator, so a local run can pin the ratings.
  const fake = process.env.FUNCTIONS_EMULATOR === 'true' ? process.env.PW_FAKE_SAFESEARCH : undefined;
  if (fake) return JSON.parse(fake) as SafeSearchResult;

  const uri = `gs://${getStorage().bucket().name}/photos/${photoId}/strip.jpg`;
  const [res] = await (vision ??= new ImageAnnotatorClient()).safeSearchDetection(uri);
  if (res.error?.message) throw new Error(res.error.message);
  const a = res.safeSearchAnnotation;
  if (!a) throw new Error('no safeSearchAnnotation');
  return { adult: toLikelihood(a.adult), violence: toLikelihood(a.violence), racy: toLikelihood(a.racy) };
}

export const autoApprove = onDocumentUpdated(
  // Same region as the Firestore database; a handful of instances is plenty for one event.
  { document: 'photos/{photoId}', region: 'asia-southeast1', memory: '256MiB', maxInstances: 5 },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (before?.status !== 'uploading' || after?.status !== 'pending') return;

    const config = (await db.doc('config/app').get()).data();
    if (config?.autoApprove !== true) return;

    const photoId = event.params.photoId;
    let result: SafeSearchResult;
    try {
      result = await rate(photoId);
    } catch (e) {
      logger.error('SafeSearch failed; left for a moderator', { photoId, error: String(e) });
      return;
    }
    const flags = flaggedCategories(result, toThreshold(config.safeSearchThreshold));

    const photoRef = db.doc(`photos/${photoId}`);
    const statsRef = db.doc('stats/public');
    await db.runTransaction(async (tx) => {
      const [photo, stats] = await Promise.all([tx.get(photoRef), tx.get(statsRef)]);
      const cur = photo.data();
      if (!cur) return; // wiped meanwhile
      // A moderator got there first, or SafeSearch flagged it: keep the ratings only.
      if (cur.status !== 'pending' || flags.length > 0) {
        tx.update(photoRef, { safeSearch: result });
        return;
      }
      const update: Record<string, unknown> = {
        safeSearch: result,
        status: 'approved',
        reviewedAt: FieldValue.serverTimestamp(),
        reviewedBy: AUTO_REVIEWER,
      };
      const statsUpdate: Record<string, unknown> = { approvedCount: FieldValue.increment(1) };
      if (cur.momentNo == null) {
        const n = (stats.data()?.momentSeq ?? 0) + 1;
        update.momentNo = n;
        statsUpdate.momentSeq = n;
      }
      tx.update(photoRef, update);
      tx.set(statsRef, statsUpdate, { merge: true });
    });
    logger.info(flags.length ? 'flagged' : 'auto-approved', { photoId, result, flags });
  },
);
