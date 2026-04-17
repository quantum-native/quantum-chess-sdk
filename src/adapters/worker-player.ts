import type {
  QCPlayer,
  QCEngineView,
  QCExplorer,
  QCMoveChoice,
  QCClock,
  QCGameResult
} from "../types";

/**
 * AI player that runs in a Web Worker.
 *
 * The worker must listen for messages of the form:
 *   { type: "chooseMove", view: QCEngineView, clock: QCClock | null }
 *
 * And respond with:
 *   QCMoveChoice
 */
export class WorkerPlayerAdapter implements QCPlayer {
  readonly name: string;
  readonly control = "ai" as const;
  readonly author?: string;
  readonly description?: string;

  private worker: Worker | null = null;
  private readonly workerUrl: string | URL;

  constructor(options: {
    workerUrl: string | URL;
    name: string;
    author?: string;
    description?: string;
  }) {
    this.workerUrl = options.workerUrl;
    this.name = options.name;
    this.author = options.author;
    this.description = options.description;
  }

  async initialize(): Promise<void> {
    this.worker = new Worker(this.workerUrl, { type: "module" });
  }

  async chooseMove(
    view: QCEngineView,
    _explorer: QCExplorer | null,
    clock: QCClock | null
  ): Promise<QCMoveChoice> {
    if (!this.worker) throw new Error("Worker not initialized");

    return new Promise<QCMoveChoice>((resolve, reject) => {
      const handler = (e: MessageEvent) => {
        this.worker!.removeEventListener("message", handler);
        this.worker!.removeEventListener("error", errorHandler);
        resolve(e.data as QCMoveChoice);
      };
      const errorHandler = (e: ErrorEvent) => {
        this.worker!.removeEventListener("message", handler);
        this.worker!.removeEventListener("error", errorHandler);
        reject(new Error(`Worker error: ${e.message}`));
      };

      this.worker!.addEventListener("message", handler);
      this.worker!.addEventListener("error", errorHandler);
      this.worker!.postMessage({ type: "chooseMove", view, clock });
    });
  }

  onGameOver(result: QCGameResult): void {
    this.worker?.postMessage({ type: "gameOver", result });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
