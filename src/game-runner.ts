/**
 * High-level game runner for community AI development.
 *
 * Wraps QuantumForge initialization, adapter creation, pooling, and
 * match setup into a simple API. Users never touch QuantumForge directly.
 *
 * Usage:
 *   const runner = await createGameRunner();
 *   const result = await runner.playMatch(myAI, opponentAI);
 *   console.log(result.winner);
 */

import { createClassicalStartGameData, CLASSICAL_START_FEN, type RulesConfig } from "./core";
import type { QuantumPrimitivePort } from "./core";
import { QCMatchRunner, type QCMatchEventHandler } from "./match-runner";
import type {
  QCPlayer,
  QCGameResult,
  QCMatchConfig,
  QCMatchEvent
} from "./types";

// ---------------------------------------------------------------------------
// Default rules
// ---------------------------------------------------------------------------

const DEFAULT_RULES: RulesConfig = {
  quantumEnabled: true,
  allowSplitMerge: true,
  allowMeasurementAnnotations: true,
  allowCastling: true,
  allowEnPassant: true,
  allowPromotion: true,
  objective: "checkmate"
};

const CLASSICAL_RULES: RulesConfig = {
  ...DEFAULT_RULES,
  quantumEnabled: false,
  allowSplitMerge: false,
};

// ---------------------------------------------------------------------------
// Game runner options
// ---------------------------------------------------------------------------

export interface PlayMatchOptions {
  /** Game rules. Defaults to quantum chess (splits, merges, measurements enabled). */
  rules?: Partial<RulesConfig>;
  /** Classical only — no quantum moves. Shorthand for disabling quantum rules. */
  classicalOnly?: boolean;
  /** Starting FEN. Defaults to standard chess starting position. */
  startingFen?: string;
  /** Move history to replay before starting (for resuming games). */
  history?: string[];
  /** Maximum ply before declaring a draw. Default 500. */
  maxPly?: number;
  /** Time control (optional). */
  timeControl?: { initialSeconds: number; incrementSeconds: number; maxSeconds: number };
  /** Delay between moves in ms (for watching AI vs AI). Default 0. */
  moveDelayMs?: number;
  /** Called for each game event (moves, clock updates, game over). */
  onEvent?: (event: QCMatchEvent) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Game runner
// ---------------------------------------------------------------------------

export interface GameRunner {
  /**
   * Play a match between two players. Returns the result when the game ends.
   *
   * @example
   * ```typescript
   * import { createGameRunner, PureSDKAdapter, RandomPlayer } from "@quantum-native/quantum-chess-sdk";
   *
   * const runner = await createGameRunner();
   * const result = await runner.playMatch(
   *   new RandomPlayer("my-bot"),
   *   new PureSDKAdapter("opponent", { maxDepth: 3 }),
   *   { onEvent: (e) => { if (e.type === "move") console.log(e.moveRecord.moveString); } }
   * );
   * console.log(`Winner: ${result.winner} (${result.reason})`);
   * ```
   */
  playMatch(
    white: QCPlayer,
    black: QCPlayer,
    options?: PlayMatchOptions
  ): Promise<QCGameResult>;

  /** Clean up resources. Call when done with the runner. */
  dispose(): void;
}

/**
 * Create a game runner. Initializes the quantum simulation engine.
 * Call once, reuse for multiple games.
 *
 * @example
 * ```typescript
 * const runner = await createGameRunner();
 * ```
 */
export async function createGameRunner(): Promise<GameRunner> {
  // Dynamic import so the SDK doesn't hard-fail if quantum-forge-chess
  // isn't installed (e.g., during type-checking or in test environments).
  // @ts-ignore -- peer dependency, may not be installed during type-checking
  const QFW = await import("@quantum-native/quantum-forge-chess");
  await (QFW as any).QuantumForge.initialize();

  // Import adapter internals (these come from qc-quantum, which wraps QuantumForge)
  const { QuantumChessQuantumAdapter, createQuantumForgePort } = await import("./quantum");
  const { createPoolingPort } = await import("./pooling-port");

  const basePort = createQuantumForgePort(QFW as any);
  const pool = createPoolingPort(basePort);

  function createAdapter() {
    return new QuantumChessQuantumAdapter(createPoolingPort(createQuantumForgePort(QFW as any)));
  }

  return {
    async playMatch(white, black, options = {}) {
      const rules: RulesConfig = options.classicalOnly
        ? { ...CLASSICAL_RULES, ...options.rules }
        : { ...DEFAULT_RULES, ...options.rules };

      const config: QCMatchConfig = {
        white,
        black,
        rules,
        maxPly: options.maxPly,
        moveDelayMs: options.moveDelayMs,
        timeControl: options.timeControl,
        startingPosition: options.startingFen || options.history
          ? {
              startingFen: options.startingFen ?? CLASSICAL_START_FEN,
              history: options.history ?? []
            }
          : undefined,
      };

      pool.resetAll();
      const quantum = new QuantumChessQuantumAdapter(pool);
      const adapterFactory = () => createAdapter();
      const runner = new QCMatchRunner(config);

      return runner.run(quantum, options.onEvent, adapterFactory);
    },

    dispose() {
      // QuantumForge doesn't have a global cleanup API.
      // The pooling port handles per-game cleanup via resetAll().
    }
  };
}
