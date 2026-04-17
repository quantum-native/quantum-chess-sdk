import {
  cloneGameData,
  createClassicalStartGameData,
  detectKingCapture,
  fenToGameData,
  indexToSquareName,
  type QChessPosition,
  parseMoveString,
  getSplitTargets,
  applyClassicalShadowMove,
  pieceForMoveSource,
  prunePiecesByProbabilities,
  remapPieceSymbol,
  updateFiftyMoveCounter,
  isLegalStandardMove,
  type QChessGameData,
  type QChessMove,
  type RulesConfig,
  type LegalTargetOptions,
  MoveVariant
} from "./core";
import type { QuantumChessQuantumAdapter, QuantumMoveResult, RecordedOp } from "./quantum";
import { buildLegalMoveSet } from "./legal-moves";
import type {
  QCEngineView,
  QCLegalMoveSet,
  QCMoveChoice,
  QCMoveRecord,
  QCMoveExecutionResult
} from "./types";

export type MeasurementForceMode = "random" | "m0" | "m1";

// ---------------------------------------------------------------------------
// Helpers (moved from apps/web/src/engine/actions.ts)
// ---------------------------------------------------------------------------

function syncProbabilitiesFromQuantum(
  gameData: QChessGameData,
  quantum: QuantumChessQuantumAdapter
): void {
  for (let sq = 0; sq < 64; sq++) {
    gameData.board.probabilities[sq] = quantum.getExistenceProbability(sq);
  }
}

function applyMeasurementForcing(move: QChessMove, mode: MeasurementForceMode): void {
  if (mode === "random") {
    move.doesMeasurement = false;
  } else {
    move.doesMeasurement = true;
    move.measurementOutcome = mode === "m1" ? 1 : 0;
  }
}

// ---------------------------------------------------------------------------
// QCEngine
// ---------------------------------------------------------------------------

/**
 * Facade over qc-core (rules, game state) and qc-quantum (QuantumForge adapter).
 * Owns game state and quantum state. Provides legal moves, move execution, and
 * game-level queries. One instance per game.
 */
// ---------------------------------------------------------------------------
// Undo support
// ---------------------------------------------------------------------------

interface EngineUndoEntry {
  gameData: QChessGameData;           // full gameData before the move
  moveHistoryLength: number;          // moveHistory.length before the move
  adapterBookkeeping: ReturnType<QuantumChessQuantumAdapter["captureBookkeeping"]>;
  /** Recorded quantum operations for reverse undo. */
  recordedOps?: RecordedOp[];
}

export class QCEngine {
  private gameData: QChessGameData;
  private readonly quantum: QuantumChessQuantumAdapter;
  private readonly rules: RulesConfig;
  private readonly moveHistory: QCMoveRecord[] = [];
  private forceMeasurement: MeasurementForceMode = "random";
  private _ignoreTurnOrder = false;

  /** Undo stack. Each executeMove pushes an entry. */
  private undoStack: EngineUndoEntry[] = [];

  /** The position used to initialize this engine (for replay-based undo). */
  private initPosition: QChessPosition | null = null;

