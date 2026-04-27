import {
  applyClassicalShadowMove,
  buildStandardMoveFromSquares,
  cloneGameData,
  createClassicalStartGameData,
  detectKingCapture,
  fenToGameData,
  getMergeTargets,
  getSplitTargets,
  indexToSquareName,
  isCurrentTurnPiece,
  isLegalStandardMove,
  parseMoveString,
  pieceForMoveSource,
  prunePiecesByProbabilities,
  remapPieceSymbol,
  updateFiftyMoveCounter
} from "./chunk-HYPD7VU7.js";

// src/attacks.ts
function fileOf(sq) {
  return sq & 7;
}
function rankOf(sq) {
  return sq >> 3;
}
function toIndex(file, rank) {
  return rank * 8 + file;
}
var KNIGHT_OFFSETS = [
  { df: -2, dr: -1 },
  { df: -2, dr: 1 },
  { df: -1, dr: -2 },
  { df: -1, dr: 2 },
  { df: 1, dr: -2 },
  { df: 1, dr: 2 },
  { df: 2, dr: -1 },
  { df: 2, dr: 1 }
];
var KNIGHT_ATTACKS = (() => {
  const table = [];
  for (let sq = 0; sq < 64; sq++) {
    const f = fileOf(sq), r = rankOf(sq);
    const targets = [];
    for (const { df, dr } of KNIGHT_OFFSETS) {
      const nf = f + df, nr = r + dr;
      if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) targets.push(toIndex(nf, nr));
    }
    table.push(targets);
  }
  return table;
})();
var KING_OFFSETS = [
  { df: -1, dr: -1 },
  { df: -1, dr: 0 },
  { df: -1, dr: 1 },
  { df: 0, dr: -1 },
  { df: 0, dr: 1 },
  { df: 1, dr: -1 },
  { df: 1, dr: 0 },
  { df: 1, dr: 1 }
];
var KING_ATTACKS = (() => {
  const table = [];
  for (let sq = 0; sq < 64; sq++) {
    const f = fileOf(sq), r = rankOf(sq);
    const targets = [];
    for (const { df, dr } of KING_OFFSETS) {
      const nf = f + df, nr = r + dr;
      if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) targets.push(toIndex(nf, nr));
    }
    table.push(targets);
  }
  return table;
})();
var ROOK_DIRECTIONS = [
  { df: 0, dr: 1 },
  { df: 0, dr: -1 },
  { df: 1, dr: 0 },
  { df: -1, dr: 0 }
];
var BISHOP_DIRECTIONS = [
  { df: 1, dr: 1 },
  { df: 1, dr: -1 },
  { df: -1, dr: 1 },
  { df: -1, dr: -1 }
];
function buildRayTable(directions) {
  const table = [];
  for (let sq = 0; sq < 64; sq++) {
    const rays = [];
    const f = fileOf(sq), r = rankOf(sq);
    for (const { df, dr } of directions) {
      const ray = [];
      let nf = f + df, nr = r + dr;
      while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
        ray.push(toIndex(nf, nr));
        nf += df;
        nr += dr;
      }
      rays.push(ray);
    }
    table.push(rays);
  }
  return table;
}
var ROOK_RAYS = buildRayTable(ROOK_DIRECTIONS);
var BISHOP_RAYS = buildRayTable(BISHOP_DIRECTIONS);
var QUEEN_RAYS = buildRayTable([...ROOK_DIRECTIONS, ...BISHOP_DIRECTIONS]);
var WHITE_PAWN_PUSHES = (() => {
  const table = [];
  for (let sq = 0; sq < 64; sq++) {
    const r = rankOf(sq);
    const targets = [];
    if (r < 7) targets.push(sq + 8);
    if (r === 1) targets.push(sq + 16);
    table.push(targets);
  }
  return table;
})();
var BLACK_PAWN_PUSHES = (() => {
  const table = [];
  for (let sq = 0; sq < 64; sq++) {
    const r = rankOf(sq);
    const targets = [];
    if (r > 0) targets.push(sq - 8);
    if (r === 6) targets.push(sq - 16);
    table.push(targets);
  }
  return table;
})();
var WHITE_PAWN_CAPTURES = (() => {
  const table = [];
  for (let sq = 0; sq < 64; sq++) {
    const f = fileOf(sq), r = rankOf(sq);
    const targets = [];
    if (r < 7 && f > 0) targets.push(sq + 7);
    if (r < 7 && f < 7) targets.push(sq + 9);
    table.push(targets);
  }
  return table;
})();
var BLACK_PAWN_CAPTURES = (() => {
  const table = [];
  for (let sq = 0; sq < 64; sq++) {
    const f = fileOf(sq), r = rankOf(sq);
    const targets = [];
    if (r > 0 && f > 0) targets.push(sq - 9);
    if (r > 0 && f < 7) targets.push(sq - 7);
    table.push(targets);
  }
  return table;
})();
function fastLegalTargets(pieces, probs, source, piece, isWhite, enPassantSquare, castleFlags) {
  const targets = [];
  const pt = piece.toLowerCase();
  const PROB_EPSILON = 1e-6;
  const canLandOn = (sq) => {
    const tp = pieces[sq];
    if (tp === "." || probs[sq] < PROB_EPSILON) return true;
    const targetWhite = tp >= "A" && tp <= "Z";
    if (targetWhite !== isWhite) return true;
    return probs[sq] < 1 - PROB_EPSILON;
  };
  const isFull = (sq) => {
    return pieces[sq] !== "." && probs[sq] > 1 - PROB_EPSILON;
  };
  switch (pt) {
    case "n":
      for (const t of KNIGHT_ATTACKS[source]) {
        if (canLandOn(t)) targets.push(t);
      }
      break;
    case "k": {
      for (const t of KING_ATTACKS[source]) {
        if (canLandOn(t)) targets.push(t);
      }
      const rank = isWhite ? 0 : 7;
      const kingSq = rank * 8 + 4;
      if (source === kingSq) {
        const ksBit = isWhite ? 1 : 4;
        if (castleFlags & ksBit && !isFull(kingSq + 1) && !isFull(kingSq + 2)) {
          targets.push(kingSq + 2);
        }
        const qsBit = isWhite ? 2 : 8;
        if (castleFlags & qsBit && !isFull(kingSq - 1) && !isFull(kingSq - 2) && !isFull(kingSq - 3)) {
          targets.push(kingSq - 2);
        }
      }
      break;
    }
    case "r":
      for (const ray of ROOK_RAYS[source]) {
        for (const t of ray) {
          if (canLandOn(t)) targets.push(t);
          if (isFull(t)) break;
        }
      }
      break;
    case "b":
      for (const ray of BISHOP_RAYS[source]) {
        for (const t of ray) {
          if (canLandOn(t)) targets.push(t);
          if (isFull(t)) break;
        }
      }
      break;
    case "q":
      for (const ray of QUEEN_RAYS[source]) {
        for (const t of ray) {
          if (canLandOn(t)) targets.push(t);
          if (isFull(t)) break;
        }
      }
      break;
    case "p": {
      const pushes = isWhite ? WHITE_PAWN_PUSHES[source] : BLACK_PAWN_PUSHES[source];
      const captures = isWhite ? WHITE_PAWN_CAPTURES[source] : BLACK_PAWN_CAPTURES[source];
      for (const t of pushes) {
        if (isFull(t)) break;
        targets.push(t);
      }
      for (const t of captures) {
        if (t === enPassantSquare) {
          targets.push(t);
        } else {
          const tp = pieces[t];
          if (tp === "." || probs[t] < PROB_EPSILON) continue;
          const targetWhite = tp >= "A" && tp <= "Z";
          if (targetWhite !== isWhite) targets.push(t);
        }
      }
      break;
    }
  }
  return targets;
}

