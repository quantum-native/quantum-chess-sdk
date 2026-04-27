import {
  QCEngine,
  createStackExplorer,
  validatePlayerShape
} from "../chunk-XCCDOHCS.js";
import {
  QuantumChessQuantumAdapter,
  createClassicalStartGameData,
  createQuantumForgePort
} from "../chunk-HYPD7VU7.js";

// src/adapters/module-worker-runtime.ts
import * as QuantumForgeWeb from "@quantum-native/quantum-forge-chess";
var initPromise = null;
var player = null;
var quantumForgeModule = QuantumForgeWeb;
function ensureQuantumForge() {
  initPromise ??= quantumForgeModule.QuantumForge.initialize?.() ?? Promise.resolve();
  return initPromise;
}
function createAdapter() {
  return new QuantumChessQuantumAdapter(createQuantumForgePort(quantumForgeModule));
}
function createExplorer(view) {
  const gameAdapter = createAdapter();
  const engine = new QCEngine(gameAdapter, view.rules);
  engine.initializeFromPosition(view.gameData.position);
  return createStackExplorer(engine, createClassicalStartGameData(), createAdapter);
}
self.addEventListener("message", (event) => {
  const msg = event.data;
  void (async () => {
    if (msg.type === "initialize") {
      await ensureQuantumForge();
      const mod = await import(
        /* @vite-ignore */
        msg.url
      );
      const error = validatePlayerShape(mod.default);
      if (error) throw new Error(`Invalid AI module at ${msg.url}: ${error}`);
      player = mod.default;
      await player.initialize?.();
      self.postMessage({
        type: "initialized",
        name: player.name,
        author: player.author,
        description: player.description,
        quantumEnabled: player.quantumEnabled
      });
      return;
    }
    if (!player) throw new Error("Custom AI worker was not initialized.");
    if (msg.type === "chooseMove") {
      await ensureQuantumForge();
      const explorer = createExplorer(msg.view);
      try {
        const choice = await player.chooseMove(msg.view, explorer, msg.clock);
        self.postMessage({ type: "move", choice });
      } finally {
        explorer.dispose?.();
      }
      return;
    }
    if (msg.type === "opponentMove") {
      player.onOpponentMove?.(msg.move, msg.view);
      return;
    }
    player.onGameOver?.(msg.result);
  })().catch((err) => {
    self.postMessage({
      type: "error",
      message: err instanceof Error ? err.message : String(err)
    });
  });
});
