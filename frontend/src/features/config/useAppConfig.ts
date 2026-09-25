/**
 * The live event config (M02) for the guest screens. Firestore shares one
 * listener per document, so every screen calling this costs no extra reads.
 * `undefined` while the first snapshot is on its way; null if none exists.
 */
import { useEffect, useState } from 'react';
import { useBackend, type AppConfig } from '@/lib/backend';

export function useAppConfig(): AppConfig | null | undefined {
  const backend = useBackend();
  const [config, setConfig] = useState<AppConfig | null | undefined>(undefined);
  useEffect(() => backend.watchConfig(setConfig), [backend]);
  return config;
}

/** Mirrors the rules: open, and before "Tự động đóng lúc" if one is set. */
export function acceptingUploads(config: AppConfig, now = Date.now()): boolean {
  return config.uploadsOpen && (config.closesAtMs == null || now < config.closesAtMs);
}
