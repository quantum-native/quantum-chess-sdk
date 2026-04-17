import type {
  QCPlayer,
  QCEngineView,
  QCExplorer,
  QCMoveChoice,
  QCClock,
  QCGameResult,
  QCMoveRecord,
  QCLegalMoveSet
} from "../types";

/**
 * Callback interface for the board UI to receive move-related events.
 */
export interface LocalHumanBoardUI {
  /** Called when it's this player's turn. Show legal moves and enable interaction. */
  onTurnStart(legalMoves: QCLegalMoveSet): void;

  /** Called when the player's turn ends (move submitted or game over). */
  onTurnEnd(): void;

  /** Called when a queued premove was invalid in the resulting position. */
  onPremoveInvalid?(): void;
}

/**
 * A local human player. Bridges board UI interactions to the QCPlayer interface.
 *
 * When chooseMove() is called (it's the player's turn), the board UI is notified
 * and the promise waits until submitMove() is called from a board click handler.
 */
export class LocalHumanPlayer implements QCPlayer {
  readonly name: string;
  readonly control = "human_local" as const;

  private pendingResolve: ((choice: QCMoveChoice) => void) | null = null;
  private boardUI: LocalHumanBoardUI | null = null;
  /** Queued premove to auto-submit when chooseMove is called. */
  private queuedPremove: QCMoveChoice | null = null;

  constructor(name: string) {
    this.name = name;
  }

  /** Connect a board UI to receive turn notifications. */
  setBoardUI(boardUI: LocalHumanBoardUI): void {
    this.boardUI = boardUI;
  }

  async chooseMove(
    view: QCEngineView,
    _explorer: QCExplorer | null,
    _clock: QCClock | null
  ): Promise<QCMoveChoice> {
    this.boardUI?.onTurnStart(view.legalMoves);

    // If a premove is queued, attempt to submit it immediately
    const premove = this.queuedPremove;
    this.queuedPremove = null;
    if (premove) {
      // Validate that the premove is still legal in the current position
      if (this.isPremoveLegal(premove, view.legalMoves)) {
        this.boardUI?.onTurnEnd();
        return premove;
      }
      // Premove invalid — fall through to normal wait
      this.boardUI?.onPremoveInvalid?.();
    }

    return new Promise<QCMoveChoice>((resolve) => {
      this.pendingResolve = resolve;
    });
  }

  /**
   * Called by the board UI when the human completes a move gesture.
   * Resolves the pending chooseMove() promise.
   */
  submitMove(choice: QCMoveChoice): void {
    if (!this.pendingResolve) return;
    const resolve = this.pendingResolve;
    this.pendingResolve = null;
    this.boardUI?.onTurnEnd();
    resolve(choice);
  }

  /** Whether a move is currently expected (it's this player's turn). */
  isAwaitingMove(): boolean {
    return this.pendingResolve !== null;
  }

  /** Queue a premove to auto-submit when it becomes this player's turn. */
  queuePremove(choice: QCMoveChoice): void {
    this.queuedPremove = choice;
  }

  /** Clear any queued premove. */
  clearPremove(): void {
    this.queuedPremove = null;
  }

  /** Whether a premove is currently queued. */
  hasPremove(): boolean {
    return this.queuedPremove !== null;
  }

  /** Check if a premove choice matches any legal move in the current position. */
  private isPremoveLegal(choice: QCMoveChoice, legalMoves: QCLegalMoveSet): boolean {
    if (choice.type === "standard") {
      return legalMoves.standard.some(m => m.from === choice.from && m.to === choice.to);
    }
    if (choice.type === "split") {
      return legalMoves.splits.some(m => m.from === choice.from && m.targetA === choice.targetA && m.targetB === choice.targetB);
    }
    if (choice.type === "merge") {
      return legalMoves.merges.some(m => m.sourceA === choice.sourceA && m.sourceB === choice.sourceB && m.to === choice.to);
    }
    return false;
  }

  /** Cancel any pending move (e.g. game aborted). */
  cancelPendingMove(): void {
    this.pendingResolve = null;
    this.queuedPremove = null;
    this.boardUI?.onTurnEnd();
  }

  onOpponentMove(move: QCMoveRecord, view: QCEngineView): void {
    // Board UI will be updated by the match runner event handler
  }

  onGameOver(result: QCGameResult): void {
    this.cancelPendingMove();
  }

  dispose(): void {
    this.cancelPendingMove();
    this.boardUI = null;
  }
}
