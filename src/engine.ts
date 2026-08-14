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
  legalTargetOptions,
  type QChessGameData,
  type QChessMove,
  type RulesConfig,
  type LegalTargetOptions,
  MoveVariant
} from "./core";
import type { QuantumChessAdapter, QuantumMoveResult } from "./quantum";
import { buildLegalMoveSet } from "./legal-moves";
import { measurementCanCollapse } from "./measurement";
import type {
  QCEngineView,
  QCLegalMoveSet,
  QCMoveChoice,
  QCMoveRecord,
  QCMoveExecutionResult
} from "./types";

export type MeasurementForceMode = "random" | "m0" | "m1";

/** Clamp a choice's phase rider to a canonical integer in 0..3. */
function normalizePhaseQuarters(raw: number | undefined): number {
  if (!raw || !Number.isFinite(raw)) return 0;
  return ((Math.round(raw) % 4) + 4) % 4;
}

// ---------------------------------------------------------------------------
// Helpers (moved from apps/web/src/engine/actions.ts)
// ---------------------------------------------------------------------------

function syncProbabilitiesFromQuantum(
  gameData: QChessGameData,
  quantum: QuantumChessAdapter
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
  // Opaque per-adapter snapshot returned by captureBookkeeping; the
  // engine just stores it and passes it back to restoreBookkeeping
  // verbatim. Legacy adapter returns a structural snap; WASM adapter
  // returns a frame ID. Null once a replay has invalidated it.
  adapterBookkeeping: unknown;
  /** Recorded quantum operations for reverse undo. Opaque per-adapter. */
  recordedOps?: unknown;
  /**
   * Whether undoing this move needs a replay rather than a gate reversal.
   * True when the move collapsed a superposition: measurement is not
   * unitary, so no sequence of inverse gates brings the amplitudes back.
   */
  needsReplay: boolean;
}

export class QCEngine {
  private gameData: QChessGameData;
  private readonly quantum: QuantumChessAdapter;
  private readonly rules: RulesConfig;
  private readonly moveHistory: QCMoveRecord[] = [];
  private forceMeasurement: MeasurementForceMode = "random";
  private _ignoreTurnOrder = false;

  /** Undo stack. Each executeMove pushes an entry. */
  private undoStack: EngineUndoEntry[] = [];

  /** The position used to initialize this engine (for replay-based undo). */
  private initPosition: QChessPosition | null = null;

