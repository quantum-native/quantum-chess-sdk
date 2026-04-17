import { cloneGameData, createClassicalStartGameData, fenToGameData, CLASSICAL_START_FEN, type QChessGameData } from "./core";
import type { QuantumChessQuantumAdapter } from "./quantum";
import { QCEngine } from "./engine";
import { createExplorer, type QuantumAdapterFactory } from "./explorer";
import { createStackExplorer } from "./stack-explorer";
import type {
  QCMatchConfig,
  QCMatchEvent,
  QCPlayer,
  QCGameResult,
  QCGameDiagnostics,
  QCQuantumHealthSnapshot,
  QCMoveChoice,
  QCClock,
  QCMoveRecord,
  QCEngineView,
  QCExplorer,
  QCLegalMoveSet,
  QCMoveExecutionResult
} from "./types";

const DEFAULT_MAX_PLY = 500;

export type QCMatchEventHandler = (event: QCMatchEvent) => void | Promise<void>;

/**
 * Drives a game between two QCPlayers. Manages turn order, time control,
 * win detection, and event streaming. Works for all game modes --
 * sandbox, vs_ai, online, correspondence, AI vs AI, spectate.
 */
export class QCMatchRunner {
  private readonly config: QCMatchConfig;
  private engine: QCEngine | null = null;
  private startingData: QChessGameData | null = null;
  private running = false;
  private aborted = false;

  // Time tracking
  private whiteMs = 0;
  private blackMs = 0;
  private turnStartedAt = 0;

  constructor(config: QCMatchConfig) {
    this.config = config;
  }

  /**
   * Run the match to completion. Initializes and runs the game loop.
   */
  async run(
    quantum: QuantumChessQuantumAdapter,
    onEvent?: QCMatchEventHandler,
    adapterFactory?: QuantumAdapterFactory
  ): Promise<QCGameResult> {
    this.initialize(quantum, this.config);
    return this.runLoop(onEvent, adapterFactory);
  }

  /**
   * Initialize the engine and position. Synchronous.
   * Called by MatchBridge before the game loop so the initial board state is
   * available immediately (no await needed for display updates).
   */
  initialize(quantum: QuantumChessQuantumAdapter, config: QCMatchConfig): void {
    const engine = new QCEngine(quantum, config.rules);
    this.engine = engine;

    const position = config.startingPosition
      ?? { startingFen: CLASSICAL_START_FEN, history: [] };
    engine.initializeFromPosition(position);

    this.startingData = fenToGameData(position.startingFen) ?? createClassicalStartGameData();

    if (config.sandbox?.ignoreTurnOrder) {
      engine.setIgnoreTurnOrder(true);
    }
    if (config.sandbox?.forceMeasurement) {
      engine.setForceMeasurement(config.sandbox.forceMeasurement);
    }

    if (config.timeControl) {
      this.whiteMs = config.timeControl.initialSeconds * 1000;
      this.blackMs = config.timeControl.initialSeconds * 1000;
    }
  }

