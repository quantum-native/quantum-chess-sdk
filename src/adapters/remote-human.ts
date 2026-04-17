import type {
  QCPlayer,
  QCEngineView,
  QCExplorer,
  QCMoveChoice,
  QCClock,
  QCGameResult,
  QCMoveRecord
} from "../types";

/**
 * Abstraction over the network transport for remote game connections.
 * Implemented by OnlineGameSession (WebSocket) and CorrespondenceGameSession (Convex).
 */
export interface GameConnection {
  /** Wait for the next move from the remote player. */
  waitForMove(): Promise<QCMoveChoice>;

  /** Send a game result to the remote. */
  sendGameResult?(result: QCGameResult): void;

  /** Cancel any pending wait. */
  cancel?(): void;
}

/**
 * A remote human player. The chooseMove() promise resolves when the
 * opponent's move arrives over the network.
 */
export class RemoteHumanPlayer implements QCPlayer {
  readonly name: string;
  readonly control = "human_remote" as const;

  private readonly connection: GameConnection;

  constructor(name: string, connection: GameConnection) {
    this.name = name;
    this.connection = connection;
  }

  async chooseMove(
    _view: QCEngineView,
    _explorer: QCExplorer | null,
    _clock: QCClock | null
  ): Promise<QCMoveChoice> {
    return this.connection.waitForMove();
  }

  onGameOver(result: QCGameResult): void {
    this.connection.sendGameResult?.(result);
  }

  dispose(): void {
    this.connection.cancel?.();
  }
}
