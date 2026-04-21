// src/quantum/port.ts
function asPredicateHandle(handle) {
  const candidate = handle;
  if (!candidate || typeof candidate.is !== "function" || typeof candidate.is_not !== "function") {
    throw new Error("Quantum handle does not support predicates");
  }
  return candidate;
}
function createIsolatedPort(module) {
  if (!module.QuantumSimulation) {
    throw new Error("QuantumSimulation not available \u2014 requires quantum-forge-chess >= 1.5.0");
  }
  const sim = new module.QuantumSimulation();
  let propsCreated = 0;
  let propsDestroyed = 0;
  return {
    createProperty: (dimension) => {
      propsCreated++;
      return sim.createProperty(dimension);
    },
    predicateIs: (handle, value) => asPredicateHandle(handle).is(value),
    predicateIsNot: (handle, value) => asPredicateHandle(handle).is_not(value),
    cycle: (handle, fraction, predicates) => module.cycle(handle, fraction, predicates),
    iSwap: (handle1, handle2, fraction, predicates) => module.i_swap(handle1, handle2, fraction, predicates),
    swap: (handle1, handle2, predicates) => module.swap(handle1, handle2, predicates),
    clock: (handle, fraction, predicates) => module.clock(handle, fraction, predicates),
    measurePredicate: (predicates) => module.measure_predicate(predicates),
    forcedMeasurePredicate: module.forced_measure_predicate ? (predicates, value) => module.forced_measure_predicate(predicates, value) : void 0,
    predicateProbability: module.predicate_probability ? (predicates) => module.predicate_probability(predicates) : void 0,
    measure: (handles) => module.measure_properties(handles),
    forcedMeasure: (handles, values) => module.forced_measure_properties(handles, values),
    probabilities: (handles) => module.probabilities(handles),
    reducedDensityMatrix: module.reduced_density_matrix ? (handles) => module.reduced_density_matrix(handles) : void 0,
    destroyProperty: (handle) => {
      sim.destroyProperty(handle);
      propsDestroyed++;
    },
    factorizeAllSeparable: typeof sim.factorizeAllSeparable === "function" ? () => sim.factorizeAllSeparable() : void 0,
    dispose: () => {
      if (sim.isDestroyed()) return;
      if (propsDestroyed >= propsCreated) return;
      const origWarn = console.warn;
      console.warn = () => {
      };
      try {
        sim.destroy();
      } catch {
      }
      console.warn = origWarn;
    }
  };
}
function createQuantumForgePort(module) {
  return {
    createProperty: (dimension) => module.QuantumForge.createQuantumProperty(dimension),
    predicateIs: (handle, value) => asPredicateHandle(handle).is(value),
    predicateIsNot: (handle, value) => asPredicateHandle(handle).is_not(value),
    cycle: (handle, fraction, predicates) => module.cycle(handle, fraction, predicates),
    iSwap: (handle1, handle2, fraction, predicates) => module.i_swap(handle1, handle2, fraction, predicates),
    swap: (handle1, handle2, predicates) => module.swap(handle1, handle2, predicates),
    clock: (handle, fraction, predicates) => module.clock(handle, fraction, predicates),
    measurePredicate: (predicates) => module.measure_predicate(predicates),
    forcedMeasurePredicate: module.forced_measure_predicate ? (predicates, value) => module.forced_measure_predicate(predicates, value) : void 0,
    predicateProbability: module.predicate_probability ? (predicates) => module.predicate_probability(predicates) : void 0,
    measure: (handles) => module.measure_properties(handles),
    forcedMeasure: (handles, values) => module.forced_measure_properties(handles, values),
    probabilities: (handles) => module.probabilities(handles),
    reducedDensityMatrix: module.reduced_density_matrix ? (handles) => module.reduced_density_matrix(handles) : void 0,
    destroyProperty: (handle) => {
      const prop = handle;
      if (typeof prop.destroy === "function") prop.destroy();
    }
  };
}

// src/core/types.ts
var BOARD_SQUARES = 64;
var MoveType = /* @__PURE__ */ ((MoveType2) => {
  MoveType2[MoveType2["Unspecified"] = 0] = "Unspecified";
  MoveType2[MoveType2["Jump"] = 2] = "Jump";
  MoveType2[MoveType2["Slide"] = 3] = "Slide";
  MoveType2[MoveType2["SplitJump"] = 4] = "SplitJump";
  MoveType2[MoveType2["SplitSlide"] = 5] = "SplitSlide";
  MoveType2[MoveType2["MergeJump"] = 6] = "MergeJump";
  MoveType2[MoveType2["MergeSlide"] = 7] = "MergeSlide";
  MoveType2[MoveType2["PawnCapture"] = 10] = "PawnCapture";
  MoveType2[MoveType2["PawnEnPassant"] = 11] = "PawnEnPassant";
  MoveType2[MoveType2["KingSideCastle"] = 12] = "KingSideCastle";
  MoveType2[MoveType2["QueenSideCastle"] = 13] = "QueenSideCastle";
  return MoveType2;
})(MoveType || {});
var MoveVariant = /* @__PURE__ */ ((MoveVariant2) => {
  MoveVariant2[MoveVariant2["Unspecified"] = 0] = "Unspecified";
  MoveVariant2[MoveVariant2["Basic"] = 1] = "Basic";
  MoveVariant2[MoveVariant2["Excluded"] = 2] = "Excluded";
  MoveVariant2[MoveVariant2["Capture"] = 3] = "Capture";
  return MoveVariant2;
})(MoveVariant || {});
var MoveCode = /* @__PURE__ */ ((MoveCode2) => {
  MoveCode2[MoveCode2["Fail"] = 0] = "Fail";
  MoveCode2[MoveCode2["Success"] = 1] = "Success";
  MoveCode2[MoveCode2["WhiteWin"] = 2] = "WhiteWin";
  MoveCode2[MoveCode2["BlackWin"] = 3] = "BlackWin";
  MoveCode2[MoveCode2["MutualWin"] = 4] = "MutualWin";
  MoveCode2[MoveCode2["Draw"] = 5] = "Draw";
  return MoveCode2;
})(MoveCode || {});

// src/core/state.ts
var STARTING_RANKS = "RNBQKBNRPPPPPPPP................................pppppppprnbqkbnr";
var CLASSICAL_START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
function createEmptyGameData() {
  return {
    position: {
      startingFen: "8/8/8/8/8/8/8/8 w - - 0 1",
      history: []
    },
    board: {
      pieces: Array.from({ length: BOARD_SQUARES }, () => "."),
      probabilities: Array.from({ length: BOARD_SQUARES }, () => 0),
      ply: 0,
      fiftyCount: 0,
      fiftyPieceCount: 0,
      castleFlags: 0,
      enPassantSquare: -1
    }
  };
}
function createClassicalStartGameData() {
  const pieces = STARTING_RANKS.split("");
  return {
    position: {
      startingFen: CLASSICAL_START_FEN,
      history: []
    },
    board: {
      pieces,
      probabilities: pieces.map((piece) => piece === "." ? 0 : 1),
      ply: 0,
      fiftyCount: 0,
      fiftyPieceCount: 32,
      castleFlags: 15,
      enPassantSquare: -1
    }
  };
}
function cloneGameData(gameData) {
  return {
    position: {
      startingFen: gameData.position.startingFen,
      ...gameData.position.setupMoves ? { setupMoves: [...gameData.position.setupMoves] } : {},
      history: [...gameData.position.history]
    },
    board: {
      pieces: [...gameData.board.pieces],
      probabilities: [...gameData.board.probabilities],
      ply: gameData.board.ply,
      fiftyCount: gameData.board.fiftyCount,
      fiftyPieceCount: gameData.board.fiftyPieceCount,
      castleFlags: gameData.board.castleFlags,
      enPassantSquare: gameData.board.enPassantSquare
    }
  };
}
var FEN_PIECE_CHARS = "KQRBNPkqrbnp";
function classicalBoardToFen(board) {
  const rows = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = "";
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const idx = rank * 8 + file;
      const piece = board.pieces[idx];
      if (piece === "." || !FEN_PIECE_CHARS.includes(piece)) {
        empty++;
      } else {
        if (empty > 0) {
          row += empty;
          empty = 0;
        }
        row += piece;
      }
    }
    if (empty > 0) row += empty;
    rows.push(row);
  }
  const activeColor = board.ply % 2 === 0 ? "w" : "b";
  let castling = "";
  if (board.castleFlags & 1) castling += "K";
  if (board.castleFlags & 2) castling += "Q";
  if (board.castleFlags & 4) castling += "k";
  if (board.castleFlags & 8) castling += "q";
  if (!castling) castling = "-";
  let ep = "-";
  if (board.enPassantSquare >= 0 && board.enPassantSquare < 64) {
    const file = String.fromCharCode(97 + board.enPassantSquare % 8);
    const rank = Math.floor(board.enPassantSquare / 8) + 1;
    ep = `${file}${rank}`;
  }
  const halfmove = board.fiftyCount;
  const fullmove = Math.floor(board.ply / 2) + 1;
  return `${rows.join("/")} ${activeColor} ${castling} ${ep} ${halfmove} ${fullmove}`;
}
function gameDataToPositionString(gameData) {
  const { startingFen, setupMoves, history } = gameData.position;
  const parts = [`position fen ${startingFen}`];
  if (setupMoves?.length) {
    parts.push(`setup ${setupMoves.join(" ")}`);
  }
  if (history.length > 0) {
    parts.push(`moves ${history.join(" ")}`);
  }
  return parts.join(" ");
}
function fenToGameData(fen) {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 1) return null;
  const ranks = parts[0].split("/");
  if (ranks.length !== 8) return null;
  const pieces = new Array(BOARD_SQUARES).fill(".");
  const probabilities = new Array(BOARD_SQUARES).fill(0);
  for (let r = 0; r < 8; r++) {
    const rank = 7 - r;
    let file = 0;
    for (const ch of ranks[r]) {
      if (ch >= "1" && ch <= "8") {
        file += Number(ch);
      } else if (FEN_PIECE_CHARS.includes(ch)) {
        if (file >= 8) return null;
        const idx = rank * 8 + file;
        pieces[idx] = ch;
        probabilities[idx] = 1;
        file++;
      } else {
        return null;
      }
    }
    if (file !== 8) return null;
  }
  const activeColor = parts[1] ?? "w";
  let castleFlags = 0;
  const castling = parts[2] ?? "-";
  if (castling.includes("K")) castleFlags |= 1;
  if (castling.includes("Q")) castleFlags |= 2;
  if (castling.includes("k")) castleFlags |= 4;
  if (castling.includes("q")) castleFlags |= 8;
  let enPassantSquare = -1;
  const ep = parts[3] ?? "-";
  if (ep !== "-" && ep.length === 2) {
    const epFile = ep.charCodeAt(0) - 97;
    const epRank = Number(ep[1]) - 1;
    if (epFile >= 0 && epFile < 8 && epRank >= 0 && epRank < 8) {
      enPassantSquare = epRank * 8 + epFile;
    }
  }
  const fiftyCount = Number(parts[4]) || 0;
  const fullmove = Number(parts[5]) || 1;
  const computedPly = (fullmove - 1) * 2 + (activeColor === "b" ? 1 : 0);
  let fiftyPieceCount = 0;
  for (let i = 0; i < BOARD_SQUARES; i++) fiftyPieceCount += probabilities[i];
  return {
    position: {
      startingFen: fen.trim(),
      history: []
    },
    board: {
      pieces,
      probabilities,
      ply: computedPly,
      fiftyCount,
      fiftyPieceCount,
      castleFlags,
      enPassantSquare
    }
  };
}

// src/core/board.ts
var FILES = "abcdefgh";
function indexToSquareName(index) {
  if (!Number.isInteger(index) || index < 0 || index > 63) {
    throw new Error(`Invalid square index: ${index}`);
  }
  const file = FILES[index % 8];
  const rank = Math.floor(index / 8) + 1;
  return `${file}${rank}`;
}
function squareNameToIndex(square) {
  if (!/^[a-h][1-8]$/.test(square)) {
    throw new Error(`Invalid square: ${square}`);
  }
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]) - 1;
  return rank * 8 + file;
}
function getFile(index) {
  return index % 8;
}
function getRank(index) {
  return Math.floor(index / 8);
}
function isOnBoard(index) {
  return index >= 0 && index < 64;
}
function isWhitePiece(piece) {
  return piece >= "A" && piece <= "Z";
}
function isBlackPiece(piece) {
  return piece >= "a" && piece <= "z";
}
function getPieceColor(piece) {
  if (isWhitePiece(piece)) {
    return "white";
  }
  if (isBlackPiece(piece)) {
    return "black";
  }
  return null;
}
function isEnemyPiece(piece, color) {
  return color === "white" ? isBlackPiece(piece) : isWhitePiece(piece);
}

