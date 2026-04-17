import type { QCStanding } from "./types";

/**
 * Generate round-robin pairings for N players.
 * Each pair plays once (or twice if gamesPerMatch > 1 with reversed colors).
 * Returns an array of rounds, each round being an array of [whiteIdx, blackIdx] pairs.
 */
export function roundRobinPairings(playerCount: number): [number, number][][] {
  // For odd player count, add a bye slot
  const n = playerCount % 2 === 0 ? playerCount : playerCount + 1;
  const rounds: [number, number][][] = [];

  // Circle method: fix player 0, rotate others
  const players = Array.from({ length: n }, (_, i) => i);

  for (let round = 0; round < n - 1; round++) {
    const pairs: [number, number][] = [];
    for (let i = 0; i < n / 2; i++) {
      const home = players[i];
      const away = players[n - 1 - i];
      // Skip bye slot (index >= playerCount)
      if (home < playerCount && away < playerCount) {
        // Alternate home/away based on round for fairness
        if (round % 2 === 0) {
          pairs.push([home, away]);
        } else {
          pairs.push([away, home]);
        }
      }
    }
    rounds.push(pairs);

    // Rotate: keep players[0] fixed, rotate rest
    const last = players.pop()!;
    players.splice(1, 0, last);
  }

  return rounds;
}

/**
 * Generate Swiss pairings for one round based on current standings.
 * Sort by score, pair top half with bottom half within each score group.
 * Returns [whiteIdx, blackIdx] pairs.
 */
export function swissPairing(
  standings: QCStanding[],
  playerNames: string[],
  previousPairings: Set<string>
): [number, number][] {
  // Sort by score descending
  const indexed = standings.map((s, i) => ({
    originalIdx: playerNames.indexOf(s.player),
    score: s.score,
    name: s.player
  }));
  indexed.sort((a, b) => b.score - a.score);

  const pairs: [number, number][] = [];
  const paired = new Set<number>();

  for (let i = 0; i < indexed.length; i++) {
    if (paired.has(indexed[i].originalIdx)) continue;

    // Find best unpaired opponent (preferring someone we haven't played)
    for (let j = i + 1; j < indexed.length; j++) {
      if (paired.has(indexed[j].originalIdx)) continue;

      const pairKey = [indexed[i].originalIdx, indexed[j].originalIdx].sort().join("-");
      if (previousPairings.has(pairKey)) continue;

      pairs.push([indexed[i].originalIdx, indexed[j].originalIdx]);
      paired.add(indexed[i].originalIdx);
      paired.add(indexed[j].originalIdx);
      break;
    }

    // If no unpaired opponent found (all already played), pair with anyone
    if (!paired.has(indexed[i].originalIdx)) {
      for (let j = i + 1; j < indexed.length; j++) {
        if (paired.has(indexed[j].originalIdx)) continue;
        pairs.push([indexed[i].originalIdx, indexed[j].originalIdx]);
        paired.add(indexed[i].originalIdx);
        paired.add(indexed[j].originalIdx);
        break;
      }
    }
  }

  return pairs;
}

/** Number of rounds for Swiss format given player count. */
export function swissRoundCount(playerCount: number): number {
  return Math.ceil(Math.log2(playerCount));
}