// src/legal-moves.ts
var EPSILON = 1e-6;
function buildLegalMoveSet(gameData, options) {
  const standard = buildStandardMoves(gameData, options);
  const splits = buildSplitMoves(gameData, options);
  const merges = buildMergeMoves(gameData, options);
  return {
    standard,
    splits,
    merges,
    count: standard.length + splits.length + merges.length
  };
}
function buildStandardMoves(gameData, options) {
  const moves = [];
  const { pieces, probabilities, ply, enPassantSquare, castleFlags } = gameData.board;
  for (let source = 0; source < 64; source++) {
    const piece = pieces[source];
    if (piece === "." || probabilities[source] <= EPSILON) continue;
    if (!options?.ignoreTurnOrder && !isCurrentTurnPiece(piece, ply, probabilities[source])) continue;
    const isWhite = piece >= "A" && piece <= "Z";
    const targets = fastLegalTargets(
      pieces,
      probabilities,
      source,
      piece,
      isWhite,
      enPassantSquare,
      castleFlags
    );
    for (const target of targets) {
      const parsed = buildStandardMoveFromSquares(source, target, gameData);
      const move = {
        from: source,
        to: target,
        type: parsed.type,
        variant: parsed.variant,
        willMeasure: parsed.variant === 2 /* Excluded */ || parsed.variant === 3 /* Capture */,
        piece,
        notation: ""
      };
      if (piece.toLowerCase() === "p") {
        const targetRank = target >> 3;
        const isPromotion = piece === "P" && targetRank === 7 || piece === "p" && targetRank === 0;
        if (isPromotion) {
          move.promotionChoices = ["q", "r", "b", "n"];
        }
      }
      moves.push(move);
    }
  }
  return moves;
}
function buildSplitMoves(gameData, options) {
  const splits = [];
  for (let source = 0; source < 64; source++) {
    const piece = gameData.board.pieces[source];
    if (piece === "." || gameData.board.probabilities[source] <= EPSILON) continue;
    if (piece.toLowerCase() === "p") continue;
    if (!options?.ignoreTurnOrder && !isCurrentTurnPiece(piece, gameData.board.ply, gameData.board.probabilities[source])) continue;
    const targets = getSplitTargets(gameData, source, options);
    if (targets.length < 2) continue;
    for (let i = 0; i < targets.length; i++) {
      for (let j = i + 1; j < targets.length; j++) {
        const srcName = indexToSquareName(source);
        const t1Name = indexToSquareName(targets[i]);
        const t2Name = indexToSquareName(targets[j]);
        const notation = `${srcName}^${t1Name}${t2Name}`;
        const parsed = parseMoveString(notation, gameData);
        if (!parsed) continue;
        splits.push({
          from: source,
          targetA: targets[i],
          targetB: targets[j],
          type: parsed.type,
          piece,
          notation
        });
      }
    }
  }
  return splits;
}
function buildMergeMoves(gameData, options) {
  const merges = [];
  const pieceSources = /* @__PURE__ */ new Map();
  for (let sq = 0; sq < 64; sq++) {
    const piece = gameData.board.pieces[sq];
    if (piece === "." || piece.toLowerCase() === "p") continue;
    if (gameData.board.probabilities[sq] <= EPSILON) continue;
    if (!options?.ignoreTurnOrder && !isCurrentTurnPiece(piece, gameData.board.ply, gameData.board.probabilities[sq])) continue;
    const existing = pieceSources.get(piece);
    if (existing) {
      existing.push(sq);
    } else {
      pieceSources.set(piece, [sq]);
    }
  }
  for (const [piece, sources] of pieceSources) {
    if (sources.length < 2) continue;
    for (let i = 0; i < sources.length; i++) {
      for (let j = i + 1; j < sources.length; j++) {
        const targets = getMergeTargets(gameData, sources[i], sources[j], options);
        for (const target of targets) {
          const s1Name = indexToSquareName(sources[i]);
          const s2Name = indexToSquareName(sources[j]);
          const tName = indexToSquareName(target);
          const notation = `${s1Name}${s2Name}^${tName}`;
          const parsed = parseMoveString(notation, gameData);
          if (!parsed) continue;
          merges.push({
            sourceA: sources[i],
            sourceB: sources[j],
            to: target,
            type: parsed.type,
            piece,
            notation
          });
        }
      }
    }
  }
  return merges;
}

