/**
 * StackExplorer v3: Isolated-simulation do/undo explorer for AI search.
 *
 * Each search gets its OWN engine + adapter + QuantumSimulation.
 * No shared state with the main game or other players.
 *
 * - Every move goes through engine.executeMove + undoMove, so the board and
 *   the simulation always move together.
 * - Undo restores the quantum state exactly, including across measurements
 *   (see QCEngine.undoMove), so both branches of a measurement are searched
 *   from the same position.
 * - Dispose the simulation when the search is done.
 */

import {
  cloneGameData,
  detectKingCapture,
  type QChessGameData,
  type RulesConfig,
} from "./core";
import type { QuantumChessAdapter } from "./quantum";
import { QCEngine } from "./engine";
import { buildLegalMoveSet } from "./legal-moves";
import { measurementPassProbability } from "./measurement";
import type {
  QCExplorer,
  QCExplorerResult,
  QCEngineView,
  QCMoveChoice,
  QCPositionEval,
  QCSample,
  QCLegalMoveSet,
  QCMoveOption
} from "./types";

export type QuantumAdapterFactory = () => QuantumChessAdapter;

const PIECE_VALUES: Record<string, number> = {
  P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0,
  p: -1, n: -3, b: -3, r: -5, q: -9, k: 0
};

// ---------------------------------------------------------------------------
// Undo entry
// ---------------------------------------------------------------------------

/**
 * The engine owns both halves of the undo (board state and quantum state), so
 * an entry only has to carry what the engine doesn't: the legal-move cache
 * this explorer threw away when the move was applied.
 */
interface UndoEntry {
  cachedLegalMoves: QCLegalMoveSet | null;
}

// ---------------------------------------------------------------------------
// StackExplorer
// ---------------------------------------------------------------------------

export class StackExplorer implements QCExplorer {
  private readonly engine: QCEngine;
  private readonly rules: RulesConfig;
  private readonly adapterFactory: QuantumAdapterFactory;
  /** Dispose callback to destroy the isolated simulation when done. */
  private readonly _dispose: (() => void) | null;
  readonly depth: number;

  private undoStack: UndoEntry[] = [];
  private _cachedLegalMoves: QCLegalMoveSet | null = null;

  constructor(
    engine: QCEngine,
    rules: RulesConfig,
    adapterFactory: QuantumAdapterFactory,
    depth: number = 0,
    dispose?: () => void
  ) {
    this.engine = engine;
    this.rules = rules;
    this.adapterFactory = adapterFactory;
    this.depth = depth;
    this._dispose = dispose ?? null;
  }

  /** Destroy the search simulation. Call after chooseMove returns. */
  dispose(): void {
    this._dispose?.();
  }

  /** How many applied moves are still undoable. One per `success: true` apply(). */
  get undoDepth(): number {
    return this.undoStack.length;
  }

  // -----------------------------------------------------------------------
  // QCExplorer interface
  // -----------------------------------------------------------------------

  get view(): QCEngineView {
    if (!this._cachedLegalMoves) {
      this._cachedLegalMoves = buildLegalMoveSet(this.engine.getGameData());
    }
    const gd = this.engine.getGameData();
    return {
      gameData: gd,
      sideToMove: gd.board.ply % 2 === 0 ? "white" : "black",
      legalMoves: this._cachedLegalMoves,
      moveHistory: [],
      quantumEnabled: this.rules.quantumEnabled,
      rules: this.rules
    };
  }

  evaluate(): QCPositionEval {
    const gd = this.engine.getGameData();
    let materialBalance = 0;
    for (let sq = 0; sq < 64; sq++) {
      const piece = gd.board.pieces[sq];
      const prob = gd.board.probabilities[sq];
      if (piece === "." || prob <= 1e-6) continue;
      materialBalance += (PIECE_VALUES[piece] ?? 0) * prob;
    }
    const kingCapture = detectKingCapture(gd);
    const legalMoves = this._cachedLegalMoves ?? buildLegalMoveSet(gd);
    return {
      score: kingCapture === "white_win" ? 10000
           : kingCapture === "black_win" ? -10000
           : kingCapture === "draw" ? 0
           : materialBalance,
      materialBalance,
      isCheckmate: kingCapture !== null,
      isStalemate: kingCapture === null && legalMoves.count === 0
    };
  }