// src/core/move.ts
var MOVE_REGEX = /^([pnbrqkPNBRQK]?)([a-h][1-8])([\^-]?)([wx]?)([a-h][1-8])(ep)?(\^)?([wx]?)([a-h][1-8])?([nbrqNBRQ])?(\.m[01])?$/;
function hasExclusivePath(source, target) {
  const sourceFile = getFile(source);
  const targetFile = getFile(target);
  const sourceRank = getRank(source);
  const targetRank = getRank(target);
  const fileDelta = targetFile - sourceFile;
  const rankDelta = targetRank - sourceRank;
  if (fileDelta === 0 && rankDelta === 0) {
    return false;
  }
  const absFileDelta = Math.abs(fileDelta);
  const absRankDelta = Math.abs(rankDelta);
  const isLine = fileDelta === 0 || rankDelta === 0 || absFileDelta === absRankDelta;
  if (!isLine) {
    return false;
  }
  return Math.max(absFileDelta, absRankDelta) > 1;
}
function parseVariant(raw) {
  if (raw === "x") {
    return 3 /* Capture */;
  }
  if (raw === "w") {
    return 2 /* Excluded */;
  }
  return 1 /* Basic */;
}
function inferStandardVariant(sourcePiece, targetPiece) {
  if (targetPiece === "." || targetPiece === sourcePiece) {
    return 1 /* Basic */;
  }
  if (isWhitePiece(sourcePiece) && isBlackPiece(targetPiece) || isBlackPiece(sourcePiece) && isWhitePiece(targetPiece)) {
    return 3 /* Capture */;
  }
  return 2 /* Excluded */;
}
function inferPawnForwardVariant(sourcePiece, targetPiece) {
  return targetPiece === "." || targetPiece === sourcePiece ? 1 /* Basic */ : 2 /* Excluded */;
}
function inferCastleVariant(square1, square2, sourcePiece, gameData) {
  const rookPiece = isWhitePiece(sourcePiece) ? "R" : "r";
  const target1Piece = gameData.board.pieces[square2];
  const target2Square = square2 > square1 ? square1 + 1 : square1 - 1;
  const target2Piece = gameData.board.pieces[target2Square];
  return target1Piece !== "." || target2Piece !== "." && target2Piece !== rookPiece ? 2 /* Excluded */ : 1 /* Basic */;
}
function inferMoveVariant(piece, square1, square2, gameData) {
  if (!gameData || piece === ".") {
    return 1 /* Basic */;
  }
  const targetPiece = gameData.board.pieces[square2];
  const sourcePiece = gameData.board.pieces[square1] === "." ? piece : gameData.board.pieces[square1];
  const pieceType = sourcePiece.toLowerCase();
  if (pieceType === "p" && getFile(square1) === getFile(square2)) {
    return inferPawnForwardVariant(sourcePiece, targetPiece);
  }
  if (pieceType === "k" && (square2 === square1 + 2 || square2 === square1 - 2)) {
    return inferCastleVariant(square1, square2, sourcePiece, gameData);
  }
  return inferStandardVariant(sourcePiece, targetPiece);
}
function inferStandardMoveType(piece, square1, square2, isEnPassant) {
  const pieceType = piece.toLowerCase();
  if (pieceType === "p") {
    const forward = piece >= "A" && piece <= "Z" ? 8 : -8;
    if (isEnPassant) {
      return 11 /* PawnEnPassant */;
    }
    if (square2 === square1 + forward) {
      return 2 /* Jump */;
    }
    if (square2 === square1 + 2 * forward) {
      return 3 /* Slide */;
    }
    return 10 /* PawnCapture */;
  }
  if (pieceType === "k" && square2 === square1 + 2) {
    return 12 /* KingSideCastle */;
  }
  if (pieceType === "k" && square2 === square1 - 2) {
    return 13 /* QueenSideCastle */;
  }
  if (pieceType === "k" || pieceType === "n") {
    return 2 /* Jump */;
  }
  return hasExclusivePath(square1, square2) ? 3 /* Slide */ : 2 /* Jump */;
}
function buildStandardMoveFromSquares(source, target, gameData) {
  const piece = gameData.board.pieces[source];
  const pieceType = piece.toLowerCase();
  const isEnPassant = pieceType === "p" && getFile(source) !== getFile(target) && gameData.board.enPassantSquare === target;
  const type = inferStandardMoveType(piece, source, target, isEnPassant);
  const variant = inferMoveVariant(piece, source, target, gameData);
  let square3 = -1;
  if (type === 11 /* PawnEnPassant */) {
    const forward = piece >= "A" && piece <= "Z" ? 8 : -8;
    square3 = target - forward;
  }
  return {
    square1: source,
    square2: target,
    square3,
    type,
    variant,
    doesMeasurement: false,
    measurementOutcome: 0,
    promotionPiece: 0
  };
}
function parseMoveString(moveString, gameData) {
  const match = MOVE_REGEX.exec(moveString.trim());
  if (!match) {
    return null;
  }
  const square1 = squareNameToIndex(match[2]);
  const square2 = squareNameToIndex(match[5]);
  let square3 = match[9] ? squareNameToIndex(match[9]) : -1;
  const isSplit = match[3] === "^";
  const isMerge = match[7] === "^";
  const piece = match[1] || gameData?.board.pieces[square1] || ".";
  const explicitVariant = match[8] || match[4];
  let variant = parseVariant(explicitVariant);
  const doesMeasurement = Boolean(match[11]);
  const measurementOutcome = match[11] === ".m1" ? 1 : 0;
  const promotionPiece = match[10] ? match[10].charCodeAt(0) : 0;
  let type;
  if (isSplit) {
    type = hasExclusivePath(square1, square2) || hasExclusivePath(square1, square3) ? 5 /* SplitSlide */ : 4 /* SplitJump */;
  } else if (isMerge) {
    type = hasExclusivePath(square1, square3) || hasExclusivePath(square2, square3) ? 7 /* MergeSlide */ : 6 /* MergeJump */;
  } else {
    type = inferStandardMoveType(piece, square1, square2, Boolean(match[6]));
    if (!explicitVariant) {
      variant = inferMoveVariant(piece, square1, square2, gameData);
    }
  }
  if (type === 11 /* PawnEnPassant */ && square3 === -1) {
    const forward = piece >= "A" && piece <= "Z" ? 8 : -8;
    square3 = square2 - forward;
  }
  return {
    square1,
    square2,
    square3,
    type,
    variant,
    doesMeasurement,
    measurementOutcome,
    promotionPiece
  };
}
function variantToString(variant) {
  if (variant === 3 /* Capture */) {
    return "x";
  }
  if (variant === 2 /* Excluded */) {
    return "w";
  }
  return "";
}
function formatMoveString(move) {
  const s1 = indexToSquareName(move.square1);
  const s2 = indexToSquareName(move.square2);
  const variant = variantToString(move.variant);
  const measure = move.doesMeasurement ? `.m${move.measurementOutcome}` : "";
  const promotion = move.promotionPiece ? String.fromCharCode(move.promotionPiece) : "";
  if (move.type === 4 /* SplitJump */ || move.type === 5 /* SplitSlide */) {
    const s3 = indexToSquareName(move.square3);
    return `${s1}^${variant}${s2}${s3}${measure}`;
  }
  if (move.type === 6 /* MergeJump */ || move.type === 7 /* MergeSlide */) {
    const s3 = indexToSquareName(move.square3);
    return `${s1}${s2}^${variant}${s3}${measure}`;
  }
  return `${s1}${variant}${s2}${promotion}${measure}`;
}

