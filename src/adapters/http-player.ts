import type {
  QCPlayer,
  QCEngineView,
  QCExplorer,
  QCMoveChoice,
  QCClock,
  QCGameResult
} from "../types";

/**
 * AI player that communicates via HTTP POST.
 *
 * Each turn, POSTs { view, clock } to the endpoint and expects
 * a QCMoveChoice response. The AI server can be written in any language.
 *
 * HTTP API contract:
 *   POST /move
 *   Body: { view: QCEngineView, clock: QCClock | null }
 *   Response: QCMoveChoice
 */
export class HttpPlayerAdapter implements QCPlayer {
  readonly name: string;
  readonly control = "ai" as const;
  readonly author?: string;
  readonly description?: string;

  private readonly endpoint: string;
  private readonly authToken?: string;
  private readonly timeoutMs: number;
  private abortController: AbortController | null = null;

  constructor(options: {
    endpoint: string;
    name: string;
    author?: string;
    description?: string;
    authToken?: string;
    timeoutMs?: number;
  }) {
    this.endpoint = options.endpoint;
    this.name = options.name;
    this.author = options.author;
    this.description = options.description;
    this.authToken = options.authToken;
    this.timeoutMs = options.timeoutMs ?? 30000;
  }

  async chooseMove(
    view: QCEngineView,
    _explorer: QCExplorer | null,
    clock: QCClock | null
  ): Promise<QCMoveChoice> {
    this.abortController = new AbortController();

    const timeoutId = setTimeout(() => {
      this.abortController?.abort();
    }, this.timeoutMs);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      if (this.authToken) {
        headers["Authorization"] = `Bearer ${this.authToken}`;
      }

      const response = await fetch(this.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ view, clock }),
        signal: this.abortController.signal
      });

      if (!response.ok) {
        throw new Error(`AI server error: ${response.status} ${response.statusText}`);
      }

      const choice: QCMoveChoice = await response.json();
      return choice;
    } finally {
      clearTimeout(timeoutId);
      this.abortController = null;
    }
  }

  dispose(): void {
    this.abortController?.abort();
  }
}
