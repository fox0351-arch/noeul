export type ReviewEngine = 'legacy' | 'ai';

const KEY = 'noeul.reviewEngine.v1';

export function readReviewEngine(): ReviewEngine {
  if (typeof window === 'undefined') return 'legacy';
  return window.localStorage.getItem(KEY) === 'ai' ? 'ai' : 'legacy';
}

export function writeReviewEngine(engine: ReviewEngine): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, engine);
}
