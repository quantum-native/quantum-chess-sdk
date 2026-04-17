import type { QuantumHandle, QuantumPrimitivePort } from "../core";

/** Port backed by an isolated QuantumSimulation. Call dispose() when done. */
export interface DisposablePort extends QuantumPrimitivePort {
  dispose(): void;
}

export interface QuantumForgeLikeModule {
  QuantumForge: {
    createQuantumProperty: (dimension: number) => unknown;
    getMaxStateSize?: () => number;
  };
  QuantumSimulation?: new () => {
    createProperty: (dimension: number) => unknown;
    destroyProperty: (prop: unknown) => void;
    factorizeAllSeparable?: () => void;
    destroy: () => void;
    isDestroyed: () => boolean;
  };
  cycle: (prop: unknown, fraction?: number, predicates?: unknown[]) => void;
  i_swap: (prop1: unknown, prop2: unknown, fraction: number, predicates?: unknown[]) => void;
  swap: (prop1: unknown, prop2: unknown, predicates?: unknown[]) => void;
  clock: (prop: unknown, fraction: number, predicates?: unknown[]) => void;
  measure_predicate: (predicates: unknown[]) => number;
  forced_measure_predicate?: (predicates: unknown[], forcedValue: number) => number;
  predicate_probability?: (predicates: unknown[]) => number;
  measure_properties: (props: unknown[]) => number[];
  forced_measure_properties: (props: unknown[], forcedValues: number[]) => number[];
  probabilities: (props: unknown[]) => Array<{ probability: number; qudit_values: number[] }>;
  reduced_density_matrix?: (props: unknown[]) => Array<{ row_values: number[]; col_values: number[]; value: { real: number; imag: number } }>;
  reset?: (prop: unknown, currentValue: number) => void;
  executeBatchTape?: (properties: unknown[], tape: Float64Array) => { opsExecuted: number; success: boolean; errorMessage: string };
  OP?: Record<string, number>;
}

interface PredicateCapableHandle {
  is: (value: number) => unknown;
  is_not: (value: number) => unknown;
}

function asPredicateHandle(handle: QuantumHandle): PredicateCapableHandle {
  const candidate = handle as PredicateCapableHandle;
  if (!candidate || typeof candidate.is !== "function" || typeof candidate.is_not !== "function") {
    throw new Error("Quantum handle does not support predicates");
  }
  return candidate;
}

/**
 * Create an isolated port backed by its own QuantumSimulation.
 * Each port has a completely independent state vector.
 * Call dispose() when done — destroys the simulation and frees all memory.
 *
 * Do NOT call adapter.clear() before dispose() — clear() destroys individual
 * properties, leaving the simulation in a partial state that crashes on destroy().
 * Just call dispose() directly; it handles all cleanup internally.
 */
export function createIsolatedPort(module: QuantumForgeLikeModule): DisposablePort {
  if (!module.QuantumSimulation) {
    throw new Error("QuantumSimulation not available — requires quantum-forge-chess >= 1.5.0");
  }
  const sim = new module.QuantumSimulation();
  let propsCreated = 0;
  let propsDestroyed = 0;

  return {
    createProperty: (dimension) => { propsCreated++; return sim.createProperty(dimension); },
    predicateIs: (handle, value) => asPredicateHandle(handle).is(value),
    predicateIsNot: (handle, value) => asPredicateHandle(handle).is_not(value),
    cycle: (handle, fraction, predicates) => module.cycle(handle, fraction, predicates),
    iSwap: (handle1, handle2, fraction, predicates) => module.i_swap(handle1, handle2, fraction, predicates),
    swap: (handle1, handle2, predicates) => module.swap(handle1, handle2, predicates),
    clock: (handle, fraction, predicates) => module.clock(handle, fraction, predicates),
    measurePredicate: (predicates) => module.measure_predicate(predicates),
    forcedMeasurePredicate: module.forced_measure_predicate
      ? (predicates, value) => module.forced_measure_predicate!(predicates, value)
      : undefined,
    predicateProbability: module.predicate_probability
      ? (predicates) => module.predicate_probability!(predicates)
      : undefined,
    measure: (handles) => module.measure_properties(handles),
    forcedMeasure: (handles, values) => module.forced_measure_properties(handles, values),
    probabilities: (handles) => module.probabilities(handles),
    reducedDensityMatrix: module.reduced_density_matrix
      ? (handles) => module.reduced_density_matrix!(handles)
      : undefined,
    destroyProperty: (handle) => { sim.destroyProperty(handle as any); propsDestroyed++; },
    factorizeAllSeparable: typeof sim.factorizeAllSeparable === "function"
      ? () => sim.factorizeAllSeparable!()
      : undefined,
    dispose: () => {
      if (sim.isDestroyed()) return;
      // Skip sim.destroy() if all properties were individually destroyed —
      // QF crashes on sim.destroy() after many destroyProperty calls.
      if (propsDestroyed >= propsCreated) return;
      try { sim.destroy(); } catch { /* corrupted sim */ }
    }
  };
}

/** Create a QuantumForge port using the global shared state. */
export function createQuantumForgePort(module: QuantumForgeLikeModule): QuantumPrimitivePort {
  return {
    createProperty: (dimension) => module.QuantumForge.createQuantumProperty(dimension),
    predicateIs: (handle, value) => asPredicateHandle(handle).is(value),
    predicateIsNot: (handle, value) => asPredicateHandle(handle).is_not(value),
    cycle: (handle, fraction, predicates) => module.cycle(handle, fraction, predicates),
    iSwap: (handle1, handle2, fraction, predicates) => module.i_swap(handle1, handle2, fraction, predicates),
    swap: (handle1, handle2, predicates) => module.swap(handle1, handle2, predicates),
    clock: (handle, fraction, predicates) => module.clock(handle, fraction, predicates),
    measurePredicate: (predicates) => module.measure_predicate(predicates),
    forcedMeasurePredicate: module.forced_measure_predicate
      ? (predicates, value) => module.forced_measure_predicate!(predicates, value)
      : undefined,
    predicateProbability: module.predicate_probability
      ? (predicates) => module.predicate_probability!(predicates)
      : undefined,
    measure: (handles) => module.measure_properties(handles),
    forcedMeasure: (handles, values) => module.forced_measure_properties(handles, values),
    probabilities: (handles) => module.probabilities(handles),
    reducedDensityMatrix: module.reduced_density_matrix
      ? (handles) => module.reduced_density_matrix!(handles)
      : undefined,
    destroyProperty: (handle) => {
      const prop = handle as { destroy?: () => void };
      if (typeof prop.destroy === "function") prop.destroy();
    }
  };
}
