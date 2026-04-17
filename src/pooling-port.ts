/**
 * Reusable QuantumForge port that tracks all created properties so they
 * can be reset between games. Without this, every game creates 64 new
 * quantum properties (plus ancillas) and the WASM heap fills up.
 */
import type { QuantumPrimitivePort, QuantumHandle } from "./core";

interface TrackedProperty {
  handle: QuantumHandle;
  /** Has been used in the current game (needs reset before next game). */
  inUse: boolean;
}

export interface PoolingPort extends QuantumPrimitivePort {
  /** Reset all tracked properties to value 0 (ready for new game). */
  resetAll(): void;
  /** Release specific handles — mark them as not in use for reuse. */
  releaseHandles(handles: unknown[]): void;
  /** Number of properties currently tracked. */
  count(): number;
}

/**
 * Wraps a real QuantumForge port and tracks all createProperty calls.
 * On resetAll(), measures each property (collapses superposition) and
 * cycles back to 0. Subsequent createProperty calls REUSE reset
 * properties instead of allocating new ones, keeping the total qubit
 * count bounded across games.
 *
 * Without reuse, each game creates ~10-20 new qubits. After 500 games
 * QuantumForge has 5000+ qubits in its state vector and OOMs.
 */
export function createPoolingPort(realPort: QuantumPrimitivePort): PoolingPort {
  const tracked: TrackedProperty[] = [];

  return {
    createProperty: (dimension: number = 2) => {
      // Reuse a reset property if available (avoids growing the state vector)
      const available = tracked.find(t => !t.inUse);
      if (available) {
        available.inUse = true;
        return available.handle;
      }
      // No free property — create a new one
      const handle = realPort.createProperty(dimension);
      tracked.push({ handle, inUse: true });
      return handle;
    },
    predicateIs: realPort.predicateIs.bind(realPort),
    predicateIsNot: realPort.predicateIsNot.bind(realPort),
    cycle: realPort.cycle.bind(realPort),
    iSwap: realPort.iSwap.bind(realPort),
    swap: realPort.swap.bind(realPort),
    clock: realPort.clock.bind(realPort),
    measurePredicate: realPort.measurePredicate.bind(realPort),
    measure: realPort.measure.bind(realPort),
    forcedMeasure: realPort.forcedMeasure.bind(realPort),
    probabilities: realPort.probabilities.bind(realPort),
    reducedDensityMatrix: realPort.reducedDensityMatrix?.bind(realPort),

    resetAll(): void {
      for (const t of tracked) {
        if (!t.inUse) continue;
        const [value] = realPort.measure([t.handle]);
        if (value !== 0) {
          realPort.cycle(t.handle);
        }
        t.inUse = false;
      }
    },

    releaseHandles(handles: unknown[]): void {
      const handleSet = new Set(handles);
      for (const t of tracked) {
        if (t.inUse && handleSet.has(t.handle)) {
          const [value] = realPort.measure([t.handle]);
          if (value !== 0) {
            realPort.cycle(t.handle);
          }
          t.inUse = false;
        }
      }
    },

    count(): number {
      return tracked.length;
    }
  };
}
