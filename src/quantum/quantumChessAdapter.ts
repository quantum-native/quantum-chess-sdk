// Common interface for chess-on-QF adapters.
//
// Both the legacy port-backed QuantumChessQuantumAdapter (adapter.ts)
// and the WASM-backed QuantumChessQuantumAdapterWasm (wasmAdapter.ts)
// satisfy this surface. Consumers should type their dependency
// against this interface instead of either concrete class — that
// way the adapter implementation is swappable without changing
// call sites.
//
// The snapshot / record types are opaque (`unknown`) — each
// implementation chooses its own shape (the legacy adapter returns
// a structural snapshot, the WASM facade returns a frame ID), and
// the consumer just passes the value back verbatim on rollback.

import type { QChessGameData, QChessMove, QuantumMoveResult } from "../core";

import type { EntanglementVisualLink, RelativePhaseVisualLink } from "./visualTelemetry";

export interface QuantumChessAdapter {
  // Lifecycle.
  initializeClassical(pieces: string[]): void;
  isFullyClassical(): boolean;
  hasSquareProperty(square: number): boolean;
  /** Release any underlying simulation state. Idempotent. */
  dispose(): void;

  // Move execution + queries.
  applyMove(move: QChessMove): QuantumMoveResult;
  getExistenceProbability(square: number): number;
  /** Sum of all squares' existence probabilities. Used to detect collapsed states. */
  getTotalProbability(): number;
  measureSquare(square: number): number;

  // Undo.
  captureBookkeeping(): unknown;
  restoreBookkeeping(snapshot: unknown): void;
  /**
   * Discard a snapshot without rolling back — the move it guards is now
   * permanent. Every captureBookkeeping() must be matched by exactly one
   * restoreBookkeeping() or commitBookkeeping(); an unmatched snapshot
   * keeps the simulation's undo state alive forever.
   */
  commitBookkeeping(snapshot: unknown): void;
  startRecording(): void;
  stopRecording(): unknown;
  undoRecordedOps(ops: unknown): void;

  // Visualization (overlays). Implementations may return empty arrays
  // when the underlying state has no superposition to summarize.
  computeEntanglementLinks(gameData: QChessGameData, threshold?: number): EntanglementVisualLink[];
  computeRelativePhaseLinks(gameData: QChessGameData, epsilon?: number): RelativePhaseVisualLink[];
}