// src/core/rules.ts
var KNIGHT_OFFSETS = [
  { file: 1, rank: 2 },
  { file: 2, rank: 1 },
  { file: 2, rank: -1 },
  { file: 1, rank: -2 },
  { file: -1, rank: -2 },
  { file: -2, rank: -1 },
  { file: -2, rank: 1 },
  { file: -1, rank: 2 }
];
var KING_OFFSETS = [
  { file: -1, rank: -1 },
  { file: 0, rank: -1 },
  { file: 1, rank: -1 },
  { file: -1, rank: 0 },
  { file: 1, rank: 0 },
  { file: -1, rank: 1 },
  { file: 0, rank: 1 },
  { file: 1, rank: 1 }
];
var EPSILON = 1e-6;
function toIndex(file, rank) {
  return rank * 8 + file;
}
function currentTurnColor(ply) {
  return ply % 2 === 0 ? "white" : "black";
}
function isSquareEmpty(gameData, square) {
  return gameData.board.probabilities[square] <= EPSILON;
}
function isSquareFull(gameData, square) {
  return gameData.board.probabilities[square] >= 1 - EPSILON;
}
function isStandardNonPawnTarget(gameData, square, color) {
  return !isSquareFull(gameData, square) || isEnemyPiece(gameData.board.pieces[square], color);
}
function isSplitTarget(gameData, square, piece) {
  return isSquareEmpty(gameData, square) || gameData.board.pieces[square] === piece;
}
function collectSlidingTargets(gameData, source, directions, canLandOn) {
  const targets = [];
  const startFile = getFile(source);
  const startRank = getRank(source);
  for (const direction of directions) {
    let file = startFile + direction.file;
    let rank = startRank + direction.rank;
    while (file >= 0 && file < 8 && rank >= 0 && rank < 8) {
      const index = toIndex(file, rank);
      if (canLandOn(index)) {
        targets.push(index);
      }
      if (isSquareFull(gameData, index)) {
        break;
      }
      file += direction.file;
      rank += direction.rank;
    }
  }
  return targets;
}
function collectKnightTargets(gameData, source, canLandOn) {
  const targets = [];
  const sourceFile = getFile(source);
  const sourceRank = getRank(source);
  for (const offset of KNIGHT_OFFSETS) {
    const file = sourceFile + offset.file;
    const rank = sourceRank + offset.rank;
    if (file < 0 || file > 7 || rank < 0 || rank > 7) {
      continue;
    }
    const index = toIndex(file, rank);
    if (canLandOn(index)) {
      targets.push(index);
    }
  }
  return targets;
}
function collectKingTargets(gameData, source, canLandOn) {
  const targets = [];
  const sourceFile = getFile(source);
  const sourceRank = getRank(source);
  for (const offset of KING_OFFSETS) {
    const file = sourceFile + offset.file;
    const rank = sourceRank + offset.rank;
    if (file < 0 || file > 7 || rank < 0 || rank > 7) {
      continue;
    }
    const index = toIndex(file, rank);
    if (canLandOn(index)) {
      targets.push(index);
    }
  }
  return targets;
}
function hasCastleRight(castleFlags, color, side) {
  if (color === "white") {
    return side === "king" ? (castleFlags & 1) !== 0 : (castleFlags & 2) !== 0;
  }
  return side === "king" ? (castleFlags & 4) !== 0 : (castleFlags & 8) !== 0;
}
function collectKingCastleTargets(gameData, source, color) {
  const targets = [];
  const expectedSource = color === "white" ? 4 : 60;
  if (source !== expectedSource) {
    return targets;
  }
  if (hasCastleRight(gameData.board.castleFlags, color, "king") && !isSquareFull(gameData, source + 1) && !isSquareFull(gameData, source + 2)) {
    targets.push(source + 2);
  }
  if (hasCastleRight(gameData.board.castleFlags, color, "queen") && !isSquareFull(gameData, source - 1) && !isSquareFull(gameData, source - 2) && !isSquareFull(gameData, source - 3)) {
    targets.push(source - 2);
  }
  return targets;
}
function collectPawnTargets(gameData, source, color) {
  const targets = [];
  const sourceFile = getFile(source);
  const sourceRank = getRank(source);
  const forward = color === "white" ? 1 : -1;
  const startRank = color === "white" ? 1 : 6;
  const oneStepRank = sourceRank + forward;
  if (oneStepRank >= 0 && oneStepRank <= 7) {
    const oneStep = toIndex(sourceFile, oneStepRank);
    if (!isSquareFull(gameData, oneStep)) {
      targets.push(oneStep);
      if (sourceRank === startRank) {
        const twoStepRank = sourceRank + 2 * forward;
        const twoStep = toIndex(sourceFile, twoStepRank);
        if (!isSquareFull(gameData, twoStep)) {
          targets.push(twoStep);
        }
      }
    }
  }
  for (const fileOffset of [-1, 1]) {
    const targetFile = sourceFile + fileOffset;
    const targetRank = sourceRank + forward;
    if (targetFile < 0 || targetFile > 7 || targetRank < 0 || targetRank > 7) {
      continue;
    }
    const target = toIndex(targetFile, targetRank);
    const occupant = gameData.board.pieces[target];
    if (isEnemyPiece(occupant, color) && !isSquareEmpty(gameData, target)) {
      targets.push(target);
    } else if (gameData.board.enPassantSquare === target) {
      targets.push(target);
    }
  }
  return targets;
}
function collectNonPawnTargets(gameData, source, piece, color, canLandOn) {
  switch (piece.toLowerCase()) {
    case "n":
      return collectKnightTargets(gameData, source, canLandOn);
    case "b":
      return collectSlidingTargets(gameData, source, [
        { file: 1, rank: 1 },
        { file: 1, rank: -1 },
        { file: -1, rank: 1 },
        { file: -1, rank: -1 }
      ], canLandOn);
    case "r":
      return collectSlidingTargets(gameData, source, [
        { file: 0, rank: 1 },
        { file: 0, rank: -1 },
        { file: 1, rank: 0 },
        { file: -1, rank: 0 }
      ], canLandOn);
    case "q":
      return collectSlidingTargets(gameData, source, [
        { file: 0, rank: 1 },
        { file: 0, rank: -1 },
        { file: 1, rank: 0 },
        { file: -1, rank: 0 },
        { file: 1, rank: 1 },
        { file: 1, rank: -1 },
        { file: -1, rank: 1 },
        { file: -1, rank: -1 }
      ], canLandOn);
    case "k":
      return [
        ...collectKingTargets(gameData, source, canLandOn),
        ...collectKingCastleTargets(gameData, source, color)
      ];
    default:
      return [];
  }
}
function getLegalTargets(gameData, source, options) {
  if (!isOnBoard(source)) {
    return [];
  }
  const piece = gameData.board.pieces[source];
  const color = getPieceColor(piece);
  if (!color || !options?.ignoreTurnOrder && color !== currentTurnColor(gameData.board.ply)) {
    return [];
  }
  switch (piece.toLowerCase()) {
    case "p":
      return collectPawnTargets(gameData, source, color);
    default:
      return collectNonPawnTargets(
        gameData,
        source,
        piece,
        color,
        (target) => isStandardNonPawnTarget(gameData, target, color)
      );
  }
}
function getSplitTargets(gameData, source, options) {
  if (!isOnBoard(source)) {
    return [];
  }
  const piece = gameData.board.pieces[source];
  const color = getPieceColor(piece);
  if (!color || !options?.ignoreTurnOrder && color !== currentTurnColor(gameData.board.ply) || piece.toLowerCase() === "p") {
    return [];
  }
  return collectNonPawnTargets(gameData, source, piece, color, (target) => isSplitTarget(gameData, target, piece));
}
function getMergeTargets(gameData, sourceA, sourceB, options) {
  if (!isOnBoard(sourceA) || !isOnBoard(sourceB) || sourceA === sourceB) {
    return [];
  }
  const pieceA = gameData.board.pieces[sourceA];
  const pieceB = gameData.board.pieces[sourceB];
  if (pieceA === "." || pieceA !== pieceB) {
    return [];
  }
  const color = getPieceColor(pieceA);
  if (!color || !options?.ignoreTurnOrder && color !== currentTurnColor(gameData.board.ply) || pieceA.toLowerCase() === "p") {
    return [];
  }
  const firstTargets = getSplitTargets(gameData, sourceA, options);
  const secondTargets = new Set(getSplitTargets(gameData, sourceB, options));
  return firstTargets.filter((target) => secondTargets.has(target));
}
function isLegalStandardMove(gameData, move, options) {
  if (!isOnBoard(move.square1) || !isOnBoard(move.square2)) {
    return false;
  }
  if (move.type === 4 /* SplitJump */ || move.type === 5 /* SplitSlide */ || move.type === 6 /* MergeJump */ || move.type === 7 /* MergeSlide */) {
    return false;
  }
  return getLegalTargets(gameData, move.square1, options).includes(move.square2);
}
function updateEnPassantSquare(gameData, move) {
  const piece = gameData.board.pieces[move.square1];
  if (piece.toLowerCase() !== "p") {
    return -1;
  }
  const delta = move.square2 - move.square1;
  if (delta === 16 || delta === -16) {
    return move.square1 + delta / 2;
  }
  return -1;
}
function clearCastlingRightsForSquare(castleFlags, source) {
  let next = castleFlags;
  if (source === 4) {
    next &= ~1;
    next &= ~2;
  } else if (source === 60) {
    next &= ~4;
    next &= ~8;
  } else if (source === 0) {
    next &= ~2;
  } else if (source === 7) {
    next &= ~1;
  } else if (source === 56) {
    next &= ~8;
  } else if (source === 63) {
    next &= ~4;
  }
  return next;
}
function clearCastlingRights(castleFlags, move) {
  let next = clearCastlingRightsForSquare(castleFlags, move.square1);
  next = clearCastlingRightsForSquare(next, move.square2);
  if (move.square3 >= 0) {
    next = clearCastlingRightsForSquare(next, move.square3);
  }
  return next;
}
function applyStandardMove(gameData, moveInput) {
  const move = typeof moveInput === "string" ? parseMoveString(moveInput, gameData) : moveInput;
  if (!move || !isLegalStandardMove(gameData, move)) {
    throw new Error("Illegal or unsupported move");
  }
  const next = cloneGameData(gameData);
  const sourcePiece = next.board.pieces[move.square1];
  const targetPiece = next.board.pieces[move.square2];
  const isPawnMove = sourcePiece.toLowerCase() === "p";
  const isCapture = targetPiece !== "." || move.type === 11 /* PawnEnPassant */;
  if (move.type === 11 /* PawnEnPassant */) {
    const capturedSquare = sourcePiece === sourcePiece.toUpperCase() ? move.square2 - 8 : move.square2 + 8;
    next.board.pieces[capturedSquare] = ".";
    next.board.probabilities[capturedSquare] = 0;
  }
  if (move.type === 12 /* KingSideCastle */) {
    next.board.pieces[move.square2] = sourcePiece;
    next.board.pieces[move.square1] = ".";
    next.board.pieces[move.square1 + 1] = next.board.pieces[move.square1 + 3];
    next.board.pieces[move.square1 + 3] = ".";
    next.board.probabilities[move.square2] = 1;
    next.board.probabilities[move.square1] = 0;
    next.board.probabilities[move.square1 + 1] = 1;
    next.board.probabilities[move.square1 + 3] = 0;
  } else if (move.type === 13 /* QueenSideCastle */) {
    next.board.pieces[move.square2] = sourcePiece;
    next.board.pieces[move.square1] = ".";
    next.board.pieces[move.square1 - 1] = next.board.pieces[move.square1 - 4];
    next.board.pieces[move.square1 - 4] = ".";
    next.board.probabilities[move.square2] = 1;
    next.board.probabilities[move.square1] = 0;
    next.board.probabilities[move.square1 - 1] = 1;
    next.board.probabilities[move.square1 - 4] = 0;
  } else {
    next.board.pieces[move.square2] = sourcePiece;
    next.board.pieces[move.square1] = ".";
    next.board.probabilities[move.square2] = 1;
    next.board.probabilities[move.square1] = 0;
  }
  if (isPawnMove) {
    const targetRank = getRank(move.square2);
    const promotionRank = sourcePiece === "P" ? 7 : 0;
    if (targetRank === promotionRank) {
      const isWhite = sourcePiece === "P";
      if (move.promotionPiece) {
        const pieceChar = String.fromCharCode(move.promotionPiece);
        next.board.pieces[move.square2] = isWhite ? pieceChar.toUpperCase() : pieceChar.toLowerCase();
      } else {
        next.board.pieces[move.square2] = isWhite ? "Q" : "q";
      }
    }
  }
  next.board.ply += 1;
  next.board.enPassantSquare = updateEnPassantSquare(gameData, move);
  next.board.castleFlags = clearCastlingRights(next.board.castleFlags, move);
  next.board.fiftyCount = isPawnMove || isCapture ? 0 : gameData.board.fiftyCount + 1;
  if (isPawnMove || isCapture) {
    let pc = 0;
    for (let i = 0; i < 64; i++) pc += next.board.probabilities[i];
    next.board.fiftyPieceCount = pc;
  }
  return next;
}