  /** Run the game loop after initialize(). */
  async runLoop(
    onEvent?: QCMatchEventHandler,
    adapterFactory?: QuantumAdapterFactory
  ): Promise<QCGameResult> {
    const { config } = this;
    const engine = this.engine!;
    const startingData = this.startingData!;
    this.running = true;
    this.aborted = false;

    const white = config.white;
    const black = config.black;
    if (white.initialize) await white.initialize();
    if (black.initialize) await black.initialize();

    const maxPly = config.maxPly ?? DEFAULT_MAX_PLY;

    // Game loop
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 3;

    // Quantum health peak tracking
    const peaks = { maxPropertyCount: 0, maxAncillaCount: 0, minTotalProbability: Infinity, plyAtMaxProperties: 0 };
    const getQuantumHealth = (): QCQuantumHealthSnapshot | undefined => {
      try { return (engine as any).quantum?.getHealthSnapshot?.(); } catch { return undefined; }
    };
    const updatePeaks = (h: QCQuantumHealthSnapshot | undefined, ply: number) => {
      if (!h) return;
      if (h.propertyCount > peaks.maxPropertyCount) { peaks.maxPropertyCount = h.propertyCount; peaks.plyAtMaxProperties = ply; }
      if (h.ancillaCount > peaks.maxAncillaCount) peaks.maxAncillaCount = h.ancillaCount;
      if (h.totalProbability < peaks.minTotalProbability) peaks.minTotalProbability = h.totalProbability;
    };

    while (this.running && !this.aborted) {
      const gameData = engine.getGameData();
      const ply = gameData.board.ply;

      if (ply >= maxPly) {
        return this.endGame("draw", "max_ply", onEvent, undefined, peaks);
      }

      const isWhiteTurn = ply % 2 === 0;
      const activePlayer = isWhiteTurn ? white : black;
      const inactivePlayer = isWhiteTurn ? black : white;
      const color: "white" | "black" = isWhiteTurn ? "white" : "black";
      const faultColor: "white" | "black" = color; // player whose turn it is

      // Build view with legal moves
      const ignoreTurnOrder = config.sandbox?.ignoreTurnOrder;
      const view = engine.getView(ignoreTurnOrder);

      // If the active player has quantum disabled, remove splits/merges
      const playerQuantum = activePlayer.quantumEnabled ?? true;
      if (!playerQuantum) {
        view.legalMoves = {
          standard: view.legalMoves.standard,
          splits: [],
          merges: [],
          count: view.legalMoves.standard.length
        };
        view.quantumEnabled = false;
      }

      // Check stalemate (no legal moves)
      if (view.legalMoves.count === 0) {
        return this.endGame("draw", "stalemate", onEvent, undefined, peaks);
      }

      // Build clock
      const clock = this.buildClock(isWhiteTurn);
      this.turnStartedAt = Date.now();

      // Build explorer for AI players
      let explorer: QCExplorer | null = null;
      if (activePlayer.control === "ai" && adapterFactory) {
        explorer = createStackExplorer(engine, startingData, adapterFactory);
      }

      // Ask the active player for their move
      let choice: QCMoveChoice;
      try {
        choice = await activePlayer.chooseMove(view, explorer, clock);
      } catch (err) {
        const msg = (err as Error)?.message ?? String(err);
        const isOOM = msg.includes("OutOfMemory") || msg.includes("out of memory") || msg.includes("memory access out of bounds") || err instanceof RangeError;
        const reason = isOOM ? "oom" as const : "player_exception" as const;
        const failureClass = isOOM ? "search_oom" as const : "player_exception" as const;
        console.error(`[QCMatchRunner] Player "${activePlayer.name}" threw during chooseMove (${failureClass}):`, msg);
        onEvent?.({ type: "error", ply, message: `${activePlayer.name}: ${msg}` });
        const winner = isWhiteTurn ? "black" : "white";
        return this.endGame(winner, reason, onEvent, {
          faultPlayer: faultColor,
          failureClass,
          errorMessage: msg,
          errorStack: (err as Error)?.stack?.split("\n").slice(0, 8).join("\n"),
          quantumState: getQuantumHealth(),
        }, peaks);
      } finally {
        if (explorer && typeof (explorer as any).dispose === "function") {
          (explorer as any).dispose();
        }
      }

      if (this.aborted) {
        return this.endGame("draw", "abort", onEvent, undefined, peaks);
      }

      // Deduct time
      if (config.timeControl) {
        const elapsed = Date.now() - this.turnStartedAt;
        if (isWhiteTurn) {
          this.whiteMs -= elapsed;
          if (this.whiteMs <= 0) {
            return this.endGame("black", "timeout", onEvent, undefined, peaks);
          }
          this.whiteMs += config.timeControl.incrementSeconds * 1000;
          this.whiteMs = Math.min(this.whiteMs, config.timeControl.maxSeconds * 1000);
        } else {
          this.blackMs -= elapsed;
          if (this.blackMs <= 0) {
            return this.endGame("white", "timeout", onEvent, undefined, peaks);
          }
          this.blackMs += config.timeControl.incrementSeconds * 1000;
          this.blackMs = Math.min(this.blackMs, config.timeControl.maxSeconds * 1000);
        }

        onEvent?.({
          type: "clock",
          whiteMs: this.whiteMs,
          blackMs: this.blackMs
        });
      }

      // Validate the choice against legal moves
      if (!isLegalChoice(choice, view.legalMoves)) {
        console.error(`[QCMatchRunner] Player "${activePlayer.name}" chose illegal move at ply ${ply}:`, JSON.stringify(choice));
        onEvent?.({ type: "error", ply, message: `${activePlayer.name} chose illegal move: ${JSON.stringify(choice)}` });
        const winner = isWhiteTurn ? "black" : "white";
        return this.endGame(winner, "illegal_move", onEvent, {
          faultPlayer: faultColor,
          failureClass: "quantum_divergence",
          attemptedMove: JSON.stringify(choice),
          quantumState: getQuantumHealth(),
        }, peaks);
      }

      // Apply server-forced measurement if the remote player provided one
      if (choice._forceMeasurement) {
        engine.setForceMeasurement(choice._forceMeasurement);
      }

      // Execute the move
      let result: QCMoveExecutionResult;
      try {
        result = engine.executeMove(choice);
        consecutiveErrors = 0;
      } catch (err) {
        consecutiveErrors++;
        const msg = (err as Error)?.message ?? String(err);
        const isOOM = msg.includes("OutOfMemory") || msg.includes("out of memory") || msg.includes("memory access out of bounds") || err instanceof RangeError;
        console.error(`[QCMatchRunner] executeMove threw for ${activePlayer.name} at ply ${ply} (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}${isOOM ? ", OOM" : ""}):`, msg);
        onEvent?.({ type: "error", ply, message: `Move execution error: ${msg}` });
        if (choice._forceMeasurement) {
          engine.setForceMeasurement("random");
        }
        if (isOOM || consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          const reason = isOOM ? "oom" as const : "abort" as const;
          return this.endGame("draw", reason, onEvent, {
            faultPlayer: faultColor,
            failureClass: isOOM ? "execution_oom" : "player_exception",
            errorMessage: msg,
            errorStack: (err as Error)?.stack?.split("\n").slice(0, 8).join("\n"),
            attemptedMove: JSON.stringify(choice),
            quantumState: getQuantumHealth(),
            consecutiveErrors,
          }, peaks);
        }
        continue;
      }

      // Reset force measurement after execution
      if (choice._forceMeasurement) {
        engine.setForceMeasurement("random");
      }

      if (!result.success) {
        if (result.error) {
          // Forced measurement was impossible — let the player try again
          onEvent?.({ type: "error", ply, message: result.error });
          continue;
        }
        console.error(`[QCMatchRunner] Move execution failed for ${activePlayer.name}:`, choice, result.moveRecord);
        const winner = isWhiteTurn ? "black" : "white";
        return this.endGame(winner, "illegal_move", onEvent, {
          faultPlayer: faultColor,
          failureClass: "execution_failure",
          attemptedMove: JSON.stringify(choice),
          quantumState: getQuantumHealth(),
        }, peaks);
      }

      // Server authority hook
      if (config.serverAuthority && activePlayer.control !== "human_remote") {
        const override = await config.serverAuthority.onMoveExecuted(
          result.moveRecord.moveString,
          ply,
          result
        );
        if (override && override.forceMeasurement) {
          // Server overrides handled via _forceMeasurement on remote moves
        }
      }

      // Capture quantum health after move
      const health = getQuantumHealth();
      updatePeaks(health, ply);

      // Emit move event
      await onEvent?.({
        type: "move",
        ply,
        color,
        moveRecord: result.moveRecord,
        gameData: result.gameData,
        legalMoveCount: {
          standard: view.legalMoves.standard.length,
          splits: view.legalMoves.splits.length,
          merges: view.legalMoves.merges.length,
          total: view.legalMoves.count,
        },
        quantumHealth: health,
      });

      // Notify inactive player
      inactivePlayer.onOpponentMove?.(result.moveRecord, engine.getView());

      // Move delay (for AI vs AI spectating)
      if (config.moveDelayMs && config.moveDelayMs > 0) {
        await new Promise((r) => setTimeout(r, config.moveDelayMs));
      }

      // Check win conditions (sandbox skips unless respectWinCondition is on)
      const checkWin = !config.sandbox || config.sandbox.respectWinCondition;
      if (checkWin) {
        const winResult = engine.checkWinCondition();
        if (winResult) {
          const gd = engine.getGameData();
          console.warn(`[QCMatchRunner] Win detected: ${winResult} after ply ${gd.board.ply}. Move: ${result.moveRecord.moveString}`);
          console.warn(`[QCMatchRunner] Pieces:`, gd.board.pieces.join(""));
          console.warn(`[QCMatchRunner] Probs:`, gd.board.probabilities.map(p => p.toFixed(2)).join(","));
          const winner = winResult === "white_win" ? "white" : "black";
          return this.endGame(winner, "checkmate", onEvent, undefined, peaks);
        }

        // Check fifty-move rule
        if (engine.checkFiftyMoveRule()) {
          return this.endGame("draw", "fifty_move", onEvent, undefined, peaks);
        }
      }
    }

    // Should not reach here unless aborted
    return this.endGame("draw", "abort", onEvent, undefined, peaks);
  }

