import * as QuantumForgeWeb from "@quantum-native/quantum-forge-chess";
import { createClassicalStartGameData } from "../core";
import { QCEngine } from "../engine";
import { createStackExplorer } from "../stack-explorer";
import { createQuantumForgePort, QuantumChessQuantumAdapter, type QuantumForgeLikeModule } from "../quantum";
import type { QCClock, QCEngineView, QCGameResult, QCMoveRecord, QCPlayer } from "../types";
import { validatePlayerShape } from "../ai-validation";

type WorkerRequest =
  | { type: "initialize"; url: string }
  | { type: "chooseMove"; view: QCEngineView; clock: QCClock | null }
  | { type: "opponentMove"; move: QCMoveRecord; view: QCEngineView }
  | { type: "gameOver"; result: QCGameResult };

let initPromise: Promise<void> | null = null;
let player: QCPlayer | null = null;
const quantumForgeModule = QuantumForgeWeb as unknown as QuantumForgeLikeModule & {
  QuantumForge: { initialize?: () => Promise<void> };
};

function ensureQuantumForge(): Promise<void> {
  initPromise ??= quantumForgeModule.QuantumForge.initialize?.() ?? Promise.resolve();
  return initPromise;
}

function createAdapter(): QuantumChessQuantumAdapter {
  return new QuantumChessQuantumAdapter(createQuantumForgePort(quantumForgeModule));
}

function createExplorer(view: QCEngineView) {
  const gameAdapter = createAdapter();
  const engine = new QCEngine(gameAdapter, view.rules);
  engine.initializeFromPosition(view.gameData.position);
  return createStackExplorer(engine, createClassicalStartGameData(), createAdapter);
}

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;

  void (async () => {
    if (msg.type === "initialize") {
      await ensureQuantumForge();
      const mod = await import(/* @vite-ignore */ msg.url);
      const error = validatePlayerShape(mod.default);
      if (error) throw new Error(`Invalid AI module at ${msg.url}: ${error}`);
      player = mod.default as QCPlayer;
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
        (explorer as { dispose?: () => void }).dispose?.();
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
