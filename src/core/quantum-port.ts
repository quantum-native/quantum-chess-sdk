/**
 * Quantum Primitive Port — the driver interface between chess logic and
 * quantum simulation.
 *
 * Defines the quantum operations needed to play quantum chess without
 * specifying how they're implemented. Different backends can satisfy
 * this interface:
 *
 * - QuantumForge (default, proprietary WASM)
 * - Qiskit / Cirq (IBM/Google quantum frameworks)
 * - Pure math state vector simulator
 * - Real quantum hardware
 * - Mock port (deterministic outcomes for testing)
 *
 * The QuantumChessQuantumAdapter translates chess moves (jumps, slides,
 * splits, merges) into sequences of these primitive operations.
 */

/** Opaque handle to a quantum property (qudit). */
export type QuantumHandle = unknown;

/** Opaque predicate for conditional quantum operations. */
export type QuantumPredicate = unknown;

/** Probability distribution for a quantum property. */
export interface QuantumProbability {
  probability: number;
  qudit_values: number[];
}

/** Entry in a reduced density matrix (for entanglement inspection). */
export interface ReducedDensityMatrixEntry {
  row_values: number[];
  col_values: number[];
  value: { real: number; imag: number };
}

/**
 * The primitive quantum operations needed to simulate quantum chess.
 *
 * All operations act on QuantumHandles (opaque references to qudits).
 * Operations are unitary (reversible) except for measurement, which
 * collapses quantum state irreversibly.
 */
export interface QuantumPrimitivePort {
  /** Create a quantum property (qudit) with the given dimension. */
  createProperty(dimension: number): QuantumHandle;

  /** Create a predicate: true when the handle's value equals `value`. */
  predicateIs(handle: QuantumHandle, value: number): QuantumPredicate;

  /** Create a predicate: true when the handle's value does NOT equal `value`. */
  predicateIsNot(handle: QuantumHandle, value: number): QuantumPredicate;

  /**
   * Cycle (phase rotation) on a qudit.
   * Applies a phase shift proportional to `fraction` (1.0 = full cycle).
   * Part of split/merge move sequences.
   */
  cycle(handle: QuantumHandle, fraction?: number, predicates?: QuantumPredicate[]): void;

  /**
   * iSwap gate between two qudits.
   * Swaps amplitudes and applies a phase of i^fraction.
   * This is the fundamental operation for moving pieces between squares.
   * Conditional on predicates (used for slides that check path is clear).
   */
  iSwap(handle1: QuantumHandle, handle2: QuantumHandle, fraction: number, predicates?: QuantumPredicate[]): void;

  /**
   * Swap two qudits (no phase change).
   * Used for castling rook movement.
   */
  swap(handle1: QuantumHandle, handle2: QuantumHandle, predicates?: QuantumPredicate[]): void;

  /**
   * Clock (phase advance) on a qudit.
   * Applies phase rotation. clock(h, 0.5) applies a phase of i.
   * Used for accumulated deferred phase correction.
   */
  clock(handle: QuantumHandle, fraction: number, predicates?: QuantumPredicate[]): void;

  /**
   * Measure a predicate (collapse conditional state).
   * Returns 0 or 1. Irreversible.
   */
  measurePredicate(predicates: QuantumPredicate[]): number;

  /**
   * Measure multiple qudits, collapsing their quantum state.
   * Returns an array of measured values. Irreversible.
   */
  measure(handles: QuantumHandle[]): number[];

  /**
   * Force-measure qudits to specific values (for deterministic replays).
   * Used when replaying games with known measurement outcomes.
   */
  forcedMeasure(handles: QuantumHandle[], values: number[]): number[];

  /**
   * Get the probability distribution for each qudit WITHOUT collapsing state.
   * Used for displaying piece transparency and AI evaluation.
   */
  probabilities(handles: QuantumHandle[]): QuantumProbability[];

  /**
   * Get the reduced density matrix for a set of qudits (optional).
   * Used for advanced entanglement visualization.
   */
  reducedDensityMatrix?(handles: QuantumHandle[]): ReducedDensityMatrixEntry[];

  /**
   * Destroy a quantum property, removing its qudit from the state vector (optional).
   * Measures the property first (collapsing it out of superposition), then
   * factorizes it out of the global state vector, freeing the dimension.
   *
   * Without this, destroyed properties leave dead qudits in the state vector
   * that still contribute to exponential size growth.
   *
   * If not implemented, callers should fall back to measure + cycle to |0⟩.
   */
  destroyProperty?(handle: QuantumHandle): void;

  /**
   * Force-measure a predicate to a specific outcome (optional, QF >= 1.10.0).
   * Like measurePredicate but forces the outcome to `value` (0 or 1).
   * Returns the actual outcome (which equals `value` if possible, or the
   * natural outcome if the forced value was impossible).
   */
  forcedMeasurePredicate?(predicates: QuantumPredicate[], value: number): number;

  /**
   * Get the probability that a set of predicates holds (optional, QF >= 1.10.0).
   * Returns a number between 0.0 and 1.0 WITHOUT collapsing the state.
   * Used to check feasibility before calling forcedMeasurePredicate.
   */
  predicateProbability?(predicates: QuantumPredicate[]): number;

  /**
   * Factorize all separable sub-states in the simulation (optional, QF >= 1.10.0).
   * Splits any shared states that are tensor products into independent states.
   * Called before destroyProperty to ensure clean factorization.
   */
  factorizeAllSeparable?(): void;
}

/** Description of a quantum operation applied during a move (for logging/replay). */
export interface OperationStep {
  op: "cycle" | "i_swap" | "swap" | "clock" | "measure";
  squares: number[];
  fraction?: number;
}

/** Result of applying a quantum chess move through the adapter. */
export interface QuantumMoveResult {
  applied: boolean;
  measured: boolean;
  measurementPassed?: boolean;
}
