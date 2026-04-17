import type { QCPlayer, QCGameResult, QCMoveRecord } from "../types";
import type { RulesConfig, TimeControlConfig } from "../core";

export interface QCTournamentConfig {
  players: QCPlayer[];
  format: "round_robin" | "swiss" | "single_elimination" | "double_elimination";
  rules: RulesConfig;
  timeControl: TimeControlConfig;
  /** Games per match (default 2: one as white, one as black). */
  gamesPerMatch?: number;
  /** Max concurrent matches (default 1). */
  concurrentMatches?: number;
  /** Max ply per game (default 500). */
  maxPly?: number;
}

export interface QCTournamentMatchResult {
  white: string; // player name
  black: string;
  result: QCGameResult;
}

export interface QCStanding {
  player: string;
  wins: number;
  losses: number;
  draws: number;
  score: number; // wins + 0.5 * draws
  tiebreak: number; // Buchholz: sum of opponents' scores
}

export interface QCTournamentResult {
  standings: QCStanding[];
  matches: QCTournamentMatchResult[];
  format: string;
  rounds: number;
}

export type QCTournamentEvent =
  | { type: "round_start"; round: number; totalRounds: number }
  | { type: "match_start"; round: number; white: string; black: string }
  | { type: "match_end"; round: number; result: QCTournamentMatchResult }
  | { type: "round_end"; round: number; standings: QCStanding[] }
  | { type: "tournament_end"; result: QCTournamentResult };