// src/core/execution.ts
var PROBABILITY_EPSILON = 11920929e-14;
var FIFTY_MOVE_THRESHOLD = 0.9999;
var FIFTY_MOVE_PLY_LIMIT = 100;
function updateFiftyMoveCounter(gameData) {
  let pieceCount = 0;
  for (let i = 0; i < 64; i++) pieceCount += gameData.board.probabilities[i];
  if (Math.abs(pieceCount - gameData.board.fiftyPieceCount) > FIFTY_MOVE_THRESHOLD) {
    return { fiftyCount: 0, fiftyPieceCount: pieceCount };
  }
  return { fiftyCount: gameData.board.fiftyCount + 1, fiftyPieceCount: gameData.board.fiftyPieceCount };
}
function isFiftyMoveDraw(gameData) {
  return gameData.board.fiftyCount >= FIFTY_MOVE_PLY_LIMIT;
}
function clearCastlingRightsFromMove(castleFlags, squares) {
  return squares.reduce(
    (flags, sq) => sq >= 0 ? clearCastlingRightsForSquare(flags, sq) : flags,
    castleFlags
  );
}
function pieceForMoveSource(gameData, move) {
  const piece1 = gameData.board.pieces[move.square1];
  if (piece1 !== ".") return piece1;
  if (move.type === 6 /* MergeJump */ || move.type === 7 /* MergeSlide */) {
    return gameData.board.pieces[move.square2];
  }
  return ".";
}
function promotedOrSourcePiece(sourcePiece, move) {
  if (move.promotionPiece) {
    const ch = String.fromCharCode(move.promotionPiece);
    return sourcePiece === sourcePiece.toUpperCase() ? ch.toUpperCase() : ch.toLowerCase();
  }
  return sourcePiece;
}
function prunePiecesByProbabilities(gameData) {
  for (let sq = 0; sq < 64; sq++) {
    if (gameData.board.probabilities[sq] <= PROBABILITY_EPSILON) {
      gameData.board.pieces[sq] = ".";
    }
  }
}
function remapPieceSymbol(gameData, piece, extraSquares) {
  if (piece === ".") return;
  for (const sq of extraSquares) {
    if (sq >= 0 && sq < 64) {
      gameData.board.pieces[sq] = gameData.board.probabilities[sq] > PROBABILITY_EPSILON ? piece : ".";
    }
  }
}
function applyClassicalShadowMove(gameData, move) {
  const next = cloneGameData(gameData);
  const sourcePiece = pieceForMoveSource(gameData, move);
  const movedPiece = promotedOrSourcePiece(sourcePiece, move);
  next.board.ply += 1;
  if (sourcePiece.toLowerCase() === "p") {
    const delta = move.square2 - move.square1;
    if (delta === 16 || delta === -16) {
      next.board.enPassantSquare = move.square1 + delta / 2;
    } else {
      next.board.enPassantSquare = -1;
    }
  } else {
    next.board.enPassantSquare = -1;
  }
  next.board.castleFlags = clearCastlingRightsFromMove(
    next.board.castleFlags,
    [move.square1, move.square2, move.square3]
  );
  if (sourcePiece === ".") return next;
  const clear = (sq) => {
    if (sq >= 0 && sq < 64) next.board.pieces[sq] = ".";
  };
  clear(move.square1);
  clear(move.square2);
  clear(move.square3);
  switch (move.type) {
    case 2 /* Jump */:
    case 3 /* Slide */:
    case 10 /* PawnCapture */:
      if (gameData.board.probabilities[move.square1] > PROBABILITY_EPSILON) next.board.pieces[move.square1] = movedPiece;
      if (gameData.board.probabilities[move.square2] > PROBABILITY_EPSILON) next.board.pieces[move.square2] = movedPiece;
      break;
    case 11 /* PawnEnPassant */: {
      const epForward = isWhitePiece(sourcePiece) ? 8 : -8;
      const capturedSquare = move.square2 - epForward;
      if (capturedSquare >= 0 && capturedSquare < 64) {
        next.board.pieces[capturedSquare] = ".";
        next.board.probabilities[capturedSquare] = 0;
      }
      if (gameData.board.probabilities[move.square1] > PROBABILITY_EPSILON) next.board.pieces[move.square1] = movedPiece;
      if (gameData.board.probabilities[move.square2] > PROBABILITY_EPSILON) next.board.pieces[move.square2] = movedPiece;
      break;
    }
    case 4 /* SplitJump */:
    case 5 /* SplitSlide */:
      if (gameData.board.probabilities[move.square1] > PROBABILITY_EPSILON) next.board.pieces[move.square1] = sourcePiece;
      if (gameData.board.probabilities[move.square2] > PROBABILITY_EPSILON) next.board.pieces[move.square2] = sourcePiece;
      if (move.square3 >= 0 && gameData.board.probabilities[move.square3] > PROBABILITY_EPSILON) next.board.pieces[move.square3] = sourcePiece;
      break;
    case 6 /* MergeJump */:
    case 7 /* MergeSlide */:
      if (gameData.board.probabilities[move.square1] > PROBABILITY_EPSILON) next.board.pieces[move.square1] = sourcePiece;
      if (gameData.board.probabilities[move.square2] > PROBABILITY_EPSILON) next.board.pieces[move.square2] = sourcePiece;
      if (move.square3 >= 0 && gameData.board.probabilities[move.square3] > PROBABILITY_EPSILON) next.board.pieces[move.square3] = sourcePiece;
      break;
    case 12 /* KingSideCastle */: {
      const rook = isWhitePiece(sourcePiece) ? "R" : "r";
      clear(move.square1 + 3);
      clear(move.square1 + 1);
      if (gameData.board.probabilities[move.square1] > PROBABILITY_EPSILON) next.board.pieces[move.square1] = sourcePiece;
      if (gameData.board.probabilities[move.square2] > PROBABILITY_EPSILON) next.board.pieces[move.square2] = sourcePiece;
      if (gameData.board.probabilities[move.square1 + 3] > PROBABILITY_EPSILON) next.board.pieces[move.square1 + 3] = rook;
      if (gameData.board.probabilities[move.square1 + 1] > PROBABILITY_EPSILON) next.board.pieces[move.square1 + 1] = rook;
      break;
    }
    case 13 /* QueenSideCastle */: {
      const rook = isWhitePiece(sourcePiece) ? "R" : "r";
      clear(move.square1 - 4);
      clear(move.square1 - 1);
      if (gameData.board.probabilities[move.square1] > PROBABILITY_EPSILON) next.board.pieces[move.square1] = sourcePiece;
      if (gameData.board.probabilities[move.square2] > PROBABILITY_EPSILON) next.board.pieces[move.square2] = sourcePiece;
      if (gameData.board.probabilities[move.square1 - 4] > PROBABILITY_EPSILON) next.board.pieces[move.square1 - 4] = rook;
      if (gameData.board.probabilities[move.square1 - 1] > PROBABILITY_EPSILON) next.board.pieces[move.square1 - 1] = rook;
      break;
    }
  }
  const fifty = updateFiftyMoveCounter(next);
  next.board.fiftyCount = fifty.fiftyCount;
  next.board.fiftyPieceCount = fifty.fiftyPieceCount;
  return next;
}
function detectKingCapture(gameData) {
  let whiteKingAlive = false;
  let blackKingAlive = false;
  for (let sq = 0; sq < 64; sq++) {
    if (gameData.board.probabilities[sq] <= PROBABILITY_EPSILON) continue;
    if (gameData.board.pieces[sq] === "K") whiteKingAlive = true;
    if (gameData.board.pieces[sq] === "k") blackKingAlive = true;
  }
  if (!blackKingAlive) return "white_win";
  if (!whiteKingAlive) return "black_win";
  return null;
}
function clearSandboxBoard() {
  return createEmptyGameData();
}
function placeSandboxPiece(gameData, square, piece) {
  if (square < 0 || square > 63) return gameData;
  const next = cloneGameData(gameData);
  next.board.pieces[square] = piece === "." ? "." : piece;
  next.board.probabilities[square] = piece === "." ? 0 : 1;
  return next;
}
function relocateSandboxPiece(gameData, from, to) {
  if (from < 0 || from > 63 || to < 0 || to > 63 || from === to) return gameData;
  const next = cloneGameData(gameData);
  next.board.pieces[to] = next.board.pieces[from];
  next.board.probabilities[to] = 1;
  next.board.pieces[from] = ".";
  next.board.probabilities[from] = 0;
  return next;
}
function isCurrentTurnPiece(piece, ply, probability) {
  if (piece === "." || probability <= PROBABILITY_EPSILON) return false;
  return ply % 2 === 0 ? isWhitePiece(piece) : isBlackPiece(piece);
}
function selectPiece(gameData, square, ignoreTurnOrder) {
  const piece = gameData.board.pieces[square];
  if (!ignoreTurnOrder && !isCurrentTurnPiece(piece, gameData.board.ply, gameData.board.probabilities[square])) {
    return null;
  }
  const opts = ignoreTurnOrder ? { ignoreTurnOrder } : void 0;
  const targets = getLegalTargets(gameData, square, opts);
  if (targets.length === 0) return null;
  return {
    legalTargets: targets,
    splitTargets: getSplitTargets(gameData, square, opts)
  };
}
function computeMergeTargets(gameData, sourceA, sourceB, ignoreTurnOrder) {
  const opts = ignoreTurnOrder ? { ignoreTurnOrder } : void 0;
  return getMergeTargets(gameData, sourceA, sourceB, opts);
}

// src/core/gameMode.ts
var BASE_RULES = {
  quantumEnabled: true,
  allowSplitMerge: true,
  allowMeasurementAnnotations: true,
  allowCastling: true,
  allowEnPassant: true,
  allowPromotion: true,
  objective: "checkmate"
};
function cloneModeConfig(config) {
  return {
    ...config,
    players: config.players.map((player) => ({ ...player })),
    rules: { ...config.rules },
    timeControl: config.timeControl ? { ...config.timeControl } : void 0
  };
}
var PRESET_MAP = {
  sandbox: {
    modeId: "sandbox",
    label: "Sandbox",
    players: [
      { side: "white", control: "human_local" },
      { side: "black", control: "human_local" }
    ],
    rules: { ...BASE_RULES },
    matchmaking: "none",
    startingPosition: "classical"
  },
  vs_ai: {
    modeId: "vs_ai",
    label: "VS AI",
    players: [
      { side: "white", control: "human_local" },
      { side: "black", control: "ai" }
    ],
    rules: { ...BASE_RULES },
    matchmaking: "none",
    startingPosition: "classical",
    timeControl: { initialSeconds: 900, incrementSeconds: 0, maxSeconds: 900 }
  },
  ai_vs_ai: {
    modeId: "ai_vs_ai",
    label: "AI vs AI",
    players: [
      { side: "white", control: "ai" },
      { side: "black", control: "ai" }
    ],
    rules: { ...BASE_RULES },
    matchmaking: "none",
    startingPosition: "classical",
    timeControl: { initialSeconds: 300, incrementSeconds: 5, maxSeconds: 600 }
  },
  online_ranked: {
    modeId: "online_ranked",
    label: "Online Ranked",
    players: [
      { side: "white", control: "human_local" },
      { side: "black", control: "human_remote" }
    ],
    rules: { ...BASE_RULES },
    matchmaking: "ranked",
    startingPosition: "classical",
    timeControl: { initialSeconds: 600, incrementSeconds: 5, maxSeconds: 600 }
  },
  online_unranked: {
    modeId: "online_unranked",
    label: "Online Casual",
    players: [
      { side: "white", control: "human_local" },
      { side: "black", control: "human_remote" }
    ],
    rules: { ...BASE_RULES },
    matchmaking: "casual",
    startingPosition: "classical",
    timeControl: { initialSeconds: 900, incrementSeconds: 3, maxSeconds: 900 }
  },
  puzzle: {
    modeId: "puzzle",
    label: "Puzzle",
    players: [
      { side: "white", control: "human_local" },
      { side: "black", control: "ai" }
    ],
    rules: { ...BASE_RULES, objective: "puzzle" },
    matchmaking: "none",
    startingPosition: "custom"
  },
  tutorial: {
    modeId: "tutorial",
    label: "Tutorial",
    players: [
      { side: "white", control: "human_local" },
      { side: "black", control: "ai" }
    ],
    rules: { ...BASE_RULES, objective: "puzzle" },
    matchmaking: "none",
    startingPosition: "custom"
  },
  spectate: {
    modeId: "spectate",
    label: "Spectate",
    players: [
      { side: "white", control: "human_remote" },
      { side: "black", control: "human_remote" }
    ],
    rules: { ...BASE_RULES },
    matchmaking: "none",
    startingPosition: "classical"
  },
  analysis: {
    modeId: "analysis",
    label: "Analysis",
    players: [
      { side: "white", control: "human_local" },
      { side: "black", control: "human_local" }
    ],
    rules: { ...BASE_RULES },
    matchmaking: "none",
    startingPosition: "custom"
  }
};
function listGameModePresets() {
  return Object.keys(PRESET_MAP).map((modeId) => cloneModeConfig(PRESET_MAP[modeId]));
}
function getGameModePreset(modeId) {
  return cloneModeConfig(PRESET_MAP[modeId]);
}
function createGameModeConfig(modeId, overrides = {}) {
  const base = getGameModePreset(modeId);
  if (overrides.players?.white) {
    base.players[0].control = overrides.players.white;
  }
  if (overrides.players?.black) {
    base.players[1].control = overrides.players.black;
  }
  if (overrides.timeControl) {
    base.timeControl = {
      ...overrides.timeControl,
      maxSeconds: overrides.timeControl.maxSeconds ?? overrides.timeControl.initialSeconds
    };
  }
  if (overrides.puzzleId) {
    base.puzzleId = overrides.puzzleId;
  }
  if (overrides.tutorialId) {
    base.tutorialId = overrides.tutorialId;
  }
  if (overrides.variant) {
    base.variantId = overrides.variant.id;
    if (overrides.variant.ruleOverrides) {
      base.rules = { ...base.rules, ...overrides.variant.ruleOverrides };
    }
    if (overrides.variant.startingPosition) {
      base.startingPosition = overrides.variant.startingPosition;
    }
  }
  return base;
}
function validateGameModeConfig(config) {
  const errors = [];
  const white = config.players.find((player) => player.side === "white");
  const black = config.players.find((player) => player.side === "black");
  if (!white || !black || config.players.length !== 2) {
    errors.push("players must include exactly one white and one black slot.");
  }
  if (config.rules.allowSplitMerge && !config.rules.quantumEnabled) {
    errors.push("allowSplitMerge requires quantumEnabled.");
  }
  if ((config.modeId === "online_ranked" || config.modeId === "online_unranked") && config.matchmaking === "none") {
    errors.push("online modes must declare matchmaking.");
  }
  if ((config.modeId === "online_ranked" || config.modeId === "online_unranked") && !config.players.some((player) => player.control === "human_remote")) {
    errors.push("online modes require a remote player slot.");
  }
  if (config.modeId === "vs_ai" && !config.players.some((player) => player.control === "ai")) {
    errors.push("vs_ai mode requires an AI player slot.");
  }
  if (config.modeId === "ai_vs_ai" && !config.players.every((player) => player.control === "ai")) {
    errors.push("ai_vs_ai mode requires both players to be AI.");
  }
  if (config.modeId === "spectate") {
    if (config.matchmaking !== "none") {
      errors.push("spectate mode cannot declare matchmaking.");
    }
    if (config.players.some((player) => player.control !== "human_remote")) {
      errors.push("spectate mode requires remote player slots.");
    }
  }
  if (config.modeId === "analysis" && config.matchmaking !== "none") {
    errors.push("analysis mode cannot declare matchmaking.");
  }
  if (config.modeId === "puzzle" && !config.puzzleId) {
    errors.push("puzzle mode requires puzzleId.");
  }
  if (config.modeId === "tutorial" && !config.tutorialId) {
    errors.push("tutorial mode requires tutorialId.");
  }
  if (config.modeId === "online_ranked") {
    if (!config.timeControl) {
      errors.push("online_ranked requires a time control.");
    }
  }
  if (config.timeControl) {
    if (config.timeControl.initialSeconds <= 0 || config.timeControl.incrementSeconds < 0) {
      errors.push("time control values must be non-negative and initialSeconds must be positive.");
    }
    if (config.timeControl.maxSeconds <= 0) {
      errors.push("time control maxSeconds must be positive.");
    }
    if (config.timeControl.maxSeconds < config.timeControl.initialSeconds) {
      errors.push("time control maxSeconds cannot be less than initialSeconds.");
    }
  }
  if ((config.modeId === "puzzle" || config.modeId === "tutorial") && config.rules.objective !== "puzzle") {
    errors.push("puzzle/tutorial modes must use puzzle objective.");
  }
  return errors;
}
function assertValidGameModeConfig(config) {
  const errors = validateGameModeConfig(config);
  if (errors.length > 0) {
    throw new Error(`Invalid game mode config: ${errors.join(" ")}`);
  }
}

