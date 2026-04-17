import type { QCStanding, QCTournamentMatchResult } from "./types";

/**
 * Compute standings from match results.
 * Score: W=1, D=0.5, L=0
 * Tiebreak: Buchholz (sum of opponents' scores)
 */
export function computeStandings(
  playerNames: string[],
  matches: QCTournamentMatchResult[]
): QCStanding[] {
  const stats = new Map<string, { wins: number; losses: number; draws: number; opponents: string[] }>();

  for (const name of playerNames) {
    stats.set(name, { wins: 0, losses: 0, draws: 0, opponents: [] });
  }

  for (const match of matches) {
    const whiteStats = stats.get(match.white);
    const blackStats = stats.get(match.black);
    if (!whiteStats || !blackStats) continue;

    whiteStats.opponents.push(match.black);
    blackStats.opponents.push(match.white);

    if (match.result.winner === "white") {
      whiteStats.wins++;
      blackStats.losses++;
    } else if (match.result.winner === "black") {
      blackStats.wins++;
      whiteStats.losses++;
    } else {
      whiteStats.draws++;
      blackStats.draws++;
    }
  }

  // Compute scores
  const scores = new Map<string, number>();
  for (const [name, s] of stats) {
    scores.set(name, s.wins + 0.5 * s.draws);
  }

  // Compute Buchholz tiebreak
  const standings: QCStanding[] = [];
  for (const [name, s] of stats) {
    let tiebreak = 0;
    for (const opp of s.opponents) {
      tiebreak += scores.get(opp) ?? 0;
    }
    standings.push({
      player: name,
      wins: s.wins,
      losses: s.losses,
      draws: s.draws,
      score: scores.get(name) ?? 0,
      tiebreak
    });
  }

  // Sort by score desc, then tiebreak desc
  standings.sort((a, b) => b.score - a.score || b.tiebreak - a.tiebreak);
  return standings;
}
