declare module '@tfw/game' {
  export function simulatePvpBattle(...args: unknown[]): unknown;
  export function estimateSquadPower(...args: unknown[]): number;
  export function createInitialState(...args: unknown[]): unknown;
  export function seededRng(seed: number): () => number;
  const mod: Record<string, unknown>;
  export default mod;
}
