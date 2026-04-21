/**
 * StackExplorer v3: Isolated-simulation do/undo explorer for AI search.
 *
 * Each search gets its OWN engine + adapter + QuantumSimulation.
 * No shared state with the main game or other players.
 *
 * - Classical moves on classical positions: direct board update (O(1))
 * - All quantum moves (including measurements): engine.executeMove + undoMove
 *   with recorded-ops reversal. Measurements use setForceMeasurement for
 *   correct post-measurement quantum state (entanglement propagation).
 * - Dispose the simulation when the search is done.
 */

import {
  cloneGameData,
  detectKingCapture,
  indexToSquareName,
  type QChessGameData,
  type RulesConfig,
} from "./core";
import type { QuantumChessQuantumAdapter } from "./quantum";
import { QCEngine } from "./engine";
import { buildLegalMoveSet } from "./legal-moves";
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

export type QuantumAdapterFactory = () => QuantumChessQuantumAdapter;

const PIECE_VALUES: Record<string, number> = {
  P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0,
  p: -1, n: -3, b: -3, r: -5, q: -9, k: 0
};

// ---------------------------------------------------------------------------
// Board snapshot
// ---------------------------------------------------------------------------

interface BoardSnapshot {
  pieces: string[];
  probabilities: number[];
  ply: number;
  castleFlags: number;
  enPassantSquare: number;
  fiftyCount: number;
  fiftyPieceCount: number;
  historyLength: number;
}

function saveSnapshot(gd: QChessGameData): BoardSnapshot {
  return {
    pieces: [...gd.board.pieces],
    probabilities: [...gd.board.probabilities],
    ply: gd.board.ply,
    castleFlags: gd.board.castleFlags,
    enPassantSquare: gd.board.enPassantSquare,
    fiftyCount: gd.board.fiftyCount,
    fiftyPieceCount: gd.board.fiftyPieceCount,
    historyLength: gd.position.history.length
  };
}

function restoreSnapshot(gd: QChessGameData, snap: BoardSnapshot): void {
  gd.board.pieces = snap.pieces;
  gd.board.probabilities = snap.probabilities;
  gd.board.ply = snap.ply;
  gd.board.castleFlags = snap.castleFlags;
  gd.board.enPassantSquare = snap.enPassantSquare;
  gd.board.fiftyCount = snap.fiftyCount;
  gd.board.fiftyPieceCount = snap.fiftyPieceCount;
  gd.position.history = gd.position.history.slice(0, snap.historyLength);
}

// ---------------------------------------------------------------------------
// Undo entry
// ---------------------------------------------------------------------------

type UndoType = "classical" | "engine";

interface UndoEntry {
  type: UndoType;
  snapshot: BoardSnapshot;
  cachedLegalMoves: QCLegalMoveSet | null;
}

// ---------------------------------------------------------------------------
// StackExplorer
// ---------------------------------------------------------------------------

export class StackExplorer implements QCExplorer {
  private readonly engine: QCEngine;
  private readonly rules: RulesConfig;
  /** Dispose callback to destroy the isolated simulation when done. */
  private readonly _dispose: (() => void) | null;
  readonly depth: number;

  private undoStack: UndoEntry[] = [];
  private _cachedLegalMoves: QCLegalMoveSet | null = null;

  constructor(
    engine: QCEngine,
    rules: RulesConfig,
    depth: number = 0,
    dispose?: () => void
  ) {
    this.engine = engine;
    this.rules = rules;
    this.depth = depth;
    this._dispose = dispose ?? null;
  }

