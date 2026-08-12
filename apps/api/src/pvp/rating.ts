/** Elo-like rating helpers for PvP ladder. */

export const RATING_DEFAULT = 1000;
export const RATING_K = 32;

export function expectedScore(ratingA: number, ratingB: number) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/** Returns new ratings after A plays B. scoreA: 1 win, 0 loss, 0.5 draw. */
export function applyElo(
  ratingA: number,
  ratingB: number,
  scoreA: number,
  k = RATING_K,
): { a: number; b: number; deltaA: number; deltaB: number } {
  const ea = expectedScore(ratingA, ratingB);
  const eb = 1 - ea;
  const nextA = Math.round(ratingA + k * (scoreA - ea));
  const nextB = Math.round(ratingB + k * (1 - scoreA - eb));
  return {
    a: Math.max(100, nextA),
    b: Math.max(100, nextB),
    deltaA: nextA - ratingA,
    deltaB: nextB - ratingB,
  };
}
