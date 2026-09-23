/**
 * Compose -> sign in -> upload. DESIGN-D11 / D16, Claude-Plan.md §14.1.
 *
 * Two rules that are easy to get wrong and expensive at the event:
 *  1. ensureGuest() runs HERE, on send — never on page load. The venue shares
 *     one wifi IP and Firebase caps new anonymous accounts per IP.
 *  2. After `upload-failed`, retry with resumeSubmission and the SAME blob.
 *     Calling submitPhoto again trips the 60s rate limiter and strands the guest.
 */
import { useCallback, useRef, useState } from 'react';
import { composeStrip } from '@/features/frames/compose';
import { track } from '@/lib/analytics';
import { SubmitFailure, useBackend, type SubmitErrorCode } from '@/lib/backend';
import { useSession } from '@/state/SessionContext';
import type { FrameTemplate } from '@/types/frame';
import { attachPhotoId, getSubmission, setSubmission } from './submission';

type UploadPhase = 'idle' | 'composing' | 'uploading' | 'done' | 'failed';

interface UploadState {
  phase: UploadPhase;
  /** 0..1, or null for the indeterminate variant. */
  progress: number | null;
  photoId: string | null;
  errorCode: SubmitErrorCode | null;
  retryAfterSeconds?: number;
}

const INITIAL: UploadState = {
  phase: 'idle',
  progress: null,
  photoId: null,
  errorCode: null,
};

export function useUpload() {
  const backend = useBackend();
  const { session } = useSession();
  const [state, setState] = useState<UploadState>(INITIAL);
  const running = useRef(false);

  const fail = useCallback((e: unknown) => {
    const failure =
      e instanceof SubmitFailure ? e : new SubmitFailure('unknown', undefined, undefined, e);
    track('pw_upload_fail', { reason: failure.code });
    setState({
      phase: 'failed',
      progress: null,
      photoId: failure.photoId ?? getSubmission()?.photoId ?? null,
      errorCode: failure.code,
      retryAfterSeconds: failure.retryAfterSeconds,
    });
  }, []);

  /** Full path: compose the strip, sign in, send. */
  const start = useCallback(
    async (shots: readonly Blob[], frame: FrameTemplate, displayName: string) => {
      if (running.current) return;
      running.current = true;
      const startedAt = performance.now();

      try {
        setState({ ...INITIAL, phase: 'composing' });
        const { blob } = await composeStrip(shots, frame);
        setSubmission({ blob, frameId: frame.id, displayName });

        setState({ ...INITIAL, phase: 'uploading', progress: 0 });
        await backend.ensureGuest();

        const photoId = await backend.submitPhoto(
          { image: blob, displayName, frameVariant: frame.id, showName: session.showName },
          (progress) => setState((s) => ({ ...s, progress })),
        );
        attachPhotoId(photoId);

        track('pw_upload_ok', { ms: Math.round(performance.now() - startedAt), bytes: blob.size });
        setState({ phase: 'done', progress: 1, photoId, errorCode: null });
      } catch (e) {
        fail(e);
      } finally {
        running.current = false;
      }
    },
    [backend, fail, session.showName],
  );

  /** E02 retry. Reuses the blob and the photo doc already created. */
  const retry = useCallback(async () => {
    const submission = getSubmission();
    if (running.current || !submission) return;

    // No photo doc yet means the batch write itself failed, so start over.
    if (!submission.photoId) {
      setState({ ...INITIAL, phase: 'failed', errorCode: 'unknown' });
      return;
    }

    running.current = true;
    const startedAt = performance.now();
    try {
      setState({ ...INITIAL, phase: 'uploading', progress: 0 });
      await backend.resumeSubmission(submission.photoId, submission.blob, (progress) =>
        setState((s) => ({ ...s, progress })),
      );
      track('pw_upload_ok', {
        ms: Math.round(performance.now() - startedAt),
        bytes: submission.blob.size,
      });
      setState({ phase: 'done', progress: 1, photoId: submission.photoId, errorCode: null });
    } catch (e) {
      fail(e);
    } finally {
      running.current = false;
    }
  }, [backend, fail]);

  return { state, start, retry };
}
