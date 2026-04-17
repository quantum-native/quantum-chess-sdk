import type {
  QCPlayer,
  QCEngineView,
  QCExplorer,
  QCMoveChoice,
  QCClock,
  QCGameResult
} from "../types";

/**
 * AI player with a persistent WebSocket connection.
 * Lower latency than HTTP for repeated interactions.
 * Supports pondering (server can pre-compute during opponent's turn).
 *
 * Protocol:
 *   Client → Server: { type: "chooseMove", requestId: number, view, clock }
 *   Server → Client: { requestId: number, choice: QCMoveChoice }
 *
 *   Client → Server: { type: "opponentMove", move, view }
 *   Client → Server: { type: "gameOver", result }
 */
export class WebSocketPlayerAdapter implements QCPlayer {
  readonly name: string;
  readonly control = "ai" as const;
  readonly author?: string;
  readonly description?: string;

  private ws: WebSocket | null = null;
  private readonly url: string;
  private pending = new Map<number, (choice: QCMoveChoice) => void>();
  private requestId = 0;

  constructor(options: {
    url: string;
    name: string;
    author?: string;
    description?: string;
  }) {
    this.url = options.url;
    this.name = options.name;
    this.author = options.author;
    this.description = options.description;
  }

  async initialize(): Promise<void> {
    this.ws = new WebSocket(this.url);

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const resolve = this.pending.get(msg.requestId);
        if (resolve) {
          this.pending.delete(msg.requestId);
          resolve(msg.choice);
        }
      } catch {
        // Ignore malformed messages
      }
    };

    await new Promise<void>((resolve, reject) => {
      this.ws!.onopen = () => resolve();
      this.ws!.onerror = () => reject(new Error(`WebSocket connection failed: ${this.url}`));
    });
  }

  async chooseMove(
    view: QCEngineView,
    _explorer: QCExplorer | null,
    clock: QCClock | null
  ): Promise<QCMoveChoice> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }

    const id = this.requestId++;
    return new Promise<QCMoveChoice>((resolve) => {
      this.pending.set(id, resolve);
      this.ws!.send(JSON.stringify({ type: "chooseMove", requestId: id, view, clock }));
    });
  }

  onOpponentMove(move: import("../types").QCMoveRecord, view: QCEngineView): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "opponentMove", move, view }));
    }
  }

  onGameOver(result: QCGameResult): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "gameOver", result }));
    }
  }

  dispose(): void {
    this.pending.clear();
    this.ws?.close();
    this.ws = null;
  }
}