  /** Destroy the search simulation. Call after chooseMove returns. */
  dispose(): void {
    this._dispose?.();
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
      moveHistory: this.engine.getMoveHistory(),
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

      // Classical squares stay as-is
      samples.push({ pieces, weight: 1 });
    }
    return samples;
  }

  /**
   * Apply a move in-place. Caller MUST call undo() after each apply().
   *
   * - Classical standard moves on classical positions: direct board update
   * - Everything else (quantum, measurement, splits, merges): engine.executeMove
   *   with recorded-ops undo. Measurements use setForceMeasurement for correct
   *   post-measurement entanglement propagation.
   */
  apply(
    choice: QCMoveChoice,
    options?: { forceMeasurement?: "pass" | "fail" }
  ): QCExplorerResult {
    const savedLegalMoves = this._cachedLegalMoves;
    this._cachedLegalMoves = null;
    const gd = this.engine.getGameData();
    const snapshot = saveSnapshot(gd);

    // --- Measurement: caller needs probability before branching ---
    if (!options?.forceMeasurement && this.isMeasurementMove(choice)) {
      const prob = choice.type === "standard"
        ? gd.board.probabilities[choice.from]
        : 0.5;
      this._cachedLegalMoves = savedLegalMoves;
      return {
        success: true,
        explorer: this,
        measured: true,
        measurementPassProbability: prob
      };
    }

    // --- OOM guard: abort before crashing WASM ---
    const adapter = (this.engine as any).quantum;
    if (typeof adapter?.isNearOOM === "function" && adapter.isNearOOM()) {
      this._cachedLegalMoves = savedLegalMoves;
      return { success: false, explorer: this, measured: false };
    }

    // --- Classical fast path ---
    if (this.isClassicalPosition() && choice.type === "standard" && !options?.forceMeasurement) {
      this.applyClassicalMove(choice, gd);
      // Keep the adapter's classicalOccupied and squareProps in sync so that
      // a subsequent engine-path move reads correct probabilities.
      const quantum = (this.engine as any).quantum;
      if (quantum?.classicalOccupied) {
        const srcPiece = snapshot.pieces[choice.from];
        quantum.classicalOccupied.delete(choice.from);
        quantum.classicalOccupied.add(choice.to);

        // Remove stale quantum properties on affected squares. After a merge,
        // a square can have hasProp=true but prob=0 (the property is at |0⟩).
        // If the classical path places a piece there, the stale property will
        // cause syncProbabilitiesFromQuantum to overwrite the piece with prob=0.
        if (quantum.squareProps.has(choice.from)) quantum.squareProps.delete(choice.from);
        if (quantum.squareProps.has(choice.to)) quantum.squareProps.delete(choice.to);

        // En passant: clear the captured pawn square
        if (srcPiece?.toLowerCase() === "p" && choice.to === snapshot.enPassantSquare) {
          const epCapture = choice.to - (srcPiece === "P" ? 8 : -8);
          if (epCapture >= 0 && epCapture < 64) {
            quantum.classicalOccupied.delete(epCapture);
            if (quantum.squareProps.has(epCapture)) quantum.squareProps.delete(epCapture);
          }
        }
        // Castling rook
        if (srcPiece?.toLowerCase() === "k" && Math.abs(choice.to - choice.from) === 2) {
          if (choice.to > choice.from) {
            quantum.classicalOccupied.delete(choice.from + 3);
            quantum.classicalOccupied.add(choice.from + 1);
          } else {
            quantum.classicalOccupied.delete(choice.from - 4);
            quantum.classicalOccupied.add(choice.from - 1);
          }
        }
      }
      this.undoStack.push({ type: "classical", snapshot, cachedLegalMoves: savedLegalMoves });
      return { success: true, explorer: this, measured: false };
    }

    // --- All quantum moves go through the engine ---
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

    this.undoStack.push({ type: "engine", snapshot, cachedLegalMoves: savedLegalMoves });
    return {
      success: true,
      explorer: this,
      measured: result.moveRecord.wasMeasurement,
      measurementPassed: result.moveRecord.measurementPassed,
    };
  }

  undo(): void {
    const entry = this.undoStack.pop();
    if (!entry) return;
    this._cachedLegalMoves = entry.cachedLegalMoves;

    if (entry.type === "classical") {
      restoreSnapshot(this.engine.getGameData(), entry.snapshot);
      // Restore the adapter's classicalOccupied from the snapshot
      const quantum = (this.engine as any).quantum;
      if (quantum?.classicalOccupied) {
        quantum.classicalOccupied.clear();
        for (let sq = 0; sq < 64; sq++) {
          if (entry.snapshot.pieces[sq] !== ".") quantum.classicalOccupied.add(sq);
        }
      }
    } else {
      this.engine.undoMove();
    }
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private isClassicalPosition(): boolean {
    const probs = this.engine.getGameData().board.probabilities;
    for (let i = 0; i < 64; i++) {
      if (probs[i] > 0.001 && probs[i] < 0.999) return false;
    }
    return true;
  }

  private isMeasurementMove(choice: QCMoveChoice): boolean {
    if (choice.type !== "standard") return false;
    const lm = this._cachedLegalMoves ?? buildLegalMoveSet(this.engine.getGameData());
    const moveOpt = lm.standard.find(m => m.from === choice.from && m.to === choice.to);
    return moveOpt?.willMeasure ?? false;
  }

  private applyClassicalMove(choice: QCMoveChoice & { type: "standard" }, gd: QChessGameData): void {
    const from = choice.from;
    const to = choice.to;
    const srcPiece = gd.board.pieces[from];

    gd.board.pieces[from] = ".";
    gd.board.pieces[to] = srcPiece;
    gd.board.probabilities[from] = 0;
    gd.board.probabilities[to] = 1;

    // En passant
    if (srcPiece.toLowerCase() === "p" && gd.board.enPassantSquare === to) {
      const capturedSq = to - (srcPiece === "P" ? 8 : -8);
      if (capturedSq >= 0 && capturedSq < 64) {
        gd.board.pieces[capturedSq] = ".";
        gd.board.probabilities[capturedSq] = 0;
      }
    }

    // Castling
    if (srcPiece.toLowerCase() === "k" && Math.abs(to - from) === 2) {
      const rook = srcPiece === "K" ? "R" : "r";
      if (to > from) {
        gd.board.pieces[from + 3] = "."; gd.board.pieces[from + 1] = rook;
        gd.board.probabilities[from + 3] = 0; gd.board.probabilities[from + 1] = 1;
      } else {
        gd.board.pieces[from - 4] = "."; gd.board.pieces[from - 1] = rook;
        gd.board.probabilities[from - 4] = 0; gd.board.probabilities[from - 1] = 1;
      }
    }

    gd.board.ply += 1;
    if (srcPiece.toLowerCase() === "p" && Math.abs(to - from) === 16) {
      gd.board.enPassantSquare = from + (to - from) / 2;
    } else {
      gd.board.enPassantSquare = -1;
    }

    // Castle rights: K=bit0, Q=bit1, k=bit2, q=bit3
    const clearCastleFor = (sq: number) => {
      if (sq === 4) gd.board.castleFlags &= ~0b0011;
      else if (sq === 0) gd.board.castleFlags &= ~0b0010;
      else if (sq === 7) gd.board.castleFlags &= ~0b0001;
      else if (sq === 60) gd.board.castleFlags &= ~0b1100;
      else if (sq === 56) gd.board.castleFlags &= ~0b1000;
      else if (sq === 63) gd.board.castleFlags &= ~0b0100;
    };
    clearCastleFor(from);
    clearCastleFor(to);

    gd.position.history = [...gd.position.history, `${indexToSquareName(from)}-${indexToSquareName(to)}`];
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

  return new StackExplorer(searchEngine, engine.getView().rules, 0, dispose);
}
