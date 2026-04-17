import { type QChessGameData } from "../core";
import type { QuantumChessQuantumAdapter } from "../quantum";
import type {
  QCPlayer,
  QCMatchConfig,
  QCMatchEvent,
  QCMatchMoveEvent,
  QCGameResult
} from "../types";
import { QCMatchRunner, type QCMatchEventHandler } from "../match-runner";
import type { QuantumAdapterFactory } from "../explorer";

/**
 * Callbacks from the match runner back to the host UI.
 * This is the bridge between the SDK's game loop and the existing
 * AppEngine state management + UI rendering.
 */
export interface MatchBridgeCallbacks {
  /** Called on every move. Update AppEngine state, play sounds, etc. */
  onMove(event: QCMatchMoveEvent): void | Promise<void>;

  /** Called when the game ends. Dispatch END_GAME, navigate to game over screen. */
  onGameOver(result: QCGameResult): void;

  /** Called on clock update. Update timer display. */
  onClockUpdate(whiteMs: number, blackMs: number): void;

  /** Called on error. Show toast or status text. */
  onError(message: string): void;
}

/**
 * Manages the lifecycle of a QCMatchRunner within a GamePlayScreen.
 * Handles starting, event bridging, and cleanup.
 *
 * Usage in GamePlayScreen.mount():
 *   this.matchBridge = new MatchBridge(config, callbacks);
 *   this.matchBridge.start(quantum);
 *
 * Usage in GamePlayScreen.dispose():
 *   this.matchBridge?.stop();
 */
export class MatchBridge {
  private runner: QCMatchRunner | null = null;
  private runPromise: Promise<QCGameResult> | null = null;

  constructor(
    private readonly config: QCMatchConfig,
    private readonly callbacks: MatchBridgeCallbacks
  ) {}

  /**
   * Start the match. Non-blocking -- the game loop runs in the background.
   * @param quantum The quantum adapter for this game.
   * @param adapterFactory Optional factory for creating fresh adapters (enables QCExplorer for AI players).
   */
  /**
   * Start the match. Non-blocking -- the game loop runs in the background.
   * Returns the initial board state after position initialization (before any
   * moves are played). This allows the caller to update the display immediately
   * without touching the quantum adapter directly.
   */
  start(quantum: QuantumChessQuantumAdapter, adapterFactory?: QuantumAdapterFactory): QChessGameData | null {
    this.runner = new QCMatchRunner(this.config);

    // Initialize synchronously so we can return the initial board state
    this.runner.initialize(quantum, this.config);
    const initialState = this.runner.getEngine()?.getGameData() ?? null;

    const handler: QCMatchEventHandler = async (event) => {
      switch (event.type) {
        case "move":
          await this.callbacks.onMove(event);
          break;
        case "game_over":
          this.callbacks.onGameOver(event.result);
          break;
        case "clock":
          this.callbacks.onClockUpdate(event.whiteMs, event.blackMs);
          break;
        case "error":
          this.callbacks.onError(event.message);
          break;
      }
    };

    this.runPromise = this.runner.runLoop(handler, adapterFactory).catch((err) => {
      this.callbacks.onError(`Match error: ${err?.message ?? err}`);
      return {
        winner: "draw" as const,
        reason: "abort" as const,
        totalPly: 0,
        moveHistory: []
      };
    });

    return initialState;
  }

  /** Abort the match. */
  stop(): void {
    this.runner?.abort();
    this.runner = null;
    this.runPromise = null;
  }

  /** Get the underlying runner (for spectating, getting current view). */
  getRunner(): QCMatchRunner | null {
    return this.runner;
  }

  /** Whether the match is currently running. */
  get isRunning(): boolean {
    return this.runner !== null;
  }
}