  constructor(quantum: QuantumChessQuantumAdapter, rules: RulesConfig) {
    this.quantum = quantum;
    this.rules = rules;
    this.gameData = createClassicalStartGameData();
  }

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  /**
   * Initialize from game data. If the game data has a move history,
   * replays from the classical starting position to correctly reconstruct
   * quantum state. Otherwise initializes classically from the snapshot.
   */
  /**
   * Initialize from a position. This is the single entry point for all initialization.
   *
   * Two-phase replay:
   * 1. Setup moves (position.setupMoves) — build quantum state. After replay,
   *    ply resets to the FEN's value, en passant clears, fifty-move counter resets.
   *    Castling rights from setup are preserved.
   * 2. Game moves (position.history) — normal gameplay replay with ply tracking.
   *
   * The FEN's active color determines whose turn it is at game start,
   * regardless of how many setup moves there are.
   */
  initializeFromPosition(position: QChessPosition): void {
    const classicalStart = fenToGameData(position.startingFen);
    if (!classicalStart) {
      throw new Error(`QCEngine: invalid startingFen "${position.startingFen}"`);
    }

    this.initPosition = {
      startingFen: position.startingFen,
      setupMoves: position.setupMoves ? [...position.setupMoves] : undefined,
      history: [] // history will be built during replay
    };
    this.undoStack = [];

    this.quantum.initializeClassical(classicalStart.board.pieces);
    let gameData = cloneGameData(classicalStart);
    gameData.position = {
      startingFen: position.startingFen,
      ...(position.setupMoves?.length ? { setupMoves: [...position.setupMoves] } : {}),
      history: []
    };
    this.moveHistory.length = 0;

    // Phase 1: Replay setup moves (quantum state construction).
    // These build superposition/entanglement but are not game moves.
    if (position.setupMoves?.length) {
      for (const ms of position.setupMoves) {
        gameData = this.replayOneMove(gameData, ms, false);
      }

      // Reset game-level state after setup. The FEN's ply (basePly) determines
      // whose turn it is at game start. Castling rights survive setup.
      const basePly = classicalStart.board.ply;
      gameData.board.ply = basePly;
      gameData.board.enPassantSquare = -1;
      gameData.board.fiftyCount = 0;
      let fiftyPieceCount = 0;
      for (let i = 0; i < 64; i++) fiftyPieceCount += gameData.board.probabilities[i];
      gameData.board.fiftyPieceCount = fiftyPieceCount;

      // Setup moves are not part of game history
      gameData.position.history = [];
      this.moveHistory.length = 0;
    }

    // Phase 2: Replay game history (normal gameplay).
    for (const ms of position.history) {
      gameData = this.replayOneMove(gameData, ms, true);
    }

    this.gameData = gameData;
  }