  /**
   * Collapse the current quantum state into N classical board snapshots.
   * Uses the joint probability distribution from QuantumForge to preserve
   * entanglement correlations (e.g., a split piece appears on exactly one
   * of its two squares, never both).
   */
  sample(count: number): QCSample[] {
    const gd = this.engine.getGameData();
    const adapter = (this.engine as any).quantum;

    // Collect squares with quantum properties (superposed)
    const quantumSquares: number[] = [];
    const handles: unknown[] = [];
    if (adapter?.squareProps) {
      for (const [sq, handle] of adapter.squareProps as Map<number, unknown>) {
        quantumSquares.push(sq);
        handles.push(handle);
      }
    }

    // If no quantum state, return the classical board
    if (handles.length === 0) {
      return Array.from({ length: count }, () => ({ pieces: [...gd.board.pieces], weight: 1 }));
    }

    // Get the joint probability distribution over all quantum squares
    const joint = adapter.port.probabilities(handles) as Array<{ probability: number; qudit_values: number[] }>;

    // Build cumulative distribution for weighted random sampling
    const cdf: number[] = [];
    let cumulative = 0;
    for (const entry of joint) {
      cumulative += entry.probability;
      cdf.push(cumulative);
    }

    const samples: QCSample[] = [];
    for (let i = 0; i < count; i++) {
      const pieces = [...gd.board.pieces];

      // Pick an outcome from the joint distribution
      const r = Math.random() * cumulative;
      let outcomeIdx = 0;
      for (let j = 0; j < cdf.length; j++) {
        if (r <= cdf[j]) { outcomeIdx = j; break; }
      }
      const outcome = joint[outcomeIdx].qudit_values;

      // Apply: value 1 = piece present, value 0 = piece absent
      for (let k = 0; k < quantumSquares.length; k++) {
        if (outcome[k] === 0) pieces[quantumSquares[k]] = ".";
      }

      samples.push({ pieces, weight: 1 });
    }
    return samples;
  }

  fork(count: number = 2): QCExplorer[] {
    const forks: QCExplorer[] = [];
    for (let i = 0; i < count; i++) {
      const adapter = this.adapterFactory();
      const engine = new QCEngine(adapter, this.rules);
      engine.initializeFromPosition(this.engine.getGameData().position);
      const port = (adapter as any).port;
      const dispose = typeof port?.dispose === "function"
        ? () => port.dispose()
        : undefined;
      forks.push(new StackExplorer(engine, this.rules, this.adapterFactory, this.depth, dispose));
    }
    return forks;
  }

  /**
   * Apply a move in-place. Every `success: true` result pushes exactly one
   * undo entry, so the caller pairs it with exactly one undo().
   * A `success: false` result changes nothing and must NOT be undone.
   *
   * Every move goes through the engine, which moves the board and the
   * simulation together. Updating the board here for "obviously classical"
   * moves would be quicker, but it desynchronises the two: the board looks
   * right until the next move reaches the engine, which re-reads the board
   * from a simulation that never saw the move.
   *
   * Moves that measure are applied like any other. The outcome is random
   * unless `options.forceMeasurement` picks a branch; either way the result
   * carries `measurementPassProbability`, the probability the move would
   * have gone through, so a search can weight both branches.
   */
  apply(
    choice: QCMoveChoice,
    options?: { forceMeasurement?: "pass" | "fail" }
  ): QCExplorerResult {
    const savedLegalMoves = this._cachedLegalMoves;
    this._cachedLegalMoves = null;

    // --- OOM guard: abort before crashing WASM ---
    const adapter = (this.engine as any).quantum;
    if (typeof adapter?.isNearOOM === "function" && adapter.isNearOOM()) {
      this._cachedLegalMoves = savedLegalMoves;
      return { success: false, explorer: this, measured: false };
    }

    // Read the pass probability off the pre-move state — once the move has
    // run, the superposition it describes is gone.
    const passProbability = measurementPassProbability(this.engine.getGameData(), choice);

    if (options?.forceMeasurement) {
      this.engine.setForceMeasurement(options.forceMeasurement === "pass" ? "m1" : "m0");
    }

    const result = this.engine.executeMove(choice);

    if (options?.forceMeasurement) {
      this.engine.setForceMeasurement("random");
    }

    if (!result.success) {
      this._cachedLegalMoves = savedLegalMoves;
      return { success: false, explorer: this, measured: false };
    }

    this.undoStack.push({ cachedLegalMoves: savedLegalMoves });
    return {
      success: true,
      explorer: this,
      measured: result.moveRecord.wasMeasurement,
      measurementPassed: result.moveRecord.measurementPassed,
      ...(passProbability !== undefined ? { measurementPassProbability: passProbability } : {})
    };
  }

  undo(): void {
    const entry = this.undoStack.pop();
    if (!entry) return;
    this._cachedLegalMoves = entry.cachedLegalMoves;
    this.engine.undoMove();
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a StackExplorer with its own isolated QuantumSimulation.
 * The search engine replays the game history into the isolated sim,
 * then searches via do/undo. No shared state with the game engine.
 *
 * The returned explorer has a dispose() method — call it after
 * chooseMove returns to destroy the simulation.
 */
export function createStackExplorer(
  engine: QCEngine,
  _startingData: QChessGameData,
  adapterFactory: QuantumAdapterFactory
): QCExplorer {
  const searchAdapter = adapterFactory();
  const searchEngine = new QCEngine(searchAdapter, engine.getView().rules);
  searchEngine.initializeFromPosition(engine.getGameData().position);

  // If the adapter's port has dispose(), wire it up for cleanup
  const port = (searchAdapter as any).port;
  const dispose = typeof port?.dispose === "function"
    ? () => port.dispose()
    : undefined;

  return new StackExplorer(searchEngine, engine.getView().rules, adapterFactory, 0, dispose);
}
