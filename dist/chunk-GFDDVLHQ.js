// src/pooling-port.ts
function createPoolingPort(realPort) {
  const tracked = [];
  return {
    createProperty: (dimension = 2) => {
      const available = tracked.find((t) => !t.inUse);
      if (available) {
        available.inUse = true;
        return available.handle;
      }
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
    resetAll() {
      for (const t of tracked) {
        if (!t.inUse) continue;
        const [value] = realPort.measure([t.handle]);
        if (value !== 0) {
          realPort.cycle(t.handle);
        }
        t.inUse = false;
      }
    },
    releaseHandles(handles) {
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
    count() {
      return tracked.length;
    }
  };
}

export {
  createPoolingPort
};
