// WASM-backed quantum adapter.
//
// Wraps the canonical chess-on-QF library
// (engines/quantum-chess-game, compiled to qc-game.wasm). Mirrors
// the surface of QuantumChessQuantumAdapter that the game and SDK
// actually consume — applyMove, probability queries, lifecycle,
// initializeClassical — plus the visualization helpers needed for
// the board overlay layer.
//
// Important difference from QuantumChessQuantumAdapter: this class
// owns its QuantumForge state internally (inside the WASM module).
// It does NOT accept a QuantumPrimitivePort. Callers that previously
// constructed adapters with createIsolatedPort should instead
// construct fresh QuantumChessQuantumAdapterWasm instances and
// dispose() them when done. Each instance is independent.

import {
  MoveType, MoveVariant,
  type QChessGameData, type QChessMove, type QuantumMoveResult,
} from "../core";

import type {
  EntanglementVisualLink, RelativePhaseVisualLink,
} from "./visualTelemetry";

// ----------------------------------------------------------------------------
// Module loading. The qc-game.js is an emscripten MODULARIZE=1 build:
// importing it gives a factory that returns a Promise<Module>. We cache
// the resolved module per-process so multiple adapters share the same
// WASM instance (separate QCGame objects within it).
// ----------------------------------------------------------------------------

/**
 * Loaded qc-game WASM module. Consumers store this and pass it to
 * QuantumChessQuantumAdapterWasm's constructor (or call .create()
 * for one-shot load + construct).
 */
export interface QCGameModule {
  QCGame: new () => QCGameInstance;
  // embind exposes enums as objects whose values have a .value member;
  // we map the canonical TS enum values onto C++ side directly so this
  // shape isn't actually needed at runtime — kept here for typing only.
  MoveType: Record<string, { value: number }>;
  MoveVariant: Record<string, { value: number }>;
}

/** @deprecated use QCGameModule. Old internal name kept for one cycle. */
export type QCGameWasmModule = QCGameModule;

interface QCGameInstance {
  clear(): void;
  initializeClassical(occupied: boolean[]): void;
  initializeClassicalMask(maskAsDouble: number): void;
  applyMove(
    type: number, variant: number,
    s1: number, s2: number, s3: number,
    doesMeasurement: boolean, measurementOutcome: number,
  ): { applied: boolean; measured: boolean; measurementPassed: number };
  isFullyClassical(): boolean;
  hasSquareProperty(s: number): boolean;
  isClassicallyOccupied(s: number): boolean;
  existenceProbability(s: number): number;
  pushFrame(): number;
  rollbackFrame(frameId: number): void;
  commitFrame(frameId: number): void;
  measureSquare(s: number): number;
  jointProbabilities(squareA: number, squareB: number): {
    p00: number; p01: number; p10: number; p11: number;
  };
  offDiagonalAmplitude(squareA: number, squareB: number): { real: number; imag: number };
  delete(): void;
}

/**
 * Opaque undo handle. The legacy adapter's captureBookkeeping returned
 * a structural snapshot; the WASM facade returns a frame ID that lives
 * inside the C++ undo stack. Treat the type as a black box and pass
 * the value verbatim to restoreBookkeeping().
 */
export type WasmUndoHandle = { frameId: number };

/**
 * Opaque ops handle. Returned by stopRecording() and consumed by
 * undoRecordedOps(). The actual ops live in C++; we shuttle only the
 * frame ID across the boundary.
 */
export type WasmRecordedOps = { frameId: number };

let modulePromise: Promise<QCGameModule> | null = null;

export type WasmLoader = () => Promise<{ default: (opts?: unknown) => Promise<QCGameModule> }>;

/**
 * Load the qc-game WASM module. The default loader assumes the SDK
 * is being consumed in an environment where the module sits at
 * ./wasm/qc-game.js relative to the importing file (the test setup).
 * Callers that bundle the SDK should supply their own loader so
 * bundlers can statically analyze the import path.
 */
export async function loadQCGameModule(loader?: WasmLoader): Promise<QCGameModule> {
  if (modulePromise) return modulePromise;
  const resolvedLoader: WasmLoader = loader
    ?? (() => import("./wasm/qc-game.js" as any));
  modulePromise = resolvedLoader().then(({ default: factory }) => factory());
  return modulePromise;
}

/**
 * Reset the cached module promise (test-only). Subsequent loadQCGameModule
 * calls will re-invoke the loader.
 */
export function resetCachedQCGameModule(): void {
  modulePromise = null;
}

// ----------------------------------------------------------------------------
// Adapter facade.
// ----------------------------------------------------------------------------

export class QuantumChessQuantumAdapterWasm {
  private readonly game: QCGameInstance;
  private disposed = false;