// src/core/parityMatrix.ts
var ALL_GAME_MODES = [
  "sandbox",
  "vs_ai",
  "online_ranked",
  "online_unranked",
  "puzzle",
  "tutorial",
  "spectate",
  "analysis"
];
var PARITY_MATRIX = [
  { bucketId: "sandbox", label: "Sandbox", requiredModes: ["sandbox"] },
  { bucketId: "vs_ai", label: "VS AI", requiredModes: ["vs_ai"] },
  { bucketId: "local_multiplayer", label: "Local Multiplayer", requiredModes: ["sandbox", "analysis"] },
  { bucketId: "online_multiplayer", label: "Online Multiplayer", requiredModes: ["online_ranked", "online_unranked", "spectate"] },
  { bucketId: "time_controls", label: "Time Controls", requiredModes: ["vs_ai", "online_ranked", "online_unranked"] },
  { bucketId: "puzzles_tutorials", label: "Puzzles / Tutorials", requiredModes: ["puzzle", "tutorial"] },
  { bucketId: "spectate", label: "Spectate", requiredModes: ["spectate"] },
  { bucketId: "analysis", label: "Analysis", requiredModes: ["analysis"] },
  { bucketId: "probability_ring", label: "Probability Ring", requiredModes: ALL_GAME_MODES },
  {
    bucketId: "entanglement_phase_overlays",
    label: "Entanglement / Phase Overlays",
    requiredModes: ALL_GAME_MODES
  },
  { bucketId: "auth_tester_portal", label: "Auth Tester Portal", requiredModes: ["online_ranked", "online_unranked", "spectate"] },
  {
    bucketId: "variants_tournaments_extensibility",
    label: "Variants / Tournaments Extensibility",
    requiredModes: ["sandbox", "online_ranked", "online_unranked", "analysis"]
  }
];

// src/core/pgn.ts
function defaultHeaders() {
  const now = /* @__PURE__ */ new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return {
    Event: "Quantum Chess Game",
    Site: "quantumchess.net",
    Date: `${yyyy}.${mm}.${dd}`,
    Round: "-",
    White: "?",
    Black: "?",
    Result: "*"
  };
}
function escapeHeaderValue(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
function formatHeaderLine(tag, value) {
  return `[${tag} "${escapeHeaderValue(value)}"]`;
}
function exportPgn(options) {
  const merged = { ...defaultHeaders(), ...options.headers };
  const headers = Object.fromEntries(
    Object.entries(merged).filter(([, v]) => v !== void 0)
  );
  if (options.result) {
    headers.Result = options.result;
  }
  const lines = [];
  const sevenTags = ["Event", "Site", "Date", "Round", "White", "Black", "Result"];
  for (const tag of sevenTags) {
    lines.push(formatHeaderLine(tag, headers[tag]));
  }
  if (options.fen) {
    lines.push(formatHeaderLine("SetUp", "1"));
    lines.push(formatHeaderLine("FEN", options.fen));
  }
  if (options.quantumHeaders !== false) {
    lines.push(formatHeaderLine("Variant", "Quantum"));
  }
  const writtenTags = /* @__PURE__ */ new Set([...sevenTags, "SetUp", "FEN", "Variant"]);
  for (const [tag, value] of Object.entries(headers)) {
    if (!writtenTags.has(tag)) {
      lines.push(formatHeaderLine(tag, value));
    }
  }
  lines.push("");
  const moveTokens = [];
  for (const entry of options.moves) {
    const moveNum = Math.floor(entry.ply / 2) + 1;
    const isWhite = entry.ply % 2 === 0;
    if (isWhite) {
      moveTokens.push(`${moveNum}.`);
    } else if (moveTokens.length === 0) {
      moveTokens.push(`${moveNum}...`);
    }
    moveTokens.push(entry.notation);
    if (entry.comment) {
      moveTokens.push(`{${entry.comment}}`);
    }
  }
  moveTokens.push(headers.Result);
  let currentLine = "";
  const movetextLines = [];
  for (const token of moveTokens) {
    if (currentLine.length === 0) {
      currentLine = token;
    } else if (currentLine.length + 1 + token.length > 80) {
      movetextLines.push(currentLine);
      currentLine = token;
    } else {
      currentLine += " " + token;
    }
  }
  if (currentLine) {
    movetextLines.push(currentLine);
  }
  lines.push(...movetextLines);
  lines.push("");
  return lines.join("\n");
}
function moveRecordsToPgnEntries(records) {
  return records.map((r) => {
    const comment = r.wasBlocked ? "blocked" : void 0;
    return {
      moveString: r.moveString,
      notation: r.notation,
      ply: r.ply,
      comment
    };
  });
}
function unescapeHeaderValue(value) {
  return value.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}
var HEADER_REGEX = /^\[(\w+)\s+"(.*)"\]\s*$/;
var MOVE_NUMBER_REGEX = /^(\d+)(\.{1,3})$/;
var COMMENT_REGEX = /\{([^}]*)\}/g;
function parsePgn(pgn) {
  const text = pgn.trim();
  if (!text) return null;
  const headers = { ...defaultHeaders() };
  const moves = [];
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line === "") {
      i++;
      if (Object.keys(headers).length > 7 || i > 1) break;
      continue;
    }
    const headerMatch = HEADER_REGEX.exec(line);
    if (headerMatch) {
      headers[headerMatch[1]] = unescapeHeaderValue(headerMatch[2]);
      i++;
    } else {
      break;
    }
  }
  const movetextRaw = lines.slice(i).join(" ");
  const comments = [];
  const movetextNoComments = movetextRaw.replace(COMMENT_REGEX, (_match, content) => {
    comments.push(content.trim());
    return ` __COMMENT_${comments.length - 1}__ `;
  });
  const tokens = movetextNoComments.split(/\s+/).filter((t) => t.length > 0);
  let currentPly = 0;
  if (headers.FEN) {
    const fenData = fenToGameData(headers.FEN);
    if (fenData) {
      currentPly = fenData.board.ply;
    }
  }
  for (const token of tokens) {
    if (token === "1-0" || token === "0-1" || token === "1/2-1/2" || token === "*") {
      continue;
    }
    const commentPlaceholder = /^__COMMENT_(\d+)__$/.exec(token);
    if (commentPlaceholder) {
      const commentIdx = Number(commentPlaceholder[1]);
      if (moves.length > 0 && comments[commentIdx] !== void 0) {
        moves[moves.length - 1].comment = comments[commentIdx];
      }
      continue;
    }
    const moveNumMatch = MOVE_NUMBER_REGEX.exec(token);
    if (moveNumMatch) {
      const num = Number(moveNumMatch[1]);
      const dots = moveNumMatch[2];
      if (dots === "...") {
        currentPly = (num - 1) * 2 + 1;
      } else {
        currentPly = (num - 1) * 2;
      }
      continue;
    }
    const notation = token;
    const parsed = parseMoveString(notation);
    const moveString = parsed ? formatMoveString(parsed) : notation;
    moves.push({
      moveString,
      notation,
      ply: currentPly
    });
    currentPly++;
  }
  return { headers, moves };
}
function pgnToMoveStrings(pgn) {
  const game = parsePgn(pgn);
  if (!game) return [];
  return game.moves.map((m) => m.moveString);
}
function buildPgn(options) {
  const headers = {};
  if (options.white) headers.White = options.white;
  if (options.black) headers.Black = options.black;
  if (options.event) headers.Event = options.event;
  if (options.site) headers.Site = options.site;
  if (options.date) headers.Date = options.date;
  if (options.round) headers.Round = options.round;
  if (options.extraHeaders) {
    Object.assign(headers, options.extraHeaders);
  }
  return exportPgn({
    headers,
    moves: moveRecordsToPgnEntries(options.moves),
    result: options.result,
    fen: options.fen
  });
}

