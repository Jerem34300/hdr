/**
 * Limite le nombre de RPC PostgREST en vol (pool Micro ≈ 10).
 * Chaque client n'en ouvre que quelques-unes à la fois → 80 personnes
 * ne saturent plus le pool dès l'ouverture de la carte.
 */
const MAX = 3;
let inflight = 0;
const waiters: Array<() => void> = [];

function release() {
  inflight = Math.max(0, inflight - 1);
  const next = waiters.shift();
  if (next) next();
}

/** Enveloppe une promesse RPC : attend un créneau libre avant d'exécuter. */
export async function withRpcGate<T>(run: () => Promise<T>): Promise<T> {
  if (inflight >= MAX) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  inflight++;
  try {
    return await run();
  } finally {
    release();
  }
}