  /**
   * Construct an adapter bound to an already-loaded module. Use
   * `QuantumChessQuantumAdapterWasm.create()` to await module loading
   * and construct in one step.
   */
  constructor(module: QCGameModule) {
    this.game = new module.QCGame();
  }

  /** Convenience: load the module + construct in one await. */
  static async create(loader?: WasmLoader): Promise<QuantumChessQuantumAdapterWasm> {
    const mod = await loadQCGameModule(loader);
    return new QuantumChessQuantumAdapterWasm(mod);
  }

  /** True after dispose() has been called. */
  get isDisposed(): boolean { return this.disposed; }

  /**
   * Release the underlying WASM QCGame. Safe to call multiple times.
   * After dispose, all other methods are no-ops or return defaults.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.game.delete();
  }

  /** Wipe state but keep the WASM instance usable. */
  clear(): void {
    if (this.disposed) return;
    this.game.clear();
  }

  /**
   * Initialize from a classical piece layout. Accepts the same
   * `pieces` array shape as the legacy adapter — 64 entries, "."
   * for empty.
   */
  initializeClassical(pieces: string[]): void {
    if (this.disposed) return;
    const occupied = new Array<boolean>(64);
    for (let s = 0; s < 64; s++) occupied[s] = pieces[s] !== ".";
    this.game.initializeClassical(occupied);
  }

  /**
   * Apply a move. Translates QChessMove → C++ Move struct. The TS
   * MoveType / MoveVariant enums have explicit integer values that
   * match the C++ enum 1:1, so the cast is identity at runtime.
   */
  applyMove(move: QChessMove): QuantumMoveResult {
    if (this.disposed) return { applied: false, measured: false };
    const r = this.game.applyMove(
      move.type as unknown as number,
      move.variant as unknown as number,
      move.square1, move.square2, move.square3 ?? -1,
      move.doesMeasurement ?? false,
      move.measurementOutcome ?? 0,
    );
    const passed: boolean | undefined =
      r.measurementPassed === -1 ? undefined : r.measurementPassed === 1;
    return {
      applied: r.applied,
      measured: r.measured,
      ...(passed !== undefined ? { measurementPassed: passed } : {}),
    };
  }

  // --- Measurement -----------------------------------------------------------

  /**
   * Measure a single square. Returns 0 (empty) or 1 (occupied).
   * Triggers internal collapse of any squares the measurement
   * disentangled to deterministic outcomes.
   */
  measureSquare(square: number): number {
    if (this.disposed) return 0;
    return this.game.measureSquare(square);
  }

  // --- Undo ------------------------------------------------------------------
  //
  // The legacy adapter splits its undo state across captureBookkeeping
  // (returns a snapshot) and startRecording/stopRecording (returns an
  // ops list). For the WASM facade we collapse the snapshot + ops into
  // a single C++ undo frame and shuttle only a frame ID back through
  // the bridge.
  //
  // The legacy SDK pattern:
  //
  //   const snap = q.captureBookkeeping();    // outer
  //   q.startRecording();                     // inner
  //   ...moves...
  //   const ops = q.stopRecording();
  //   // success: store snap + ops, later: q.undoRecordedOps(ops) + q.restoreBookkeeping(snap)
  //   // failure: q.undoRecordedOps(ops)
  //
  // Both captureBookkeeping and startRecording push a frame. Both
  // restoreBookkeeping and undoRecordedOps roll a frame back. The
  // facade tracks pending frame IDs internally so the SDK's two-step
  // pattern works without changes.
  //
  // A pushed frame only leaves the C++ undo stack via rollback or
  // commit. Every captureBookkeeping() must therefore be matched by a
  // restoreBookkeeping() (move undone) or a commitBookkeeping() (move
  // kept) — an unmatched frame stays open forever, and while any frame
  // is open the engine parks retired quantum properties in its ancilla
  // pool instead of destroying them, so leaked frames leak memory.

  private innerRecordingFrame: number | null = null;

  captureBookkeeping(): WasmUndoHandle {
    if (this.disposed) return { frameId: 0 };
    return { frameId: this.game.pushFrame() };
  }

  restoreBookkeeping(handle: WasmUndoHandle): void {
    if (this.disposed) return;
    this.game.rollbackFrame(handle.frameId);
  }

  commitBookkeeping(handle: WasmUndoHandle): void {
    if (this.disposed) return;
    if (handle.frameId > 0) this.game.commitFrame(handle.frameId);
  }

  startRecording(): void {
    if (this.disposed) return;
    this.innerRecordingFrame = this.game.pushFrame();
  }