// src/quantum/adapter.ts
function buildOperationPlan(move) {
  switch (move.type) {
    case 4 /* SplitJump */:
    case 5 /* SplitSlide */:
      return [
        { op: "i_swap", squares: [move.square1, move.square2], fraction: 0.5 },
        { op: "i_swap", squares: [move.square1, move.square3], fraction: 1 }
      ];
    case 6 /* MergeJump */:
    case 7 /* MergeSlide */:
      return [
        { op: "i_swap", squares: [move.square3, move.square2], fraction: -1 },
        { op: "i_swap", squares: [move.square3, move.square1], fraction: -0.5 }
      ];
    case 2 /* Jump */:
    case 3 /* Slide */:
      return move.variant === 1 /* Basic */ ? [{ op: "i_swap", squares: [move.square1, move.square2], fraction: 1 }] : [
        { op: "measure", squares: [move.square1] },
        { op: "measure", squares: [move.square2] }
      ];
    case 10 /* PawnCapture */:
    case 11 /* PawnEnPassant */:
      return [{ op: "measure", squares: [move.square1] }];
    default:
      return [{ op: "i_swap", squares: [move.square1, move.square2], fraction: 1 }];
  }
}
var QuantumChessQuantumAdapter = class {
  squareProps = /* @__PURE__ */ new Map();
  /** Tracks which squares are classically occupied. Used for lazy property creation. */
  classicalOccupied = /* @__PURE__ */ new Set();
  dimension;
  port;
  ancillaPool = [];
  /** Operation recording for undo. When enabled, all gate ops are logged. */
  _recording = false;
  _recordedOps = [];
  /** All handles ever created by this adapter (for orphan detection during undo). */
  _allHandles = /* @__PURE__ */ new Set();
  /** Property allocation tracking for diagnostics. */
  _stats = {
    /** Total properties created (lifetime). */
    created: 0,
    /** Total properties destroyed via destroyProperty (lifetime). */
    destroyed: 0,
    /** Current live property count (created - destroyed). */
    get live() {
      return this.created - this.destroyed;
    },
    /** Peak concurrent live properties. */
    peakLive: 0,
    /** Breakdown of created handles by purpose. */
    createdByType: { square: 0, captureAncilla: 0, conditionFlag: 0, measureAncilla: 0 }
  };
  /**
   * Deferred iSwap phase counts per quantum handle.
   * When a superposed piece makes a standard move to an empty square with
   * no predicates, the iSwap is deferred: instead of calling port.iSwap(),
   * we move the handle in squareProps and increment the phase count.
   * Each deferred iSwap accumulates a phase of i (= clock(0.5)).
   * Flushed before any real quantum interaction with the handle.
   */
  pendingPhases = /* @__PURE__ */ new Map();
  // --- Recording-aware gate wrappers ---
  // These record operations when _recording is true, for later undo.
  _iSwap(h1, h2, fraction, predicates) {
    if (this._recording) this._recordedOps.push({ type: "iSwap", handles: [h1, h2], fraction, predicates });
    this.port.iSwap(h1, h2, fraction, predicates);
  }
  _cycle(h, fraction, predicates) {
    if (this._recording) this._recordedOps.push({ type: "cycle", handles: [h], fraction, predicates });
    this.port.cycle(h, fraction, predicates);
  }
  _swap(h1, h2, predicates) {
    if (this._recording) this._recordedOps.push({ type: "swap", handles: [h1, h2], predicates });
    this.port.swap(h1, h2, predicates);
  }
  _clock(h, fraction, predicates) {
    if (this._recording) this._recordedOps.push({ type: "clock", handles: [h], fraction, predicates });
    this.port.clock(h, fraction, predicates);
  }
  _trackCreate(type) {
    this._stats.created++;
    this._stats.createdByType[type]++;
    if (this._stats.live > this._stats.peakLive) this._stats.peakLive = this._stats.live;
  }
  _trackDestroy() {
    this._stats.destroyed++;
  }
  /** Get property allocation stats for diagnostics. */
  getPropertyStats() {
    return this._stats;
  }
  /** Check if the quantum state is near the OOM limit.
   *  Returns true if state_vector_size on any tracked property exceeds the threshold.
   *  Call before search moves to abort early instead of crashing WASM. */
  isNearOOM(threshold = 5e4) {
    for (const prop of this.squareProps.values()) {
      const h = prop;
      if (typeof h.state_vector_size === "function") {
        try {
          if (h.state_vector_size() > threshold) return true;
        } catch {
          return true;
        }
      }
      break;
    }
    return false;
  }
  /** Start recording quantum operations. Call before executeMove. */
  startRecording() {
    this._recording = true;
    this._recordedOps = [];
  }
  /** Stop recording and return the recorded operations. */
  stopRecording() {
    this._recording = false;
    const ops = this._recordedOps;
    this._recordedOps = [];
    return ops;
  }
  /**
   * Undo recorded operations by applying their inverses in reverse order.
   * iSwap(a,b,f) → iSwap(a,b,-f). cycle(h,f) → cycle(h,-f). swap is self-inverse.
   */
  undoRecordedOps(ops) {
    for (let i = ops.length - 1; i >= 0; i--) {
      const op = ops[i];
      try {
        switch (op.type) {
          case "iSwap":
            this.port.iSwap(op.handles[0], op.handles[1], -(op.fraction ?? 1), op.predicates);
            break;
          case "cycle":
            this.port.cycle(op.handles[0], -(op.fraction ?? 1), op.predicates);
            break;
          case "swap":
            this.port.swap(op.handles[0], op.handles[1], op.predicates);
            break;
          case "clock":
            this.port.clock(op.handles[0], -(op.fraction ?? 1), op.predicates);
            break;
        }
      } catch {
      }
    }
  }
  /** Snapshot of adapter bookkeeping state for undo. */
  /** True if there are no quantum properties — position is fully classical. */
  isFullyClassical() {
    return this.squareProps.size === 0;
  }
  captureBookkeeping() {
    return {
      squareProps: new Map(this.squareProps),
      classicalOccupied: new Set(this.classicalOccupied),
      pendingPhases: new Map(this.pendingPhases),
      ancillaPool: [...this.ancillaPool],
      handleCount: this._allHandles.size
    };
  }
  /** Restore adapter bookkeeping state from a snapshot.
   *  Destroys any quantum handles created since the snapshot (transient search
   *  properties) to prevent state vector growth during do/undo search. */
  restoreBookkeeping(snapshot) {
    this.squareProps.clear();
    for (const [k, v] of snapshot.squareProps) this.squareProps.set(k, v);
    this.classicalOccupied.clear();
    for (const v of snapshot.classicalOccupied) this.classicalOccupied.add(v);
    this.pendingPhases.clear();
    for (const [k, v] of snapshot.pendingPhases) this.pendingPhases.set(k, v);
    this.ancillaPool = [...snapshot.ancillaPool];
    if (this._allHandles.size > snapshot.handleCount && this.port.destroyProperty) {
      const fas = this.port.factorizeAllSeparable;
      if (typeof fas === "function" && this.squareProps.size > 0) {
        try {
          fas();
        } catch {
        }
      }
      const origWarn = typeof console !== "undefined" ? console.warn : void 0;
      if (origWarn) console.warn = () => {
      };
      const handles = [...this._allHandles];
      for (let i = snapshot.handleCount; i < handles.length; i++) {
        const h = handles[i];
        if (typeof h.is_valid === "function" && !h.is_valid()) continue;
        try {
          this.port.destroyProperty(handles[i]);
          this._trackDestroy();
        } catch {
        }
      }
      const keep = handles.slice(0, snapshot.handleCount);
      this._allHandles.clear();
      for (const h of keep) this._allHandles.add(h);
      if (origWarn) console.warn = origWarn;
    }
  }
  constructor(port, options = {}) {
    this.port = port;
    this.dimension = options.dimension ?? 2;
  }
  clear() {
    if (typeof this.port.destroyProperty === "function") {
      for (const [_sq, prop] of this.squareProps) {
        this.port.destroyProperty(prop);
      }
      for (const prop of this.ancillaPool) {
        this.port.destroyProperty(prop);
      }
    }
    this.squareProps.clear();
    this.classicalOccupied.clear();
    this.ancillaPool = [];
    this.pendingPhases.clear();
  }
  hasSquareProperty(square) {
    return this.getExistenceProbability(square) > 1e-6;
  }
  /**
   * Initialize the quantum simulator from a classical piece layout.
   * Lazily tracks occupied squares without creating quantum properties.
   * Properties are created on demand when a square participates in a quantum operation.
   *
   * Only accepts a pieces array -- no game data, no probabilities, no history.
   * This ensures the caller cannot accidentally pass a quantum snapshot.
   * To reconstruct a position with quantum state, replay moves via QCEngine.
   */
  initializeClassical(pieces) {
    this.clear();
    for (let square = 0; square < 64; square += 1) {
      if (pieces[square] !== ".") {
        this.classicalOccupied.add(square);
      }
    }
  }
  /**
   * Ensure a quantum property exists for the given square.
   * If none exists, creates one and initializes it to |1> for occupied or |0> for empty.
   */
  ensureSquareProp(square) {
    const existing = this.squareProps.get(square);
    if (existing) {
      this.flushPendingPhase(existing);
      return existing;
    }
    let prop;
    while (this.ancillaPool.length > 0) {
      const candidate = this.ancillaPool.pop();
      const isValid = candidate && typeof candidate.is_valid === "function" ? candidate.is_valid() : candidate != null;
      if (isValid) {
        prop = candidate;
        break;
      }
    }
    if (!prop) {
      prop = this.port.createProperty(this.dimension);
      this._allHandles.add(prop);
      this._trackCreate("square");
    }
    this.squareProps.set(square, prop);
    if (this.classicalOccupied.has(square)) {
      this._cycle(prop);
    }
    return prop;
  }
  /**
   * Check if a move is entirely classical — source, destination, and path
   * are all classical (no quantum properties). Basic variant only (no
   * measurement needed). For these moves, we can skip QuantumForge
   * entirely and just update classical tracking.
   */
  isClassicalMove(move) {
    if (move.variant !== 1 /* Basic */) return false;
    if (move.type === 4 /* SplitJump */ || move.type === 5 /* SplitSlide */ || move.type === 6 /* MergeJump */ || move.type === 7 /* MergeSlide */) return false;
    if (this.squareProps.has(move.square1)) return false;
    if (!this.classicalOccupied.has(move.square1)) return false;
    if (this.squareProps.has(move.square2)) return false;
    if (move.type === 3 /* Slide */) {
      const pathSquares = this.getPathSquaresExclusive(move.square1, move.square2);
      for (const sq of pathSquares) {
        if (this.squareProps.has(sq)) return false;
        if (this.classicalOccupied.has(sq)) return false;
      }
    }
    if (move.type === 12 /* KingSideCastle */) {
      const rookSq = move.square1 + 3;
      const f1 = move.square1 + 1;
      const g1 = move.square1 + 2;
      if (this.squareProps.has(rookSq) || this.squareProps.has(f1) || this.squareProps.has(g1)) return false;
      if (this.classicalOccupied.has(f1) || this.classicalOccupied.has(g1)) return false;
    }
    if (move.type === 13 /* QueenSideCastle */) {
      const rookSq = move.square1 - 4;
      const d1 = move.square1 - 1;
      const c1 = move.square1 - 2;
      const b1 = move.square1 - 3;
      if (this.squareProps.has(rookSq) || this.squareProps.has(d1) || this.squareProps.has(c1) || this.squareProps.has(b1)) return false;
      if (this.classicalOccupied.has(b1)) return false;
      if (this.classicalOccupied.has(d1) || this.classicalOccupied.has(c1)) return false;
    }
    if (move.type === 11 /* PawnEnPassant */ && move.square3 >= 0) {
      if (this.squareProps.has(move.square3)) return false;
      if (!this.classicalOccupied.has(move.square3)) return false;
    }
    return true;
  }
  /**
   * Apply a fully classical move without any QuantumForge calls.
   * Updates only the classicalOccupied tracking.
   */
  applyClassicalMoveDirectly(move) {
    switch (move.type) {
      case 2 /* Jump */:
      case 3 /* Slide */:
      case 10 /* PawnCapture */:
        this.classicalOccupied.delete(move.square1);
        this.classicalOccupied.delete(move.square2);
        this.classicalOccupied.add(move.square2);
        return { applied: true, measured: false };
      case 11 /* PawnEnPassant */:
        this.classicalOccupied.delete(move.square1);
        this.classicalOccupied.add(move.square2);
        if (move.square3 >= 0) this.classicalOccupied.delete(move.square3);
        return { applied: true, measured: false };
      case 12 /* KingSideCastle */:
        this.classicalOccupied.delete(move.square1);
        this.classicalOccupied.add(move.square1 + 2);
        this.classicalOccupied.delete(move.square1 + 3);
        this.classicalOccupied.add(move.square1 + 1);
        return { applied: true, measured: false };
      case 13 /* QueenSideCastle */:
        this.classicalOccupied.delete(move.square1);
        this.classicalOccupied.add(move.square1 - 2);
        this.classicalOccupied.delete(move.square1 - 4);
        this.classicalOccupied.add(move.square1 - 1);
        return { applied: true, measured: false };
      default:
        this.classicalOccupied.delete(move.square1);
        this.classicalOccupied.add(move.square2);
        return { applied: true, measured: false };
    }
  }
  applyMove(move) {
    if (this.isClassicalMove(move)) {
      return this.applyClassicalMoveDirectly(move);
    }
    let result;
    switch (move.type) {
      case 2 /* Jump */:
        result = this.applyJump(move);
        break;
      case 3 /* Slide */:
        result = this.applySlide(move);
        break;
      case 4 /* SplitJump */:
        result = this.applySplitJump(move);
        break;
      case 5 /* SplitSlide */:
        result = this.applySplitSlide(move);
        break;
      case 6 /* MergeJump */:
        result = this.applyMergeJump(move);
        break;
      case 7 /* MergeSlide */:
        result = this.applyMergeSlide(move);
        break;
      case 10 /* PawnCapture */:
        result = this.applyPawnCapture(move);
        break;
      case 11 /* PawnEnPassant */:
        result = this.applyEnPassant(move);
        break;
      case 12 /* KingSideCastle */:
        result = this.applyKingSideCastle(move);
        break;
      case 13 /* QueenSideCastle */:
        result = this.applyQueenSideCastle(move);
        break;
      default:
        this.swapSquares(move.square1, move.square2);
        result = { applied: true, measured: false };
    }
    if (result.measured) {
      this.collapseDeterministicSquares();
    }
    return result;
  }
  /**
   * Scan all quantum-tracked squares and collapse any that are now
   * deterministic (probability > 0.999 or < 0.001) back to classical.
   * The freed quantum property handle goes to the ancilla pool for reuse.
   */
  collapseDeterministicSquares() {
    const toCollapse = [];
    for (const [square, prop] of this.squareProps) {
      const result = this.port.probabilities([prop]);
      const p1 = result.find((e) => e.qudit_values[0] === 1)?.probability ?? 0;
      if (p1 > 0.999 || p1 < 1e-3) {
        toCollapse.push(square);
      }
    }
    for (const square of toCollapse) {
      const prop = this.squareProps.get(square);
      this.flushPendingPhase(prop);
      const [value] = this.port.measure([prop]);
      this.pendingPhases.delete(prop);
      this.squareProps.delete(square);
      if (value !== 0) this._cycle(prop);
      this.ancillaPool.push(prop);
      if (value === 1) {
        this.classicalOccupied.add(square);
      } else {
        this.classicalOccupied.delete(square);
      }
    }
  }
  getExistenceProbability(square) {
    const prop = this.squareProps.get(square);
    if (!prop) {
      return this.classicalOccupied.has(square) ? 1 : 0;
    }
    const result = this.port.probabilities([prop]);
    const oneState = result.find((entry) => entry.qudit_values[0] === 1);
    return oneState?.probability ?? 0;
  }
  /** Sum of all square existence probabilities. A valid state has ~16 at game start. Near-zero means post-selection collapsed the state. */
  getTotalProbability() {
    let total = 0;
    for (const square of this.classicalOccupied) {
      if (!this.squareProps.has(square)) {
        total += 1;
      }
    }
    for (const square of this.squareProps.keys()) {
      total += this.getExistenceProbability(square);
    }
    return total;
  }
  /** Lightweight health snapshot for diagnostics. */
  getHealthSnapshot() {
    let superpositionSquares = 0;
    for (const square of this.squareProps.keys()) {
      const p = this.getExistenceProbability(square);
      if (p > 1e-3 && p < 0.999) superpositionSquares++;
    }
    let stateVectorSize;
    let activeQudits;
    const firstProp = this.squareProps.values().next().value;
    if (firstProp?.state_vector_size) {
      try {
        stateVectorSize = firstProp.state_vector_size();
        activeQudits = firstProp.num_active_qudits();
      } catch {
      }
    }
    return {
      propertyCount: this.squareProps.size,
      ancillaCount: this.ancillaPool.length,
      totalProbability: this.getTotalProbability(),
      superpositionSquares,
      isFullyClassical: this.squareProps.size === 0,
      ...stateVectorSize !== void 0 ? { stateVectorSize } : {},
      ...activeQudits !== void 0 ? { activeQudits } : {},
      liveHandles: this._stats.live,
      peakLiveHandles: this._stats.peakLive,
      createdByType: { ...this._stats.createdByType },
      destroyed: this._stats.destroyed
    };
  }
  measureSquare(square) {
    const prop = this.ensureSquareProp(square);
    const [value] = this.port.measure([prop]);
    this.collapseDeterministicSquares();
    return value;
  }
  applyJump(move) {
    if (move.variant === 1 /* Basic */) {
      this.swapSquares(move.square1, move.square2);
      return { applied: true, measured: false };
    }
    if (move.variant === 2 /* Excluded */) {
      const canMove2 = this.resolveMeasuredCondition(move, [this.getSquareEmptyPredicate(move.square2)]);
      if (canMove2) {
        this.swapSquares(move.square1, move.square2);
      }
      return { applied: canMove2, measured: true, measurementPassed: canMove2 };
    }
    const canMove = this.resolveMeasuredCondition(move, [this.getSquareFullPredicate(move.square1)]);
    if (!canMove) {
      return { applied: false, measured: true, measurementPassed: false };
    }
    this.doCapture(move.square1, move.square2);
    return { applied: true, measured: true, measurementPassed: true };
  }
  applySlide(move) {
    const pathPredicates = this.getPathEmptyPredicates(move.square1, move.square2);
    if (move.variant === 1 /* Basic */) {
      this.swapSquares(move.square1, move.square2, pathPredicates);
      return { applied: true, measured: false };
    }
    if (move.variant === 2 /* Excluded */) {
      const canMove2 = this.resolveMeasuredCondition(move, [this.getSquareEmptyPredicate(move.square2)]);
      if (canMove2) {
        this.swapSquares(move.square1, move.square2, pathPredicates);
      }
      return { applied: canMove2, measured: true, measurementPassed: canMove2 };
    }
    const canMove = this.resolveMeasuredCondition(move, [this.getSquareFullPredicate(move.square1), ...pathPredicates]);
    if (!canMove) {
      return { applied: false, measured: true, measurementPassed: false };
    }
    this.doCapture(move.square1, move.square2);
    return { applied: true, measured: true, measurementPassed: true };
  }
  applySplitJump(move) {
    if (move.square3 < 0) {
      return { applied: false, measured: false };
    }
    this.applySplitJumpSequence(move.square1, move.square2, move.square3);
    return { applied: true, measured: false };
  }
  applySplitSlide(move) {
    if (move.square3 < 0) {
      return { applied: false, measured: false };
    }
    const excluded = /* @__PURE__ */ new Set([move.square1, move.square2, move.square3]);
    const c12Flag = this.createConditionFlag(this.getPathEmptyPredicates(move.square1, move.square2, excluded));
    const c13Flag = this.createConditionFlag(this.getPathEmptyPredicates(move.square1, move.square3, excluded));
    const c12 = this.port.predicateIs(c12Flag, 1);
    const c12Not = this.port.predicateIs(c12Flag, 0);
    const c13 = this.port.predicateIs(c13Flag, 1);
    const c13Not = this.port.predicateIs(c13Flag, 0);
    this.applySplitJumpSequence(move.square1, move.square2, move.square3, [c12, c13]);
    this._iSwap(this.ensureSquareProp(move.square1), this.ensureSquareProp(move.square2), 1, [c12, c13Not]);
    this._iSwap(this.ensureSquareProp(move.square1), this.ensureSquareProp(move.square3), 1, [c12Not, c13]);
    return { applied: true, measured: false };
  }
  applyMergeJump(move) {
    if (move.square3 < 0) {
      return { applied: false, measured: false };
    }
    this.applyMergeJumpSequence(move.square1, move.square2, move.square3);
    return { applied: true, measured: false };
  }
  applyMergeSlide(move) {
    if (move.square3 < 0) {
      return { applied: false, measured: false };
    }
    const excluded = /* @__PURE__ */ new Set([move.square1, move.square2, move.square3]);
    const c31Flag = this.createConditionFlag(this.getPathEmptyPredicates(move.square3, move.square1, excluded));
    const c32Flag = this.createConditionFlag(this.getPathEmptyPredicates(move.square3, move.square2, excluded));
    const c31 = this.port.predicateIs(c31Flag, 1);
    const c31Not = this.port.predicateIs(c31Flag, 0);
    const c32 = this.port.predicateIs(c32Flag, 1);
    const c32Not = this.port.predicateIs(c32Flag, 0);
    this.applyMergeJumpSequence(move.square1, move.square2, move.square3, [c31, c32]);
    this._iSwap(this.ensureSquareProp(move.square3), this.ensureSquareProp(move.square1), -1, [c31, c32Not]);
    this._iSwap(this.ensureSquareProp(move.square3), this.ensureSquareProp(move.square2), -1, [c31Not, c32]);
    return { applied: true, measured: false };
  }
  applyPawnCapture(move) {
    const canCapture = this.resolveMeasuredCondition(move, [this.getSquareFullPredicate(move.square1)]);
    if (!canCapture) {
      return { applied: false, measured: true, measurementPassed: false };
    }
    this._cycle(this.ensureSquareProp(move.square1), void 0, [this.getSquareFullPredicate(move.square2)]);
    return { applied: true, measured: true, measurementPassed: true };
  }
  applyEnPassant(move) {
    if (move.square3 < 0) {
      return { applied: false, measured: false };
    }
    if (move.variant === 1 /* Basic */) {
      this.applyBasicEnPassant(move.square1, move.square2, move.square3);
      return { applied: true, measured: false };
    }
    if (move.variant === 2 /* Excluded */) {
      const canMove2 = this.resolveMeasuredCondition(move, [this.getSquareEmptyPredicate(move.square2)]);
      if (canMove2) {
        this.applyBasicEnPassant(move.square1, move.square2, move.square3);
      }
      return { applied: canMove2, measured: true, measurementPassed: canMove2 };
    }
    const canMove = this.resolveMeasuredCondition(move, [this.getSquareFullPredicate(move.square1)]);
    if (!canMove) {
      return { applied: false, measured: true, measurementPassed: false };
    }
    this.applyCaptureEnPassant(move.square1, move.square2, move.square3);
    return { applied: true, measured: true, measurementPassed: true };
  }
  applyKingSideCastle(move) {
    if (move.variant === 2 /* Excluded */) {
      const canMove = this.resolveMeasuredCondition(move, this.getPathEmptyPredicates(move.square1, move.square1 + 3));
      if (!canMove) {
        return { applied: false, measured: true, measurementPassed: false };
      }
    }
    this.swapSquares(move.square1, move.square1 + 2);
    this.swapSquares(move.square1 + 3, move.square1 + 1);
    return { applied: true, measured: move.variant === 2 /* Excluded */, measurementPassed: move.variant === 2 /* Excluded */ ? true : void 0 };
  }
  applyQueenSideCastle(move) {
    if (move.variant === 2 /* Excluded */) {
      const canMove = this.resolveMeasuredCondition(move, this.getPathEmptyPredicates(move.square1, move.square1 - 3));
      if (!canMove) {
        return { applied: false, measured: true, measurementPassed: false };
      }
    }
    const bFilePredicates = [this.getSquareEmptyPredicate(move.square1 - 3)];
    this.swapSquares(move.square1, move.square1 - 2, bFilePredicates);
    this.swapSquares(move.square1 - 4, move.square1 - 1, bFilePredicates);
    return { applied: true, measured: move.variant === 2 /* Excluded */, measurementPassed: move.variant === 2 /* Excluded */ ? true : void 0 };
  }
  /**
   * Flush any pending deferred phases for a quantum handle.
   * Applies clock(handle, 0.5 * count) to account for accumulated iSwap phases.
   * Must be called before any real quantum interaction with the handle.
   */
  flushPendingPhase(handle) {
    const count = this.pendingPhases.get(handle);
    if (count) {
      this._clock(handle, 0.5 * count);
      this.pendingPhases.delete(handle);
    }
  }
  /**
   * Flush pending phases for all handles involved in a set of squares.
   */
  flushPendingPhasesForSquares(squares) {
    for (const sq of squares) {
      const handle = this.squareProps.get(sq);
      if (handle) this.flushPendingPhase(handle);
    }
  }
  swapSquares(source, target, predicates) {
    if (!predicates?.length && !this.squareProps.has(source) && !this.squareProps.has(target)) {
      const sourceOccupied = this.classicalOccupied.has(source);
      const targetOccupied = this.classicalOccupied.has(target);
      if (sourceOccupied && !targetOccupied) {
        this.classicalOccupied.delete(source);
        this.classicalOccupied.add(target);
      } else if (!sourceOccupied && targetOccupied) {
        this.classicalOccupied.delete(target);
        this.classicalOccupied.add(source);
      }
      return;
    }
    if (!predicates?.length) {
      const sourceHandle = this.squareProps.get(source);
      const targetHandle = this.squareProps.get(target);
      if (sourceHandle && !targetHandle && !this.classicalOccupied.has(target)) {
        this.squareProps.delete(source);
        this.squareProps.set(target, sourceHandle);
        this.classicalOccupied.delete(source);
        this.pendingPhases.set(sourceHandle, (this.pendingPhases.get(sourceHandle) ?? 0) + 1);
        return;
      }
      if (targetHandle && !sourceHandle && !this.classicalOccupied.has(source)) {
        this.squareProps.delete(target);
        this.squareProps.set(source, targetHandle);
        this.classicalOccupied.delete(target);
        this.pendingPhases.set(targetHandle, (this.pendingPhases.get(targetHandle) ?? 0) + 1);
        return;
      }
    }
    const srcHandle = this.squareProps.get(source);
    const tgtHandle = this.squareProps.get(target);
    if (srcHandle) this.flushPendingPhase(srcHandle);
    if (tgtHandle) this.flushPendingPhase(tgtHandle);
    this._iSwap(this.ensureSquareProp(source), this.ensureSquareProp(target), 1, predicates);
  }
  doCapture(source, target, predicates) {
    const ancilla = this.createAncilla("captureAncilla");
    this._iSwap(this.ensureSquareProp(target), ancilla, 1, predicates);
    this._iSwap(this.ensureSquareProp(source), this.ensureSquareProp(target), 1, predicates);
  }
  applyBasicEnPassant(source, target, epSquare) {
    const predicates = [this.getSquareFullPredicate(source), this.getSquareEmptyPredicate(target), this.getSquareFullPredicate(epSquare)];
    this.applyControlledCycles([source, target, epSquare], predicates);
  }
  applyCaptureEnPassant(source, target, epSquare) {
    const ancillaTarget = this.createAncilla("captureAncilla");
    const ancillaEp = this.createAncilla("captureAncilla");
    this._iSwap(this.ensureSquareProp(epSquare), ancillaEp, 1, [this.getSquareEmptyPredicate(target)]);
    this._iSwap(this.ensureSquareProp(target), ancillaTarget, 1);
    this._iSwap(this.ensureSquareProp(source), this.ensureSquareProp(target), 1, [this.port.predicateIs(ancillaTarget, 1)]);
    this._iSwap(this.ensureSquareProp(source), this.ensureSquareProp(target), 1, [this.port.predicateIs(ancillaEp, 1)]);
  }
  getPathEmptyPredicates(source, target, excluded = /* @__PURE__ */ new Set()) {
    const path = this.getPathSquaresExclusive(source, target).filter((square) => !excluded.has(square));
    return path.filter((square) => {
      if (!this.squareProps.has(square)) {
        return this.classicalOccupied.has(square);
      }
      return this.getExistenceProbability(square) > 1e-9;
    }).map((square) => this.port.predicateIs(this.ensureSquareProp(square), 0));
  }
  getSquareFullPredicate(square) {
    return this.port.predicateIs(this.ensureSquareProp(square), 1);
  }
  getSquareEmptyPredicate(square) {
    return this.port.predicateIs(this.ensureSquareProp(square), 0);
  }
  createAncilla(purpose = "measureAncilla") {
    while (this.ancillaPool.length > 0) {
      const candidate = this.ancillaPool.pop();
      const isValid = candidate && typeof candidate.is_valid === "function" ? candidate.is_valid() : candidate != null;
      if (isValid) return candidate;
    }
    const h = this.port.createProperty(this.dimension);
    this._allHandles.add(h);
    this._trackCreate(purpose);
    return h;
  }
  recycleAncilla(handle) {
    const [value] = this.port.measure([handle]);
    if (value !== 0) {
      this._cycle(handle);
    }
    this.ancillaPool.push(handle);
  }
  createConditionFlag(predicates) {
    const flag = this.createAncilla("conditionFlag");
    this._cycle(flag, void 0, predicates);
    return flag;
  }
  applyControlledCycles(squares, predicates) {
    const gate = this.createConditionFlag(predicates);
    const gatePredicate = this.port.predicateIs(gate, 1);
    for (const square of squares) {
      this._cycle(this.ensureSquareProp(square), void 0, [gatePredicate]);
    }
  }
  applySplitJumpSequence(square1, square2, square3, predicates) {
    this._iSwap(this.ensureSquareProp(square1), this.ensureSquareProp(square2), 0.5, predicates);
    this._iSwap(this.ensureSquareProp(square1), this.ensureSquareProp(square3), 1, predicates);
  }
  applyMergeJumpSequence(square1, square2, square3, predicates) {
    this._iSwap(this.ensureSquareProp(square3), this.ensureSquareProp(square2), -1, predicates);
    this._iSwap(this.ensureSquareProp(square3), this.ensureSquareProp(square1), -0.5, predicates);
  }
  resolveMeasuredCondition(move, predicates) {
    if (!move.doesMeasurement) {
      return this.port.measurePredicate(predicates) === 1;
    }
    const fmp = this.port.forcedMeasurePredicate;
    if (fmp) {
      const requestedOutcome2 = move.measurementOutcome;
      const pp = this.port.predicateProbability;
      if (pp) {
        const prob = pp(predicates);
        const requestedProb2 = requestedOutcome2 === 1 ? prob : 1 - prob;
        if (requestedProb2 < 1e-9) {
          return this.port.measurePredicate(predicates) === 1;
        }
      }
      return fmp(predicates, requestedOutcome2) === 1;
    }
    const ancilla = this.createAncilla();
    this._cycle(ancilla, void 0, predicates);
    const probs = this.port.probabilities([ancilla]);
    const p1 = probs.find((e) => e.qudit_values[0] === 1)?.probability ?? 0;
    const requestedOutcome = move.measurementOutcome;
    const requestedProb = requestedOutcome === 1 ? p1 : 1 - p1;
    let outcome;
    if (requestedProb < 1e-6 || p1 < 1e-9 || p1 > 1 - 1e-9) {
      [outcome] = this.port.measure([ancilla]);
    } else {
      try {
        [outcome] = this.port.forcedMeasure([ancilla], [requestedOutcome]);
      } catch {
        [outcome] = this.port.measure([ancilla]);
      }
    }
    this.recycleAncilla(ancilla);
    return outcome === 1;
  }
  getPathSquaresExclusive(source, target) {
    const sourceFile = getFile(source);
    const targetFile = getFile(target);
    const sourceRank = getRank(source);
    const targetRank = getRank(target);
    const fileDelta = targetFile - sourceFile;
    const rankDelta = targetRank - sourceRank;
    if (fileDelta === 0 && rankDelta === 0) {
      return [];
    }
    const absFile = Math.abs(fileDelta);
    const absRank = Math.abs(rankDelta);
    if (!(fileDelta === 0 || rankDelta === 0 || absFile === absRank)) {
      return [];
    }
    const stepFile = fileDelta === 0 ? 0 : fileDelta > 0 ? 1 : -1;
    const stepRank = rankDelta === 0 ? 0 : rankDelta > 0 ? 1 : -1;
    const squares = [];
    let file = sourceFile + stepFile;
    let rank = sourceRank + stepRank;
    while (file !== targetFile || rank !== targetRank) {
      squares.push(rank * 8 + file);
      file += stepFile;
      rank += stepRank;
    }
    return squares;
  }
  // -----------------------------------------------------------------------
  // Quantum relationship analysis
  // -----------------------------------------------------------------------
  /** Get squares that are in superposition (0 < P < 1). */
  getSuperpositionSquares(gameData, epsilon = 11920929e-14) {
    const result = [];
    for (let sq = 0; sq < 64; sq++) {
      if (!this.squareProps.has(sq)) continue;
      const p = this.getExistenceProbability(sq);
      if (p > epsilon && p < 1 - epsilon) {
        result.push(sq);
      }
    }
    return result;
  }
  /**
   * Compute pairwise correlation between two squares using joint probabilities.
   * Returns { strength, correlation } where:
   *   strength = mutual information (0 = independent, higher = more entangled)
   *   correlation = P(A=1,B=1) - P(A=1)*P(B=1), positive = correlated, negative = anti-correlated
   */
  computeCorrelation(squareA, squareB) {
    const propA = this.squareProps.get(squareA);
    const propB = this.squareProps.get(squareB);
    if (!propA || !propB) return { strength: 0, correlation: 0 };
    const joint = this.port.probabilities([propA, propB]);
    let p00 = 0, p01 = 0, p10 = 0, p11 = 0;
    for (const entry of joint) {
      const [a, b] = entry.qudit_values;
      if (a === 0 && b === 0) p00 = entry.probability;
      else if (a === 0 && b === 1) p01 = entry.probability;
      else if (a === 1 && b === 0) p10 = entry.probability;
      else if (a === 1 && b === 1) p11 = entry.probability;
    }
    const pA = p10 + p11;
    const pB = p01 + p11;
    const correlation = p11 - pA * pB;
    const eps = 1e-12;
    let mi = 0;
    const pairs = [
      [p00, 1 - pA, 1 - pB],
      [p01, 1 - pA, pB],
      [p10, pA, 1 - pB],
      [p11, pA, pB]
    ];
    for (const [pjoint, pmA, pmB] of pairs) {
      if (pjoint > eps && pmA > eps && pmB > eps) {
        mi += pjoint * Math.log2(pjoint / (pmA * pmB));
      }
    }
    return { strength: mi, correlation };
  }
  /**
   * Compute entanglement links for all superposition squares.
   * Returns links sorted by strength, filtered above a threshold.
   */
  computeEntanglementLinks(gameData, threshold = 0.01) {
    const spSquares = this.getSuperpositionSquares(gameData);
    const links = [];
    for (let i = 0; i < spSquares.length; i++) {
      for (let j = i + 1; j < spSquares.length; j++) {
        const { strength, correlation } = this.computeCorrelation(spSquares[i], spSquares[j]);
        if (strength >= threshold) {
          links.push({
            fromSquare: spSquares[i],
            toSquare: spSquares[j],
            strength,
            correlation
          });
        }
      }
    }
    return links.sort((a, b) => b.strength - a.strength);
  }
  /**
   * Compute how measuring a square would affect other squares' probabilities.
   * Returns delta = P(other | measured=1) - P(other) for each other superposition square.
   */
  computeMeasurementImpact(square, gameData, epsilon = 11920929e-14) {
    const propA = this.squareProps.get(square);
    if (!propA) return [];
    const pA = this.getExistenceProbability(square);
    if (pA < epsilon || pA > 1 - epsilon) return [];
    const spSquares = this.getSuperpositionSquares(gameData, epsilon);
    const results = [];
    for (const sq of spSquares) {
      if (sq === square) continue;
      const propB = this.squareProps.get(sq);
      if (!propB) continue;
      const joint = this.port.probabilities([propA, propB]);
      let p01 = 0, p10 = 0, p11 = 0;
      for (const entry of joint) {
        const [a, b] = entry.qudit_values;
        if (a === 0 && b === 1) p01 = entry.probability;
        else if (a === 1 && b === 0) p10 = entry.probability;
        else if (a === 1 && b === 1) p11 = entry.probability;
      }
      const pB = p01 + p11;
      const pBgivenAin = pA > 1e-9 ? p11 / pA : pB;
      const pBgivenAout = 1 - pA > 1e-9 ? p01 / (1 - pA) : pB;
      const deltaIfIn = pBgivenAin - pB;
      const deltaIfOut = pBgivenAout - pB;
      if (Math.abs(deltaIfIn) > 1e-4 || Math.abs(deltaIfOut) > 1e-4) {
        results.push({ square: sq, deltaIfIn, deltaIfOut });
      }
    }
    return results;
  }
  /**
   * Compute relative phase between two squares using the reduced density matrix.
   */
  computeRelativePhase(squareA, squareB) {
    if (!this.port.reducedDensityMatrix) return null;
    const propA = this.squareProps.get(squareA);
    const propB = this.squareProps.get(squareB);
    if (!propA || !propB) return null;
    try {
      const rdm = this.port.reducedDensityMatrix([propA, propB]);
      const offDiag = rdm.find(
        (e) => e.row_values[0] === 1 && e.row_values[1] === 0 && e.col_values[0] === 0 && e.col_values[1] === 1
      );
      if (!offDiag) return null;
      const { real, imag } = offDiag.value;
      const magnitude = Math.sqrt(real * real + imag * imag);
      if (magnitude < 1e-6) return null;
      const radians = Math.atan2(imag, real);
      return { radians, magnitude };
    } catch {
      return null;
    }
  }
  /**
   * Compute relative phase links for same-type same-color piece pairs.
   */
  computeRelativePhaseLinks(gameData, epsilon = 11920929e-14) {
    if (!this.port.reducedDensityMatrix) return [];
    const spSquares = this.getSuperpositionSquares(gameData, epsilon);
    const groups = /* @__PURE__ */ new Map();
    for (const sq of spSquares) {
      const piece = gameData.board.pieces[sq];
      if (piece === ".") continue;
      const key = piece;
      const list = groups.get(key) ?? [];
      list.push(sq);
      groups.set(key, list);
    }
    const links = [];
    for (const squares of groups.values()) {
      if (squares.length < 2) continue;
      for (let i = 0; i < squares.length; i++) {
        for (let j = i + 1; j < squares.length; j++) {
          const phase = this.computeRelativePhase(squares[i], squares[j]);
          if (phase) {
            links.push({
              fromSquare: squares[i],
              toSquare: squares[j],
              radians: phase.radians,
              confidence: phase.magnitude
            });
          }
        }
      }
    }
    return links;
  }
};