  /** Abort a running match. */
  abort(): void {
    this.aborted = true;
    this.running = false;
  }

  /** Get the current engine view (for spectating). */
  getCurrentView(): QCEngineView | null {
    return this.engine?.getView() ?? null;
  }

  /** Get the current engine (for advanced integrations). */
  getEngine(): QCEngine | null {
    return this.engine;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private buildClock(isWhiteTurn: boolean): QCClock | null {
    if (!this.config.timeControl) return null;
    return {
      remainingMs: isWhiteTurn ? this.whiteMs : this.blackMs,
      incrementMs: this.config.timeControl.incrementSeconds * 1000,
      opponentRemainingMs: isWhiteTurn ? this.blackMs : this.whiteMs
    };
  }

  private endGame(
    winner: "white" | "black" | "draw",
    reason: QCGameResult["reason"],
    onEvent?: QCMatchEventHandler,
    diagnostics?: QCGameDiagnostics,
    peaks?: { maxPropertyCount: number; maxAncillaCount: number; minTotalProbability: number; plyAtMaxProperties: number }
  ): QCGameResult {
    this.running = false;
    const engine = this.engine!;

    const result: QCGameResult = {
      winner,
      reason,
      totalPly: engine.getGameData().board.ply,
      moveHistory: [...engine.getMoveHistory()],
      ...(diagnostics ? { diagnostics } : {}),
      ...(peaks && peaks.maxPropertyCount > 0 ? { quantumPeaks: peaks } : {}),
    };

    // Notify players
    this.config.white.onGameOver?.(result);
    this.config.black.onGameOver?.(result);

    onEvent?.({ type: "game_over", result });
    return result;
  }
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function isLegalChoice(choice: QCMoveChoice, legalMoves: QCLegalMoveSet): boolean {
  switch (choice.type) {
    case "standard":
      return legalMoves.standard.some(
        (m) => m.from === choice.from && m.to === choice.to
      );
    case "split":
      return legalMoves.splits.some(
        (m) =>
          m.from === choice.from &&
          ((m.targetA === choice.targetA && m.targetB === choice.targetB) ||
           (m.targetA === choice.targetB && m.targetB === choice.targetA))
      );
    case "merge":
      return legalMoves.merges.some(
        (m) =>
          m.to === choice.to &&
          ((m.sourceA === choice.sourceA && m.sourceB === choice.sourceB) ||
           (m.sourceA === choice.sourceB && m.sourceB === choice.sourceA))
      );
  }
}
