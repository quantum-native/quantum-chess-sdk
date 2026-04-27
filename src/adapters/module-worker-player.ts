import type {
  QCClock,
  QCEngineView,
  QCExplorer,
  QCGameResult,
  QCMoveChoice,
  QCMoveRecord,
  QCPlayer
} from "../types";

type WorkerResponse =
  | { type: "initialized"; name: string; author?: string; description?: string; quantumEnabled?: boolean }
  | { type: "move"; choice: QCMoveChoice }
  | { type: "error"; message: string };

/**
 * Loads a QCPlayer module inside a dedicated browser worker.
 *
 * This is the default browser execution model for custom module AIs: the AI's
 * search runs off the UI thread and receives a worker-local QCExplorer backed
 * by its own QuantumForge port.
 */
export class ModuleWorkerPlayer implements QCPlayer {
  readonly control = "ai" as const;

  name: string;
  author?: string;
  description?: string;
  quantumEnabled?: boolean;

  private worker: Worker | null = null;
  private initialized = false;

  constructor(
    private readonly url: string,
    fallbackName: string = "Custom AI"
  ) {
    this.name = fallbackName;
    this.description = "Custom AI Worker";
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.worker = new Worker(new URL("./adapters/module-worker-runtime.js", import.meta.url), { type: "module" });
    const response = await this.request({ type: "initialize", url: this.url });
    if (response.type !== "initialized") throw new Error("Custom AI worker did not initialize.");
    this.name = response.name;
    this.author = response.author;
    this.description = response.description ?? this.description;
    this.quantumEnabled = response.quantumEnabled;
    this.initialized = true;
  }

  async chooseMove(
    view: QCEngineView,
    _explorer: QCExplorer | null,
    clock: QCClock | null
  ): Promise<QCMoveChoice> {
    const response = await this.request({ type: "chooseMove", view, clock });
    if (response.type !== "move") throw new Error("Custom AI worker did not return a move.");
    return response.choice;
  }

  onOpponentMove(move: QCMoveRecord, view: QCEngineView): void {
    this.worker?.postMessage({ type: "opponentMove", move, view });
  }

  onGameOver(result: QCGameResult): void {
    this.worker?.postMessage({ type: "gameOver", result });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.initialized = false;
  }

  private request(message: unknown): Promise<WorkerResponse> {
    const worker = this.worker;
    if (!worker) throw new Error("Custom AI worker not initialized");

    return new Promise<WorkerResponse>((resolve, reject) => {
      const cleanup = () => {
        worker.removeEventListener("message", messageHandler);
        worker.removeEventListener("error", errorHandler);
      };
      const messageHandler = (event: MessageEvent<WorkerResponse>) => {
        const msg = event.data;
        cleanup();
        if (msg.type === "error") {
          reject(new Error(msg.message));
          return;
        }
        resolve(msg);
      };
      const errorHandler = (event: ErrorEvent) => {
        cleanup();
        reject(new Error(`Custom AI worker error: ${event.message}`));
      };

      worker.addEventListener("message", messageHandler);
      worker.addEventListener("error", errorHandler);
      worker.postMessage(message);
    });
  }
}