// src/quantum/visualTelemetry.ts
function createQuantumVisualSnapshot(gameData, adapter, options = {}) {
  const epsilon = options.probabilityEpsilon ?? 11920929e-14;
  const whiteRingColor = options.ringColor ?? "#ff20d0";
  const blackRingColor = "#ff6600";
  const ringThickness = options.ringThickness ?? 3;
  const squares = [];
  for (let square = 0; square < 64; square += 1) {
    const probability = adapter.getExistenceProbability(square);
    const piece = gameData.board.pieces[square] ?? ".";
    const active = piece !== "." || probability > epsilon || adapter.hasSquareProperty(square);
    if (!active) {
      continue;
    }
    squares.push({
      square,
      piece,
      probability,
      ring: {
        value: probability,
        visible: probability > epsilon && probability < 1 - epsilon,
        color: isBlackPiece(piece) ? blackRingColor : whiteRingColor,
        thickness: ringThickness,
        opacity: Math.max(0.15, Math.min(1, probability))
      }
    });
  }
  const entanglement = options.relationshipProvider?.getEntanglement?.(gameData) ?? [];
  const relativePhase = options.relationshipProvider?.getRelativePhase?.(gameData) ?? [];
  const capabilities = {
    probabilityRings: true,
    entanglement: typeof options.relationshipProvider?.getEntanglement === "function",
    relativePhase: typeof options.relationshipProvider?.getRelativePhase === "function"
  };
  const warnings = [];
  if (!capabilities.entanglement) {
    warnings.push("Entanglement overlay provider not configured.");
  }
  if (!capabilities.relativePhase) {
    warnings.push("Relative phase overlay provider not configured.");
  }
  return {
    revision: options.revision ?? 0,
    squares,
    entanglement,
    relativePhase,
    capabilities,
    warnings
  };
}

