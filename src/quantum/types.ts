export type QuantumHandle = unknown;
export type QuantumPredicate = unknown;

export interface QuantumProbability {
  probability: number;
  qudit_values: number[];
}

export interface ReducedDensityMatrixEntry {
  row_values: number[];
  col_values: number[];
  value: { real: number; imag: number };
}

export interface QuantumPrimitivePort {
  createProperty(dimension: number): QuantumHandle;
  predicateIs(handle: QuantumHandle, value: number): QuantumPredicate;
  predicateIsNot(handle: QuantumHandle, value: number): QuantumPredicate;
  cycle(handle: QuantumHandle, fraction?: number, predicates?: QuantumPredicate[]): void;
  iSwap(handle1: QuantumHandle, handle2: QuantumHandle, fraction: number, predicates?: QuantumPredicate[]): void;
  swap(handle1: QuantumHandle, handle2: QuantumHandle, predicates?: QuantumPredicate[]): void;
  clock(handle: QuantumHandle, fraction: number, predicates?: QuantumPredicate[]): void;
  measurePredicate(predicates: QuantumPredicate[]): number;
  measure(handles: QuantumHandle[]): number[];
  forcedMeasure(handles: QuantumHandle[], values: number[]): number[];
  probabilities(handles: QuantumHandle[]): QuantumProbability[];
  reducedDensityMatrix?(handles: QuantumHandle[]): ReducedDensityMatrixEntry[];
}

export interface OperationStep {
  op: "cycle" | "i_swap" | "swap" | "clock" | "measure";
  squares: number[];
  fraction?: number;
}

export interface QuantumMoveResult {
  applied: boolean;
  measured: boolean;
  measurementPassed?: boolean;
}
