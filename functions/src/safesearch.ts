// Pure SafeSearch decisions, kept apart from the trigger so they can be tested
// without Cloud Vision. Constants mirror backend/src/schema.ts — change both.

export const LIKELIHOODS = ['UNKNOWN', 'VERY_UNLIKELY', 'UNLIKELY', 'POSSIBLE', 'LIKELY', 'VERY_LIKELY'] as const;
export type Likelihood = (typeof LIKELIHOODS)[number];

export const SAFESEARCH_THRESHOLDS = ['POSSIBLE', 'LIKELY', 'VERY_LIKELY'] as const;
export type SafeSearchThreshold = (typeof SAFESEARCH_THRESHOLDS)[number];

export const SAFESEARCH_CATEGORIES = ['adult', 'violence', 'racy'] as const;
export type SafeSearchCategory = (typeof SAFESEARCH_CATEGORIES)[number];
export type SafeSearchResult = Record<SafeSearchCategory, Likelihood>;

/** Vision sends the enum as its name or its index; anything else counts as UNKNOWN. */
export function toLikelihood(value: unknown): Likelihood {
  if (typeof value === 'number') return LIKELIHOODS[value] ?? 'UNKNOWN';
  return (LIKELIHOODS as readonly unknown[]).includes(value) ? (value as Likelihood) : 'UNKNOWN';
}

/** A missing or unrecognised setting falls back to the strictest threshold, POSSIBLE. */
export function toThreshold(value: unknown): SafeSearchThreshold {
  return (SAFESEARCH_THRESHOLDS as readonly unknown[]).includes(value) ? (value as SafeSearchThreshold) : 'POSSIBLE';
}

/**
 * Categories rated at or above the threshold, or that Vision could not rate —
 * those go to a person too. Empty = safe to put on the wall.
 */
export function flaggedCategories(result: SafeSearchResult, threshold: SafeSearchThreshold): SafeSearchCategory[] {
  const bar = LIKELIHOODS.indexOf(threshold);
  return SAFESEARCH_CATEGORIES.filter((c) => result[c] === 'UNKNOWN' || LIKELIHOODS.indexOf(result[c]) >= bar);
}