// src/engine.ts
function syncProbabilitiesFromQuantum(gameData, quantum) {
  for (let sq = 0; sq < 64; sq++) {
    gameData.board.probabilities[sq] = quantum.getExistenceProbability(sq);
  }
}
function applyMeasurementForcing(move, mode) {
  if (mode === "random") {
    move.doesMeasurement = false;
  } else {
    move.doesMeasurement = true;
    move.measurementOutcome = mode === "m1" ? 1 : 0;
  }
}
var QCEngine = class {
  gameData;
  quantum;
  rules;
  moveHistory = [];
  forceMeasurement = "random";
  _ignoreTurnOrder = false;
  /** Undo stack. Each executeMove pushes an entry. */
  undoStack = [];
  /** The position used to initialize this engine (for replay-based undo). */
  initPosition = null;
  constructor(quantum, rules) {
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
  initializeFromPosition(position) {
    const classicalStart = fenToGameData(position.startingFen);
    if (!classicalStart) {
      throw new Error(`QCEngine: invalid startingFen "${position.startingFen}"`);
    }
    this.initPosition = {
      startingFen: position.startingFen,
      setupMoves: position.setupMoves ? [...position.setupMoves] : void 0,
      history: []
      // history will be built during replay
    };
    this.undoStack = [];
    this.quantum.initializeClassical(classicalStart.board.pieces);
    let gameData = cloneGameData(classicalStart);
    gameData.position = {
      startingFen: position.startingFen,
      ...position.setupMoves?.length ? { setupMoves: [...position.setupMoves] } : {},
      history: []
    };
    this.moveHistory.length = 0;
    if (position.setupMoves?.length) {
      for (const ms of position.setupMoves) {
        gameData = this.replayOneMove(gameData, ms, false);
      }
      const basePly = classicalStart.board.ply;
      gameData.board.ply = basePly;
      gameData.board.enPassantSquare = -1;
      gameData.board.fiftyCount = 0;
      let fiftyPieceCount = 0;
      for (let i = 0; i < 64; i++) fiftyPieceCount += gameData.board.probabilities[i];
      gameData.board.fiftyPieceCount = fiftyPieceCount;
      gameData.position.history = [];
      this.moveHistory.length = 0;
    }
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
  replayOneMove(gameData, ms, trackHistory) {
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
          moveString: ms,
          notation: ms,
          ply: gameData.board.ply - 1,
          wasBlocked: true,
          wasMeasurement: true,
          measurementPassed: false
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
        moveString: ms,
        notation: ms,
        ply: gameData.board.ply,
        wasBlocked: false,
        wasMeasurement: quantumResult.measured,
        measurementPassed: quantumResult.measured ? true : void 0
      });
    }
    return nextData;
  }
  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------
  /** Build a read-only view of the current game state with all legal moves. */
  getView(ignoreTurnOrder) {
    const opts = ignoreTurnOrder ? { ignoreTurnOrder } : void 0;
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
  getGameData() {
    return this.gameData;
  }
  /** Get a clone of the current game data. */
  cloneGameData() {
    return cloneGameData(this.gameData);
  }
  /** Get the quantum adapter. */
  getQuantum() {
    return this.quantum;
  }
  /** Get the move history. */
  getMoveHistory() {
    return this.moveHistory;
  }
  /** Get move history as raw move strings (for replay). */
  getMoveStrings() {
    return this.moveHistory.map((r) => r.moveString);
  }
  /** Check for king capture. */
  checkWinCondition() {
    return detectKingCapture(this.gameData);
  }
  /** Check for stalemate (no legal moves). */
  checkStalemate() {
    const moves = buildLegalMoveSet(this.gameData);
    return moves.count === 0;
  }
  /** Check fifty-move rule. */
  checkFiftyMoveRule() {
    return this.gameData.board.fiftyCount >= 100;
  }
  /** Set sandbox measurement forcing mode. */
  setForceMeasurement(mode) {
    this.forceMeasurement = mode;
  }
  setIgnoreTurnOrder(ignore) {
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
  applyQuantumMove(move, gameData) {
    const isForced = this.forceMeasurement !== "random";
    if (isForced) applyMeasurementForcing(move, this.forceMeasurement);
    const result = this.quantum.applyMove(move);
    if (isForced && move.doesMeasurement && this.quantum.getTotalProbability() < 1e-6) {
      return null;
    }
    return result;
  }
  /**
   * Execute a move choice against the current game state.
   * This is the primary move execution method used by QCMatchRunner.
   */
  executeMove(choice) {
    const undoEntry = {
      gameData: cloneGameData(this.gameData),
      moveHistoryLength: this.moveHistory.length,
      adapterBookkeeping: this.quantum.captureBookkeeping()
    };
    this.quantum.startRecording();
    let result;
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
  undoMove() {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    if (entry.recordedOps && entry.recordedOps.length > 0) {
      this.quantum.undoRecordedOps(entry.recordedOps);
    }
    this.quantum.restoreBookkeeping(entry.adapterBookkeeping);
    this.gameData = entry.gameData;
    this.moveHistory.length = entry.moveHistoryLength;
    return true;
  }
  /** Number of moves that can be undone. */
  get undoDepth() {
    return this.undoStack.length;
  }
  /** Clear the undo stack (e.g., after committing a position). */
  clearUndoStack() {
    this.undoStack = [];
  }
  executeStandardMove(source, target, promotionPiece) {
    const gameData = this.gameData;
    const movingPiece = gameData.board.pieces[source];
    const targetPiece = gameData.board.pieces[target];
    const epSuffix = gameData.board.enPassantSquare === target && movingPiece.toLowerCase() === "p" ? "ep" : "";
    const promoSuffix = promotionPiece ? movingPiece === movingPiece.toUpperCase() ? promotionPiece.toUpperCase() : promotionPiece.toLowerCase() : "";
    const moveString = `${indexToSquareName(source)}-${indexToSquareName(target)}${epSuffix}${promoSuffix}`;
    const move = parseMoveString(moveString, gameData);
    const legalOpts = this._ignoreTurnOrder ? { ignoreTurnOrder: true } : void 0;
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
      measurementText = quantumResult.applied ? "Measured \u2713 \u2192 move applied" : "Measured \u2717 \u2192 no-op turn";
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
        const record2 = {
          moveString: `${moveString}.m0`,
          notation: `${moveString}.m0`,
          ply: gameData.board.ply,
          wasBlocked: true,
          wasMeasurement: true,
          measurementPassed: false,
          probabilitiesAfter: [...next.board.probabilities]
        };
        this.gameData = next;
        this.moveHistory.push(record2);
        return { success: true, gameData: next, moveRecord: record2, measurementText };
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
    const record = {
      moveString: appliedNotation,
      notation: appliedNotation,
      ply: gameData.board.ply,
      wasBlocked: false,
      wasMeasurement: quantumResult.measured,
      measurementPassed: quantumResult.measured ? true : void 0,
      probabilitiesAfter: [...nextData.board.probabilities]
    };
    this.gameData = nextData;
    this.moveHistory.push(record);
    return { success: true, gameData: nextData, moveRecord: record, measurementText };
  }
  executeSplitMove(source, firstTarget, secondTarget) {
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
    const measurementText = quantumResult.measured ? quantumResult.applied ? "Measured \u2713 \u2192 move applied" : "Measured \u2717 \u2192 no-op turn" : "";
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
    const record = {
      moveString: splitNotation,
      notation: splitNotation,
      ply: gameData.board.ply,
      wasBlocked: false,
      wasMeasurement: quantumResult.measured,
      measurementPassed: quantumResult.measured ? true : void 0,
      probabilitiesAfter: [...nextData.board.probabilities]
    };
    this.gameData = nextData;
    this.moveHistory.push(record);
    return { success: true, gameData: nextData, moveRecord: record, measurementText };
  }
  executeMergeMove(sourceA, sourceB, target) {
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
    const measurementText = quantumResult.measured ? quantumResult.applied ? "Measured \u2713 \u2192 move applied" : "Measured \u2717 \u2192 no-op turn" : "";
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
    const record = {
      moveString: mergeNotation,
      notation: mergeNotation,
      ply: gameData.board.ply,
      wasBlocked: false,
      wasMeasurement: quantumResult.measured,
      measurementPassed: quantumResult.measured ? true : void 0,
      probabilitiesAfter: [...nextData.board.probabilities]
    };
    this.gameData = nextData;
    this.moveHistory.push(record);
    return { success: true, gameData: nextData, moveRecord: record, measurementText };
  }
};

// src/stack-explorer.ts
var PIECE_VALUES = {
  P: 1,
  N: 3,
  B: 3,
  R: 5,
  Q: 9,
  K: 0,
  p: -1,
  n: -3,
  b: -3,
  r: -5,
  q: -9,
  k: 0
};
function saveSnapshot(gd) {
  return {
    pieces: [...gd.board.pieces],
    probabilities: [...gd.board.probabilities],
    ply: gd.board.ply,
    castleFlags: gd.board.castleFlags,
    enPassantSquare: gd.board.enPassantSquare,
    fiftyCount: gd.board.fiftyCount,
    fiftyPieceCount: gd.board.fiftyPieceCount,
    historyLength: gd.position.history.length
  };
}
function restoreSnapshot(gd, snap) {
  gd.board.pieces = snap.pieces;
  gd.board.probabilities = snap.probabilities;
  gd.board.ply = snap.ply;
  gd.board.castleFlags = snap.castleFlags;
  gd.board.enPassantSquare = snap.enPassantSquare;
  gd.board.fiftyCount = snap.fiftyCount;
  gd.board.fiftyPieceCount = snap.fiftyPieceCount;
  gd.position.history = gd.position.history.slice(0, snap.historyLength);
}
var StackExplorer = class _StackExplorer {
  engine;
  rules;
  /** Dispose callback to destroy the isolated simulation when done. */
  _dispose;
  depth;
  undoStack = [];
  _cachedLegalMoves = null;
  constructor(engine, rules, depth = 0, dispose) {
    this.engine = engine;
    this.rules = rules;
    this.depth = depth;
    this._dispose = dispose ?? null;
  }
  /** Destroy the search simulation. Call after chooseMove returns. */
  dispose() {
    this._dispose?.();
  }
  // -----------------------------------------------------------------------
  // QCExplorer interface
  // -----------------------------------------------------------------------
  get view() {
    if (!this._cachedLegalMoves) {
      this._cachedLegalMoves = buildLegalMoveSet(this.engine.getGameData());
    }
    const gd = this.engine.getGameData();
    return {
      gameData: gd,
      sideToMove: gd.board.ply % 2 === 0 ? "white" : "black",
      legalMoves: this._cachedLegalMoves,
      moveHistory: [],
      quantumEnabled: this.rules.quantumEnabled,
      rules: this.rules
    };
  }
  evaluate() {
    const gd = this.engine.getGameData();
    let materialBalance = 0;
    for (let sq = 0; sq < 64; sq++) {
      const piece = gd.board.pieces[sq];
      const prob = gd.board.probabilities[sq];
      if (piece === "." || prob <= 1e-6) continue;
      materialBalance += (PIECE_VALUES[piece] ?? 0) * prob;
    }
    const kingCapture = detectKingCapture(gd);
    const legalMoves = this._cachedLegalMoves ?? buildLegalMoveSet(gd);
    return {
      score: kingCapture === "white_win" ? 1e4 : kingCapture === "black_win" ? -1e4 : materialBalance,
      materialBalance,
      isCheckmate: kingCapture !== null,
      isStalemate: kingCapture === null && legalMoves.count === 0
    };
  }
  /**
   * Collapse the current quantum state into N classical board snapshots.
   * Uses the joint probability distribution from QuantumForge to preserve
   * entanglement correlations (e.g., a split piece appears on exactly one
   * of its two squares, never both).
   */
  sample(count) {
    const gd = this.engine.getGameData();
    const adapter = this.engine.quantum;
    const quantumSquares = [];
    const handles = [];
    if (adapter?.squareProps) {
      for (const [sq, handle] of adapter.squareProps) {
        quantumSquares.push(sq);
        handles.push(handle);
      }
    }
    if (handles.length === 0) {
      return Array.from({ length: count }, () => ({ pieces: [...gd.board.pieces], weight: 1 }));
    }
    const joint = adapter.port.probabilities(handles);
    const cdf = [];
    let cumulative = 0;
    for (const entry of joint) {
      cumulative += entry.probability;
      cdf.push(cumulative);
    }
    const samples = [];
    for (let i = 0; i < count; i++) {
      const pieces = [...gd.board.pieces];
      const r = Math.random() * cumulative;
      let outcomeIdx = 0;
      for (let j = 0; j < cdf.length; j++) {
        if (r <= cdf[j]) {
          outcomeIdx = j;
          break;
        }
      }
      const outcome = joint[outcomeIdx].qudit_values;
      for (let k = 0; k < quantumSquares.length; k++) {
        if (outcome[k] === 0) pieces[quantumSquares[k]] = ".";
      }
      samples.push({ pieces, weight: 1 });
    }
    return samples;
  }
  fork(count = 2) {
    const forks = [];
    for (let i = 0; i < count; i++) {
      forks.push(new _StackExplorer(this.engine, this.rules, this.depth));
    }
    return forks;
  }
  /**
   * Apply a move in-place. Caller MUST call undo() after each apply().
   *
   * - Classical standard moves on classical positions: direct board update
   * - Everything else (quantum, measurement, splits, merges): engine.executeMove
   *   with recorded-ops undo. Measurements use setForceMeasurement for correct
   *   post-measurement entanglement propagation.
   */
  apply(choice, options) {
    const savedLegalMoves = this._cachedLegalMoves;
    this._cachedLegalMoves = null;
    const gd = this.engine.getGameData();
    const snapshot = saveSnapshot(gd);
    if (!options?.forceMeasurement && this.isMeasurementMove(choice)) {
      const prob = choice.type === "standard" ? gd.board.probabilities[choice.from] : 0.5;
      this._cachedLegalMoves = savedLegalMoves;
      return {
        success: true,
        explorer: this,
        measured: true,
        measurementPassProbability: prob
      };
    }
    const adapter = this.engine.quantum;
    if (typeof adapter?.isNearOOM === "function" && adapter.isNearOOM()) {
      this._cachedLegalMoves = savedLegalMoves;
      return { success: false, explorer: this, measured: false };
    }
    if (this.isClassicalPosition() && choice.type === "standard" && !options?.forceMeasurement) {
      this.applyClassicalMove(choice, gd);
      const quantum = this.engine.quantum;
      if (quantum?.classicalOccupied) {
        const srcPiece = snapshot.pieces[choice.from];
        quantum.classicalOccupied.delete(choice.from);
        quantum.classicalOccupied.add(choice.to);
        if (quantum.squareProps.has(choice.from)) quantum.squareProps.delete(choice.from);
        if (quantum.squareProps.has(choice.to)) quantum.squareProps.delete(choice.to);
        if (srcPiece?.toLowerCase() === "p" && choice.to === snapshot.enPassantSquare) {
          const epCapture = choice.to - (srcPiece === "P" ? 8 : -8);
          if (epCapture >= 0 && epCapture < 64) {
            quantum.classicalOccupied.delete(epCapture);
            if (quantum.squareProps.has(epCapture)) quantum.squareProps.delete(epCapture);
          }
        }
        if (srcPiece?.toLowerCase() === "k" && Math.abs(choice.to - choice.from) === 2) {
          if (choice.to > choice.from) {
            quantum.classicalOccupied.delete(choice.from + 3);
            quantum.classicalOccupied.add(choice.from + 1);
          } else {
            quantum.classicalOccupied.delete(choice.from - 4);
            quantum.classicalOccupied.add(choice.from - 1);
          }
        }
      }
      this.undoStack.push({ type: "classical", snapshot, cachedLegalMoves: savedLegalMoves });
      return { success: true, explorer: this, measured: false };
    }
    if (options?.forceMeasurement) {
      this.engine.setForceMeasurement(options.forceMeasurement === "pass" ? "m1" : "m0");
    }
    const result = this.engine.executeMove(choice);
    if (options?.forceMeasurement) {
      this.engine.setForceMeasurement("random");
    }
    if (!result.success) {
      this._cachedLegalMoves = savedLegalMoves;
      return { success: false, explorer: this, measured: false };
    }
    this.undoStack.push({ type: "engine", snapshot, cachedLegalMoves: savedLegalMoves });
    return {
      success: true,
      explorer: this,
      measured: result.moveRecord.wasMeasurement,
      measurementPassed: result.moveRecord.measurementPassed
    };
  }
  undo() {
    const entry = this.undoStack.pop();
    if (!entry) return;
    this._cachedLegalMoves = entry.cachedLegalMoves;
    if (entry.type === "classical") {
      restoreSnapshot(this.engine.getGameData(), entry.snapshot);
      const quantum = this.engine.quantum;
      if (quantum?.classicalOccupied) {
        quantum.classicalOccupied.clear();
        for (let sq = 0; sq < 64; sq++) {
          if (entry.snapshot.pieces[sq] !== ".") quantum.classicalOccupied.add(sq);
        }
      }
    } else {
      this.engine.undoMove();
    }
  }
  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------
  isClassicalPosition() {
    const probs = this.engine.getGameData().board.probabilities;
    for (let i = 0; i < 64; i++) {
      if (probs[i] > 1e-3 && probs[i] < 0.999) return false;
    }
    return true;
  }
  isMeasurementMove(choice) {
    if (choice.type !== "standard") return false;
    const lm = this._cachedLegalMoves ?? buildLegalMoveSet(this.engine.getGameData());
    const moveOpt = lm.standard.find((m) => m.from === choice.from && m.to === choice.to);
    return moveOpt?.willMeasure ?? false;
  }
  applyClassicalMove(choice, gd) {
    const from = choice.from;
    const to = choice.to;
    const srcPiece = gd.board.pieces[from];
    let destPiece = srcPiece;
    if (choice.promotion && srcPiece.toLowerCase() === "p") {
      const isWhite = srcPiece === "P";
      destPiece = isWhite ? choice.promotion.toUpperCase() : choice.promotion.toLowerCase();
    }
    gd.board.pieces[from] = ".";
    gd.board.pieces[to] = destPiece;
    gd.board.probabilities[from] = 0;
    gd.board.probabilities[to] = 1;
    if (srcPiece.toLowerCase() === "p" && gd.board.enPassantSquare === to) {
      const capturedSq = to - (srcPiece === "P" ? 8 : -8);
      if (capturedSq >= 0 && capturedSq < 64) {
        gd.board.pieces[capturedSq] = ".";
        gd.board.probabilities[capturedSq] = 0;
      }
    }
    if (srcPiece.toLowerCase() === "k" && Math.abs(to - from) === 2) {
      const rook = srcPiece === "K" ? "R" : "r";
      if (to > from) {
        gd.board.pieces[from + 3] = ".";
        gd.board.pieces[from + 1] = rook;
        gd.board.probabilities[from + 3] = 0;
        gd.board.probabilities[from + 1] = 1;
      } else {
        gd.board.pieces[from - 4] = ".";
        gd.board.pieces[from - 1] = rook;
        gd.board.probabilities[from - 4] = 0;
        gd.board.probabilities[from - 1] = 1;
      }
    }
    gd.board.ply += 1;
    if (srcPiece.toLowerCase() === "p" && Math.abs(to - from) === 16) {
      gd.board.enPassantSquare = from + (to - from) / 2;
    } else {
      gd.board.enPassantSquare = -1;
    }
    const clearCastleFor = (sq) => {
      if (sq === 4) gd.board.castleFlags &= ~3;
      else if (sq === 0) gd.board.castleFlags &= ~2;
      else if (sq === 7) gd.board.castleFlags &= ~1;
      else if (sq === 60) gd.board.castleFlags &= ~12;
      else if (sq === 56) gd.board.castleFlags &= ~8;
      else if (sq === 63) gd.board.castleFlags &= ~4;
    };
    clearCastleFor(from);
    clearCastleFor(to);
    const promoSuffix = choice.promotion ? choice.promotion.toUpperCase() : "";
    gd.position.history = [...gd.position.history, `${indexToSquareName(from)}-${indexToSquareName(to)}${promoSuffix}`];
  }
};
function createStackExplorer(engine, _startingData, adapterFactory) {
  const searchAdapter = adapterFactory();
  const searchEngine = new QCEngine(searchAdapter, engine.getView().rules);
  searchEngine.initializeFromPosition(engine.getGameData().position);
  const port = searchAdapter.port;
  const dispose = typeof port?.dispose === "function" ? () => port.dispose() : void 0;
  return new StackExplorer(searchEngine, engine.getView().rules, 0, dispose);
}

// src/ai-validation.ts
function validatePlayerShape(player) {
  if (!player || typeof player !== "object") {
    return "Player must be a non-null object.";
  }
  const p = player;
  if (typeof p.name !== "string" || p.name.length === 0) {
    return "Player must have a non-empty 'name' string property.";
  }
  if (typeof p.chooseMove !== "function") {
    return "Player must have a 'chooseMove' method.";
  }
  if (p.control !== void 0 && p.control !== "ai" && p.control !== "human_local" && p.control !== "human_remote") {
    return "Player 'control' must be 'ai', 'human_local', or 'human_remote'.";
  }
  return null;
}

export {
  buildLegalMoveSet,
  QCEngine,
  StackExplorer,
  createStackExplorer,
  validatePlayerShape
};