  stopRecording(): WasmRecordedOps {
    if (this.disposed) return { frameId: 0 };
    const id = this.innerRecordingFrame ?? 0;
    this.innerRecordingFrame = null;
    return { frameId: id };
  }

  undoRecordedOps(ops: WasmRecordedOps): void {
    if (this.disposed) return;
    if (ops.frameId > 0) this.game.rollbackFrame(ops.frameId);
  }

  // --- Queries ---------------------------------------------------------------

  getExistenceProbability(square: number): number {
    if (this.disposed) return 0;
    return this.game.existenceProbability(square);
  }

  hasSquareProperty(square: number): boolean {
    if (this.disposed) return false;
    return this.game.hasSquareProperty(square);
  }

  isFullyClassical(): boolean {
    if (this.disposed) return true;
    return this.game.isFullyClassical();
  }

  /** Sum of all square existence probabilities. */
  getTotalProbability(): number {
    if (this.disposed) return 0;
    let total = 0;
    for (let s = 0; s < 64; s++) total += this.game.existenceProbability(s);
    return total;
  }

  /** Squares whose probability is strictly between 0 and 1. */
  getSuperpositionSquares(_gameData?: QChessGameData, epsilon = 1.1920929e-7): number[] {
    if (this.disposed) return [];
    const out: number[] = [];
    for (let s = 0; s < 64; s++) {
      if (!this.game.hasSquareProperty(s)) continue;
      const p = this.game.existenceProbability(s);
      if (p > epsilon && p < 1 - epsilon) out.push(s);
    }
    return out;
  }

  /**
   * Pairwise correlation between two squares. Returns mutual
   * information (`strength`) and the linear correlation coefficient
   * (P(A=1,B=1) - P(A=1)*P(B=1)).
   */
  computeCorrelation(squareA: number, squareB: number): { strength: number; correlation: number } {
    if (this.disposed) return { strength: 0, correlation: 0 };
    const j = this.game.jointProbabilities(squareA, squareB);
    const pA = j.p10 + j.p11;
    const pB = j.p01 + j.p11;
    const correlation = j.p11 - pA * pB;

    const eps = 1e-12;
    let mi = 0;
    const pairs: [number, number, number][] = [
      [j.p00, 1 - pA, 1 - pB],
      [j.p01, 1 - pA, pB],
      [j.p10, pA,     1 - pB],
      [j.p11, pA,     pB],
    ];
    for (const [pj, pmA, pmB] of pairs) {
      if (pj > eps && pmA > eps && pmB > eps) {
        mi += pj * Math.log2(pj / (pmA * pmB));
      }
    }
    return { strength: mi, correlation };
  }

  computeEntanglementLinks(gameData: QChessGameData, threshold = 0.01): EntanglementVisualLink[] {
    if (this.disposed) return [];
    const sp = this.getSuperpositionSquares(gameData);
    const links: EntanglementVisualLink[] = [];
    for (let i = 0; i < sp.length; i++) {
      for (let j = i + 1; j < sp.length; j++) {
        const { strength, correlation } = this.computeCorrelation(sp[i], sp[j]);
        if (strength >= threshold) {
          links.push({ fromSquare: sp[i], toSquare: sp[j], strength, correlation });
        }
      }
    }
    return links.sort((a, b) => b.strength - a.strength);
  }

  computeRelativePhase(squareA: number, squareB: number): { radians: number; magnitude: number } | null {
    if (this.disposed) return null;
    const z = this.game.offDiagonalAmplitude(squareA, squareB);
    const magnitude = Math.sqrt(z.real * z.real + z.imag * z.imag);
    if (magnitude < 1e-6) return null;
    return { radians: Math.atan2(z.imag, z.real), magnitude };
  }

  computeRelativePhaseLinks(gameData: QChessGameData, epsilon = 1.1920929e-7): RelativePhaseVisualLink[] {
    if (this.disposed) return [];
    const sp = this.getSuperpositionSquares(gameData, epsilon);
    const byPiece = new Map<string, number[]>();
    for (const sq of sp) {
      const piece = gameData.board.pieces[sq];
      if (piece === ".") continue;
      const list = byPiece.get(piece) ?? [];
      list.push(sq);
      byPiece.set(piece, list);
    }
    const links: RelativePhaseVisualLink[] = [];
    for (const squares of byPiece.values()) {
      if (squares.length < 2) continue;
      for (let i = 0; i < squares.length; i++) {
        for (let j = i + 1; j < squares.length; j++) {
          const phase = this.computeRelativePhase(squares[i], squares[j]);
          if (phase) {
            links.push({
              fromSquare: squares[i],
              toSquare: squares[j],
              radians: phase.radians,
              confidence: phase.magnitude,
            });
          }
        }
      }
    }
    return links;
  }
}