export {
  BOARD_SQUARES,
  MoveType,
  MoveVariant,
  MoveCode,
  CLASSICAL_START_FEN,
  createEmptyGameData,
  createClassicalStartGameData,
  cloneGameData,
  classicalBoardToFen,
  gameDataToPositionString,
  fenToGameData,
  indexToSquareName,
  squareNameToIndex,
  getFile,
  getRank,
  isOnBoard,
  isWhitePiece,
  isBlackPiece,
  getPieceColor,
  isEnemyPiece,
  buildStandardMoveFromSquares,
  parseMoveString,
  formatMoveString,
  getLegalTargets,
  getSplitTargets,
  getMergeTargets,
  isLegalStandardMove,
  clearCastlingRightsForSquare,
  applyStandardMove,
  PROBABILITY_EPSILON,
  FIFTY_MOVE_PLY_LIMIT,
  updateFiftyMoveCounter,
  isFiftyMoveDraw,
  clearCastlingRightsFromMove,
  pieceForMoveSource,
  promotedOrSourcePiece,
  prunePiecesByProbabilities,
  remapPieceSymbol,
  applyClassicalShadowMove,
  detectKingCapture,
  clearSandboxBoard,
  placeSandboxPiece,
  relocateSandboxPiece,
  isCurrentTurnPiece,
  selectPiece,
  computeMergeTargets,
  listGameModePresets,
  getGameModePreset,
  createGameModeConfig,
  validateGameModeConfig,
  assertValidGameModeConfig,
  PARITY_MATRIX,
  exportPgn,
  moveRecordsToPgnEntries,
  parsePgn,
  pgnToMoveStrings,
  buildPgn,
  createIsolatedPort,
  createQuantumForgePort,
  buildOperationPlan,
  QuantumChessQuantumAdapter,
  createQuantumVisualSnapshot
};