  constructor(quantum: QuantumChessAdapter, rules: RulesConfig) {
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
    const opts: LegalTargetOptions = legalTargetOptions(ignoreTurnOrder, this.rules);
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
  getQuantum(): QuantumChessAdapter {
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
    const moves = buildLegalMoveSet(this.gameData, legalTargetOptions(undefined, this.rules));
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
    const ruleError = this.checkChoiceAgainstRules(choice);
    if (ruleError) {
      return {
        success: false,
        gameData: this.gameData,
        moveRecord: { moveString: "", notation: "", ply: this.gameData.board.ply, wasBlocked: false, wasMeasurement: false },
        measurementText: "",
        error: ruleError
      };
    }

    // Whether this move's measurement can destroy amplitude has to be read
    // from the position before the move runs.
    const canCollapse = measurementCanCollapse(this.gameData, choice);

    // Save undo entry BEFORE executing — always capture bookkeeping
    // and record quantum operations for reverse undo.
    const undoEntry: EngineUndoEntry = {
      gameData: cloneGameData(this.gameData),
      moveHistoryLength: this.moveHistory.length,
      adapterBookkeeping: this.quantum.captureBookkeeping(),
      needsReplay: false,
    };

    // Start recording quantum operations for undo
    this.quantum.startRecording();

    const phaseQuarters = normalizePhaseQuarters(choice.phaseQuarters);
    let result: QCMoveExecutionResult;
    switch (choice.type) {
      case "standard":
        result = this.executeStandardMove(choice.from, choice.to, choice.promotion, phaseQuarters);
        break;
      case "split":
        result = this.executeSplitMove(choice.from, choice.targetA, choice.targetB, phaseQuarters);
        break;
      case "merge":
        result = this.executeMergeMove(choice.sourceA, choice.sourceB, choice.to, phaseQuarters);
        break;
    }

    const recordedOps = this.quantum.stopRecording();
    if (result.success) {
      undoEntry.recordedOps = recordedOps;
      undoEntry.needsReplay = result.moveRecord.wasMeasurement && canCollapse;
      this.undoStack.push(undoEntry);
    } else {
      // Move failed — reverse any partial operations, then release the
      // bookkeeping snapshot too. Undoing only the recorded ops leaves the
      // snapshot unmatched, and an unmatched snapshot is never released by
      // the adapter: a search that rejects many moves would leak one per
      // rejection. We don't peek inside either handle (their shapes are
      // adapter-specific); the adapter is responsible for handling the
      // "nothing to undo" case as a no-op.
      this.quantum.undoRecordedOps(recordedOps);
      this.quantum.restoreBookkeeping(undoEntry.adapterBookkeeping);
    }
    return result;
  }

  /**
   * Undo the last move, restoring the quantum state exactly.
   * Returns true if undo succeeded, false if nothing to undo.
   *
   * Unitary moves are reversed in place by replaying their recorded gates
   * backwards — cheap, and exact because unitaries invert.
   *
   * A move that collapsed a superposition cannot be reversed that way: no
   * sequence of inverse gates recreates amplitudes a measurement destroyed.
   * Reversing the gates alone leaves the simulator holding a collapsed state
   * while the board cache reports the superposition restored, which is worse
   * than an error — a search would explore its second measurement branch
   * from a position that never existed. Those moves are undone by rebuilding
   * the state from the position instead. History entries carry their own
   * outcome (`.m0`/`.m1`), so the rebuild reproduces the pre-move state
   * exactly rather than re-rolling the dice.
   */
  undoMove(): boolean {
    const entry = this.undoStack.pop();
    if (!entry) return false;

    // adapterBookkeeping is null once an earlier rebuild invalidated it.
    if (entry.needsReplay || entry.adapterBookkeeping === null) {
      this.rebuildFromHistory(entry.gameData);
      return true;
    }

    // Reverse quantum operations (same simulation, no replay needed).
    // We trust the adapter's undoRecordedOps to no-op when nothing
    // needs undoing; the shape of entry.recordedOps is opaque to us.
    if (entry.recordedOps !== undefined) {
      this.quantum.undoRecordedOps(entry.recordedOps);
    }

    // Restore adapter bookkeeping (squareProps, classicalOccupied, etc.)
    this.quantum.restoreBookkeeping(entry.adapterBookkeeping);

    // Restore engine state
    this.gameData = entry.gameData;
    this.moveHistory.length = entry.moveHistoryLength;

    return true;
  }

  /**
   * Rebuild the quantum state at `target` by replaying it from the starting
   * position — the only way to recover state a measurement collapsed.
   *
   * This throws away the adapter's undo frames, so every entry still on the
   * stack loses its handles and has to take the replay path too. Leaving the
   * stale handles in place would be worse than useless: adapters are free to
   * reuse handle identities after a re-initialization, so a stale handle can
   * come to name a live frame.
   */
  private rebuildFromHistory(target: QChessGameData): void {
    if (!this.initPosition) {
      throw new Error("QCEngine: cannot undo across a measurement before initializeFromPosition");
    }
    const survivors = this.undoStack;
    this.initializeFromPosition({
      startingFen: this.initPosition.startingFen,
      setupMoves: this.initPosition.setupMoves,
      history: [...target.position.history],
    });
    for (const entry of survivors) {
      entry.adapterBookkeeping = null;
      entry.recordedOps = undefined;
    }
    this.undoStack = survivors;
  }

  /** Number of moves that can be undone. */
  get undoDepth(): number {
    return this.undoStack.length;
  }

  /**
   * Make every executed move permanent: release the adapter's undo state
   * and drop the stack. Call this once a move can no longer be taken back
   * (a committed game move). Without it the adapter's undo state grows for
   * the whole game, and the retired quantum properties it pins grow with it.
   *
   * Committing the oldest entry releases every entry above it, so one call
   * covers the whole stack.
   */
  commitUndoStack(): void {
    // Entries invalidated by a rebuild hold no handle; the oldest one that
    // still does covers every entry above it.
    const oldest = this.undoStack.find((e) => e.adapterBookkeeping !== null);
    if (oldest) this.quantum.commitBookkeeping(oldest.adapterBookkeeping);
    this.undoStack = [];
  }

  /**
   * Reject a choice the active ruleset forbids. The legal move set is
   * already gated the same way; this is the enforcement backstop for
   * callers that bypass it (direct engine use, remote inputs).
   */
  private checkChoiceAgainstRules(choice: QCMoveChoice): string | null {
    if (choice.phaseQuarters && !(this.rules.quantumEnabled && this.rules.allowPhaseRotation)) {
      return "Phase rotation is not allowed by the active ruleset.";
    }
    if (choice.type === "split" && !(this.rules.quantumEnabled && this.rules.allowSplit)) {
      return "Split moves are not allowed by the active ruleset.";
    }
    if (choice.type === "merge" && !(this.rules.quantumEnabled && this.rules.allowMerge)) {
      return "Merge moves are not allowed by the active ruleset.";
    }
    return null;
  }

  private executeStandardMove(
    source: number,
    target: number,
    promotionPiece?: string,
    phaseQuarters = 0
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
    if (move && phaseQuarters) move.phaseQuarters = phaseQuarters;

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

    const phaseSuffix = move.phaseQuarters ? `.p${move.phaseQuarters}` : "";
    const appliedNotation = `${quantumResult.measured ? `${moveString}.m1` : moveString}${phaseSuffix}`;
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
    secondTarget: number,
    phaseQuarters = 0
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
    if (move && phaseQuarters) move.phaseQuarters = phaseQuarters;
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

    const splitPhaseSuffix = move.phaseQuarters ? `.p${move.phaseQuarters}` : "";
    const splitNotation = `${quantumResult.measured ? `${moveString}.m1` : moveString}${splitPhaseSuffix}`;
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
    target: number,
    phaseQuarters = 0
  ): QCMoveExecutionResult {
    const gameData = this.gameData;
    const sourcePiece = gameData.board.pieces[sourceA] !== "." ? gameData.board.pieces[sourceA] : gameData.board.pieces[sourceB];
    const moveString = `${indexToSquareName(sourceA)}${indexToSquareName(sourceB)}^${indexToSquareName(target)}`;
    const move = parseMoveString(moveString, gameData);
    if (move && phaseQuarters) move.phaseQuarters = phaseQuarters;

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

    const mergePhaseSuffix = move.phaseQuarters ? `.p${move.phaseQuarters}` : "";
    const mergeNotation = `${quantumResult.measured ? `${moveString}.m1` : moveString}${mergePhaseSuffix}`;
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
