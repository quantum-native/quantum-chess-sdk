/**
 * Result of applying a quantum chess move through the adapter.
 *
 * Re-exported by qc-quantum so consumers can type their adapter calls
 * without depending on qc-core directly. Returned by
 * QuantumChessAdapter.applyMove.
 */
export interface QuantumMoveResult {
  applied: boolean;
  measured: boolean;
  measurementPassed?: boolean;
}
