import type { QuantumChessQuantumAdapter } from "../quantum";
import { QCMatchRunner } from "../match-runner";
import type { QuantumAdapterFactory } from "../explorer";
import { computeStandings } from "./standings";
import { roundRobinPairings, swissPairing, swissRoundCount } from "./pairings";
import type {
  QCTournamentConfig,
  QCTournamentResult,
  QCTournamentMatchResult,
  QCTournamentEvent,
  QCStanding
} from "./types";

export type QCTournamentEventHandler = (event: QCTournamentEvent) => void;

/**
 * Runs a tournament between multiple QCPlayers.
 * Supports round-robin and Swiss formats.
 */
export class QCTournamentRunner {
  private readonly config: QCTournamentConfig;
  private aborted = false;

  constructor(config: QCTournamentConfig) {
    if (config.players.length < 2) {
      throw new Error("Tournament requires at least 2 players.");
    }
    this.config = config;
  }

  /**
   * Run the tournament to completion.
   * @param adapterFactory - Creates fresh quantum adapters for each match.
   * @param onEvent - Optional event handler.
   */
  async run(
    adapterFactory: QuantumAdapterFactory,
    onEvent?: QCTournamentEventHandler
  ): Promise<QCTournamentResult> {
    const { config } = this;
    const playerNames = config.players.map((p) => p.name);
    const allMatches: QCTournamentMatchResult[] = [];
    const gamesPerMatch = config.gamesPerMatch ?? 2;

    if (config.format === "round_robin") {
      return this.runRoundRobin(adapterFactory, onEvent);
    } else if (config.format === "swiss") {
      return this.runSwiss(adapterFactory, onEvent);
    } else {
      throw new Error(`Tournament format '${config.format}' not yet supported.`);
    }
  }

  abort(): void {
    this.aborted = true;
  }

  private async runRoundRobin(
    adapterFactory: QuantumAdapterFactory,
    onEvent?: QCTournamentEventHandler
  ): Promise<QCTournamentResult> {
    const { config } = this;
    const playerNames = config.players.map((p) => p.name);
    const rounds = roundRobinPairings(config.players.length);
    const allMatches: QCTournamentMatchResult[] = [];
    const gamesPerMatch = config.gamesPerMatch ?? 2;

    for (let roundIdx = 0; roundIdx < rounds.length; roundIdx++) {
      if (this.aborted) break;

      onEvent?.({ type: "round_start", round: roundIdx + 1, totalRounds: rounds.length });

      for (const [whiteIdx, blackIdx] of rounds[roundIdx]) {
        if (this.aborted) break;

        const results = await this.playMatch(
          whiteIdx, blackIdx, gamesPerMatch, adapterFactory, onEvent, roundIdx + 1
        );
        allMatches.push(...results);
      }

      const standings = computeStandings(playerNames, allMatches);
      onEvent?.({ type: "round_end", round: roundIdx + 1, standings });
    }

    const finalStandings = computeStandings(playerNames, allMatches);
    const result: QCTournamentResult = {
      standings: finalStandings,
      matches: allMatches,
      format: "round_robin",
      rounds: rounds.length
    };
    onEvent?.({ type: "tournament_end", result });
    return result;
  }

  private async runSwiss(
    adapterFactory: QuantumAdapterFactory,
    onEvent?: QCTournamentEventHandler
  ): Promise<QCTournamentResult> {
    const { config } = this;
    const playerNames = config.players.map((p) => p.name);
    const totalRounds = swissRoundCount(config.players.length);
    const allMatches: QCTournamentMatchResult[] = [];
    const previousPairings = new Set<string>();
    const gamesPerMatch = config.gamesPerMatch ?? 2;

    for (let roundIdx = 0; roundIdx < totalRounds; roundIdx++) {
      if (this.aborted) break;

      onEvent?.({ type: "round_start", round: roundIdx + 1, totalRounds });

      const standings = computeStandings(playerNames, allMatches);
      const pairs = swissPairing(standings, playerNames, previousPairings);

      for (const [whiteIdx, blackIdx] of pairs) {
        if (this.aborted) break;

        const pairKey = [whiteIdx, blackIdx].sort().join("-");
        previousPairings.add(pairKey);

        const results = await this.playMatch(
          whiteIdx, blackIdx, gamesPerMatch, adapterFactory, onEvent, roundIdx + 1
        );
        allMatches.push(...results);
      }

      const roundStandings = computeStandings(playerNames, allMatches);
      onEvent?.({ type: "round_end", round: roundIdx + 1, standings: roundStandings });
    }

    const finalStandings = computeStandings(playerNames, allMatches);
    const result: QCTournamentResult = {
      standings: finalStandings,
      matches: allMatches,
      format: "swiss",
      rounds: totalRounds
    };
    onEvent?.({ type: "tournament_end", result });
    return result;
  }

  /**
   * Play a match between two players (one or more games with color alternation).
   */
  private async playMatch(
    playerAIdx: number,
    playerBIdx: number,
    gamesCount: number,
    adapterFactory: QuantumAdapterFactory,
    onEvent?: QCTournamentEventHandler,
    round: number = 1
  ): Promise<QCTournamentMatchResult[]> {
    const { config } = this;
    const results: QCTournamentMatchResult[] = [];

    for (let game = 0; game < gamesCount; game++) {
      if (this.aborted) break;

      // Alternate colors each game
      const whiteIdx = game % 2 === 0 ? playerAIdx : playerBIdx;
      const blackIdx = game % 2 === 0 ? playerBIdx : playerAIdx;
      const white = config.players[whiteIdx];
      const black = config.players[blackIdx];

      onEvent?.({ type: "match_start", round, white: white.name, black: black.name });

      const runner = new QCMatchRunner({
        white,
        black,
        rules: config.rules,
        timeControl: config.timeControl,
        maxPly: config.maxPly ?? 500
      });

      const quantum = adapterFactory();
      const gameResult = await runner.run(quantum, undefined, adapterFactory);

      const matchResult: QCTournamentMatchResult = {
        white: white.name,
        black: black.name,
        result: gameResult
      };

      results.push(matchResult);
      onEvent?.({ type: "match_end", round, result: matchResult });
    }

    return results;
  }
}