  /**
   * Replay a single move on the current game data and quantum adapter.
   * Updates classical shadow state, probabilities, and optionally the move history.
   * @param trackHistory If true, adds to position.history and moveHistory (game moves).
   *                     If false, skips history tracking (setup moves).
   */
  private replayOneMove(gameData: QChessGameData, ms: string, trackHistory: boolean): QChessGameData {
    const move = parseMoveString(ms, gameData);
    if (!move) return gameData;

    const sourcePiece = pieceForMoveSource(gameData, move);
    const quantumResult = this.quantum.applyMove(move);
    syncProbabilitiesFromQuantum(gameData, this.quantum);

    if (!quantumResult.applied) {
      gameData = cloneGameData(gameData);
      gameData.board.ply += 1;
      gameData.board.enPassantSquare = -1;
      const fifty = updateFiftyMoveCounter(gameData);
      gameData.board.fiftyCount = fifty.fiftyCount;
      gameData.board.fiftyPieceCount = fifty.fiftyPieceCount;
      remapPieceSymbol(gameData, sourcePiece, [move.square1]);
      if (move.square2 >= 0) {
        remapPieceSymbol(gameData, gameData.board.pieces[move.square2], [move.square2]);
      }
      prunePiecesByProbabilities(gameData);

      if (trackHistory) {
        gameData.position.history = [...gameData.position.history, ms];
        this.moveHistory.push({
          moveString: ms, notation: ms,
          ply: gameData.board.ply - 1,
          wasBlocked: true, wasMeasurement: true, measurementPassed: false
        });
      }
      return gameData;
    }

    const nextData = applyClassicalShadowMove(gameData, move);
    if (move.promotionPiece) {
      const isWhite = sourcePiece === sourcePiece.toUpperCase();
      const promoChar = String.fromCharCode(move.promotionPiece);
      const promoPiece = isWhite ? promoChar.toUpperCase() : promoChar.toLowerCase();
      remapPieceSymbol(nextData, promoPiece, [move.square2]);
      remapPieceSymbol(nextData, sourcePiece, [move.square1]);
      if (move.square3 >= 0) remapPieceSymbol(nextData, sourcePiece, [move.square3]);
    } else {
      const allSquares = [move.square1, move.square2];
      if (move.square3 >= 0) allSquares.push(move.square3);
      remapPieceSymbol(nextData, sourcePiece, allSquares);
    }
    prunePiecesByProbabilities(nextData);

    if (trackHistory) {
      nextData.position.history = [...gameData.position.history, ms];
      this.moveHistory.push({
        moveString: ms, notation: ms,
        ply: gameData.board.ply,
        wasBlocked: false,
        wasMeasurement: quantumResult.measured,
        measurementPassed: quantumResult.measured ? true : undefined
      });
    }

    return nextData;
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  /** Build a read-only view of the current game state with all legal moves. */
  getView(ignoreTurnOrder?: boolean): QCEngineView {
    const opts: LegalTargetOptions | undefined = ignoreTurnOrder ? { ignoreTurnOrder } : undefined;
    return {
      gameData: this.gameData,
      sideToMove: this.gameData.board.ply % 2 === 0 ? "white" : "black",
      legalMoves: buildLegalMoveSet(this.gameData, opts),
      moveHistory: this.moveHistory,
      quantumEnabled: this.rules.quantumEnabled,
      rules: this.rules
    };
  }

  /** Get current game data (mutable -- use with care). */
  getGameData(): QChessGameData {
    return this.gameData;
  }

  /** Get a clone of the current game data. */
  cloneGameData(): QChessGameData {
    return cloneGameData(this.gameData);
  }

  /** Get the quantum adapter. */
  getQuantum(): QuantumChessQuantumAdapter {
    return this.quantum;
  }

  /** Get the move history. */
  getMoveHistory(): readonly QCMoveRecord[] {
    return this.moveHistory;
  }

  /** Get move history as raw move strings (for replay). */
  getMoveStrings(): string[] {
    return this.moveHistory.map((r) => r.moveString);
  }

  /** Check for king capture. */
  checkWinCondition(): "white_win" | "black_win" | null {
    return detectKingCapture(this.gameData);
  }

  /** Check for stalemate (no legal moves). */
  checkStalemate(): boolean {
    const moves = buildLegalMoveSet(this.gameData);
    return moves.count === 0;
  }

  /** Check fifty-move rule. */
  checkFiftyMoveRule(): boolean {
    return this.gameData.board.fiftyCount >= 100; // 100 half-moves = 50 full moves
  }

  /** Set sandbox measurement forcing mode. */
  setForceMeasurement(mode: MeasurementForceMode): void {
    this.forceMeasurement = mode;
  }

  setIgnoreTurnOrder(ignore: boolean): void {
    this._ignoreTurnOrder = ignore;
  }

  // -------------------------------------------------------------------------
  // Move execution
  // -------------------------------------------------------------------------

  /**
   * Apply a move through the quantum adapter, with forced-measurement
   * post-selection validation. If forcing produced an impossible outcome
   * (zero-norm state), rebuilds quantum state from position and returns null.
   */
  private applyQuantumMove(move: QChessMove, gameData: QChessGameData): QuantumMoveResult | null {
    const isForced = this.forceMeasurement !== "random";
    if (isForced) applyMeasurementForcing(move, this.forceMeasurement);

    const result = this.quantum.applyMove(move);

    // Post-selection check: a forced measurement that is impossible in the
    // current entangled state produces a zero-norm state (no pieces survive).
    // Reverse the operations to restore the pre-move quantum state.
    if (isForced && move.doesMeasurement && this.quantum.getTotalProbability() < 1e-6) {
      // The recorded ops from this move will be reversed by the caller
      // (executeMove handles failed moves by undoing recorded ops).
      // We just need to signal failure by returning null.
      return null;
    }

    return result;
  }

  /**
   * Execute a move choice against the current game state.
   * This is the primary move execution method used by QCMatchRunner.
   */
  executeMove(choice: QCMoveChoice): QCMoveExecutionResult {
    // Save undo entry BEFORE executing — always capture bookkeeping
    // and record quantum operations for reverse undo.
    const undoEntry: EngineUndoEntry = {
      gameData: cloneGameData(this.gameData),
      moveHistoryLength: this.moveHistory.length,
      adapterBookkeeping: this.quantum.captureBookkeeping(),
    };

    // Start recording quantum operations for undo
    this.quantum.startRecording();

    let result: QCMoveExecutionResult;
    switch (choice.type) {
      case "standard":
        result = this.executeStandardMove(choice.from, choice.to, choice.promotion);
        break;
      case "split":
        result = this.executeSplitMove(choice.from, choice.targetA, choice.targetB);
        break;
      case "merge":
        result = this.executeMergeMove(choice.sourceA, choice.sourceB, choice.to);
        break;
    }

    const recordedOps = this.quantum.stopRecording();
    if (result.success) {
      undoEntry.recordedOps = recordedOps;
      this.undoStack.push(undoEntry);
    } else {
      // Move failed — reverse any partial operations
      if (recordedOps.length > 0) {
        this.quantum.undoRecordedOps(recordedOps);
      }
    }
    return result;
  }

  /**
   * Undo the last move. For classical positions, restores directly.
   * For quantum positions, replays from the initial position.
   * Returns true if undo succeeded, false if nothing to undo.
   */
  undoMove(): boolean {
    const entry = this.undoStack.pop();
    if (!entry) return false;

    // Reverse quantum operations (same simulation, no replay needed)
    if (entry.recordedOps && entry.recordedOps.length > 0) {
      this.quantum.undoRecordedOps(entry.recordedOps);
    }

    // Restore adapter bookkeeping (squareProps, classicalOccupied, etc.)
    this.quantum.restoreBookkeeping(entry.adapterBookkeeping);

    // Restore engine state
    this.gameData = entry.gameData;
    this.moveHistory.length = entry.moveHistoryLength;

    return true;
  }

  /** Number of moves that can be undone. */
  get undoDepth(): number {
    return this.undoStack.length;
  }

  /** Clear the undo stack (e.g., after committing a position). */
  clearUndoStack(): void {
    this.undoStack = [];
  }

  private executeStandardMove(
    source: number,
    target: number,
    promotionPiece?: string
  ): QCMoveExecutionResult {
    const gameData = this.gameData;
    const movingPiece = gameData.board.pieces[source];
    const targetPiece = gameData.board.pieces[target];
    const epSuffix = gameData.board.enPassantSquare === target && movingPiece.toLowerCase() === "p" ? "ep" : "";
    const promoSuffix = promotionPiece
      ? (movingPiece === movingPiece.toUpperCase() ? promotionPiece.toUpperCase() : promotionPiece.toLowerCase())
      : "";
    const moveString = `${indexToSquareName(source)}-${indexToSquareName(target)}${epSuffix}${promoSuffix}`;
    const move = parseMoveString(moveString, gameData);

    const legalOpts = this._ignoreTurnOrder ? { ignoreTurnOrder: true } : undefined;
    if (!move || !isLegalStandardMove(gameData, move, legalOpts)) {
      return {
        success: false,
        gameData,
        moveRecord: { moveString, notation: moveString, ply: gameData.board.ply, wasBlocked: false, wasMeasurement: false },
        measurementText: ""
      };
    }

    const quantumResult = this.applyQuantumMove(move, gameData);
    if (!quantumResult) {
      return {
        success: false,
        gameData,
        moveRecord: { moveString, notation: moveString, ply: gameData.board.ply, wasBlocked: false, wasMeasurement: false },
        measurementText: "",
        error: `Forced measurement m${move.measurementOutcome} is impossible here. Change the forced outcome and try again.`
      };
    }

    syncProbabilitiesFromQuantum(gameData, this.quantum);

    let measurementText = "";
    if (quantumResult.measured) {
      measurementText = quantumResult.applied
        ? "Measured \u2713 \u2192 move applied"
        : "Measured \u2717 \u2192 no-op turn";
    }

    if (!quantumResult.applied) {
      if (quantumResult.measured) {
        const next = cloneGameData(gameData);
        next.board.ply += 1;
        next.board.enPassantSquare = -1;
        const fifty = updateFiftyMoveCounter(next);
        next.board.fiftyCount = fifty.fiftyCount;
        next.board.fiftyPieceCount = fifty.fiftyPieceCount;
        remapPieceSymbol(next, movingPiece, [source]);
        remapPieceSymbol(next, targetPiece, [target]);
        prunePiecesByProbabilities(next);
        next.position.history = [...gameData.position.history, `${moveString}.m0`];

        const record: QCMoveRecord = {
          moveString: `${moveString}.m0`,
          notation: `${moveString}.m0`,
          ply: gameData.board.ply,
          wasBlocked: true,
          wasMeasurement: true,
          measurementPassed: false,
          probabilitiesAfter: [...next.board.probabilities]
        };
        this.gameData = next;
        this.moveHistory.push(record);
        return { success: true, gameData: next, moveRecord: record, measurementText };
      }
      return {
        success: false,
        gameData,
        moveRecord: { moveString, notation: moveString, ply: gameData.board.ply, wasBlocked: false, wasMeasurement: false },
        measurementText
      };
    }

    const nextData = applyClassicalShadowMove(gameData, move);
    if (move.promotionPiece) {
      const isWhite = movingPiece === movingPiece.toUpperCase();
      const promoChar = String.fromCharCode(move.promotionPiece);
      const promoPiece = isWhite ? promoChar.toUpperCase() : promoChar.toLowerCase();
      remapPieceSymbol(nextData, promoPiece, [move.square2]);
      remapPieceSymbol(nextData, movingPiece, [move.square1]);
    } else {
      remapPieceSymbol(nextData, movingPiece, [move.square1, move.square2]);
    }
    prunePiecesByProbabilities(nextData);

    const appliedNotation = quantumResult.measured ? `${moveString}.m1` : moveString;
    nextData.position.history = [...gameData.position.history, appliedNotation];
    const record: QCMoveRecord = {
      moveString: appliedNotation,
      notation: appliedNotation,
      ply: gameData.board.ply,
      wasBlocked: false,
      wasMeasurement: quantumResult.measured,
      measurementPassed: quantumResult.measured ? true : undefined,
      probabilitiesAfter: [...nextData.board.probabilities]
    };
    this.gameData = nextData;
    this.moveHistory.push(record);
    return { success: true, gameData: nextData, moveRecord: record, measurementText };
  }

  private executeSplitMove(
    source: number,
    firstTarget: number,
    secondTarget: number
  ): QCMoveExecutionResult {
    const gameData = this.gameData;

    if (firstTarget === secondTarget) {
      return {
        success: false,
        gameData,
        moveRecord: { moveString: "", notation: "", ply: gameData.board.ply, wasBlocked: false, wasMeasurement: false },
        measurementText: ""
      };
    }

    const sourcePiece = gameData.board.pieces[source];
    const moveString = `${indexToSquareName(source)}^${indexToSquareName(firstTarget)}${indexToSquareName(secondTarget)}`;
    const move = parseMoveString(moveString, gameData);
    if (!move) {
      return {
        success: false,
        gameData,
        moveRecord: { moveString, notation: moveString, ply: gameData.board.ply, wasBlocked: false, wasMeasurement: false },
        measurementText: ""
      };
    }

    const quantumResult = this.applyQuantumMove(move, gameData);
    if (!quantumResult) {
      return {
        success: false,
        gameData,
        moveRecord: { moveString, notation: moveString, ply: gameData.board.ply, wasBlocked: false, wasMeasurement: false },
        measurementText: "",
        error: `Forced measurement m${move.measurementOutcome} is impossible here. Change the forced outcome and try again.`
      };
    }

    syncProbabilitiesFromQuantum(gameData, this.quantum);

    const measurementText = quantumResult.measured
      ? (quantumResult.applied ? "Measured \u2713 \u2192 move applied" : "Measured \u2717 \u2192 no-op turn")
      : "";

    if (!quantumResult.applied) {
      return {
        success: false,
        gameData,
        moveRecord: { moveString, notation: moveString, ply: gameData.board.ply, wasBlocked: false, wasMeasurement: false },
        measurementText
      };
    }

    const nextData = applyClassicalShadowMove(gameData, move);
    remapPieceSymbol(nextData, sourcePiece, [move.square1, move.square2, move.square3]);
    prunePiecesByProbabilities(nextData);

    const splitNotation = quantumResult.measured ? `${moveString}.m1` : moveString;
    nextData.position.history = [...gameData.position.history, splitNotation];
    const record: QCMoveRecord = {
      moveString: splitNotation,
      notation: splitNotation,
      ply: gameData.board.ply,
      wasBlocked: false,
      wasMeasurement: quantumResult.measured,
      measurementPassed: quantumResult.measured ? true : undefined,
      probabilitiesAfter: [...nextData.board.probabilities]
    };
    this.gameData = nextData;
    this.moveHistory.push(record);
    return { success: true, gameData: nextData, moveRecord: record, measurementText };
  }

  private executeMergeMove(
    sourceA: number,
    sourceB: number,
    target: number
  ): QCMoveExecutionResult {
    const gameData = this.gameData;
    const sourcePiece = gameData.board.pieces[sourceA] !== "." ? gameData.board.pieces[sourceA] : gameData.board.pieces[sourceB];
    const moveString = `${indexToSquareName(sourceA)}${indexToSquareName(sourceB)}^${indexToSquareName(target)}`;
    const move = parseMoveString(moveString, gameData);

    if (!move) {
      return {
        success: false,
        gameData,
        moveRecord: { moveString, notation: moveString, ply: gameData.board.ply, wasBlocked: false, wasMeasurement: false },
        measurementText: ""
      };
    }

    const quantumResult = this.applyQuantumMove(move, gameData);
    if (!quantumResult) {
      return {
        success: false,
        gameData,
        moveRecord: { moveString, notation: moveString, ply: gameData.board.ply, wasBlocked: false, wasMeasurement: false },
        measurementText: "",
        error: `Forced measurement m${move.measurementOutcome} is impossible here. Change the forced outcome and try again.`
      };
    }

    syncProbabilitiesFromQuantum(gameData, this.quantum);

    const measurementText = quantumResult.measured
      ? (quantumResult.applied ? "Measured \u2713 \u2192 move applied" : "Measured \u2717 \u2192 no-op turn")
      : "";

    if (!quantumResult.applied) {
      return {
        success: false,
        gameData,
        moveRecord: { moveString, notation: moveString, ply: gameData.board.ply, wasBlocked: false, wasMeasurement: false },
        measurementText
      };
    }

    const nextData = applyClassicalShadowMove(gameData, move);
    remapPieceSymbol(nextData, sourcePiece, [move.square1, move.square2, move.square3]);
    prunePiecesByProbabilities(nextData);

    const mergeNotation = quantumResult.measured ? `${moveString}.m1` : moveString;
    nextData.position.history = [...gameData.position.history, mergeNotation];
    const record: QCMoveRecord = {
      moveString: mergeNotation,
      notation: mergeNotation,
      ply: gameData.board.ply,
      wasBlocked: false,
      wasMeasurement: quantumResult.measured,
      measurementPassed: quantumResult.measured ? true : undefined,
      probabilitiesAfter: [...nextData.board.probabilities]
    };
    this.gameData = nextData;
    this.moveHistory.push(record);
    return { success: true, gameData: nextData, moveRecord: record, measurementText };
  }
}
