import { describe, expect, it } from 'vitest';
import { flaggedCategories, toLikelihood, toThreshold, type SafeSearchResult } from './safesearch.js';

const clean: SafeSearchResult = { adult: 'VERY_UNLIKELY', violence: 'UNLIKELY', racy: 'UNLIKELY' };

describe('flaggedCategories', () => {
  it('passes a clean strip at every threshold', () => {
    for (const t of ['POSSIBLE', 'LIKELY', 'VERY_LIKELY'] as const) expect(flaggedCategories(clean, t)).toEqual([]);
  });

  it('flags a category at or above the threshold, not below it', () => {
    const racy: SafeSearchResult = { ...clean, racy: 'POSSIBLE' };
    expect(flaggedCategories(racy, 'POSSIBLE')).toEqual(['racy']);
    expect(flaggedCategories(racy, 'LIKELY')).toEqual([]);
  });

  it('sends a category Vision could not rate to a person', () => {
    expect(flaggedCategories({ ...clean, violence: 'UNKNOWN' }, 'VERY_LIKELY')).toEqual(['violence']);
  });

  it('names every flagged category', () => {
    const bad: SafeSearchResult = { adult: 'VERY_LIKELY', violence: 'LIKELY', racy: 'UNLIKELY' };
    expect(flaggedCategories(bad, 'LIKELY')).toEqual(['adult', 'violence']);
    expect(flaggedCategories(bad, 'VERY_LIKELY')).toEqual(['adult']);
  });
});

describe('parsing', () => {
  it('reads Vision likelihoods as names or indexes', () => {
    expect(toLikelihood('LIKELY')).toBe('LIKELY');
    expect(toLikelihood(5)).toBe('VERY_LIKELY');
    expect(toLikelihood(null)).toBe('UNKNOWN');
    expect(toLikelihood('NOPE')).toBe('UNKNOWN');
  });

  it('falls back to the strictest threshold', () => {
    expect(toThreshold('VERY_LIKELY')).toBe('VERY_LIKELY');
    expect(toThreshold(undefined)).toBe('POSSIBLE');
    expect(toThreshold('UNLIKELY')).toBe('POSSIBLE');
  });
});
