import {
  getFile,
  getPieceColor,
  getRank,
  isEnemyPiece,
  isOnBoard,
  type PieceColor
} from "./board";
import { parseMoveString } from "./move";
import { cloneGameData } from "./state";
import { MoveType, type QChessGameData, type QChessMove } from "./types";

export interface LegalTargetOptions {
  ignoreTurnOrder?: boolean;
}

const KNIGHT_OFFSETS = [
  { file: 1, rank: 2 },
  { file: 2, rank: 1 },
  { file: 2, rank: -1 },
  { file: 1, rank: -2 },
  { file: -1, rank: -2 },
  { file: -2, rank: -1 },
  { file: -2, rank: 1 },
  { file: -1, rank: 2 }
];

const KING_OFFSETS = [
  { file: -1, rank: -1 },
  { file: 0, rank: -1 },
  { file: 1, rank: -1 },
  { file: -1, rank: 0 },
  { file: 1, rank: 0 },
  { file: -1, rank: 1 },
  { file: 0, rank: 1 },
  { file: 1, rank: 1 }
];

const EPSILON = 1e-6;

function toIndex(file: number, rank: number): number {
  return rank * 8 + file;
}

function currentTurnColor(ply: number): PieceColor {
  return ply % 2 === 0 ? "white" : "black";
}

function isSquareEmpty(gameData: QChessGameData, square: number): boolean {
  return gameData.board.probabilities[square] <= EPSILON;
}

function isSquareFull(gameData: QChessGameData, square: number): boolean {
  return gameData.board.probabilities[square] >= 1 - EPSILON;
}

function isStandardNonPawnTarget(gameData: QChessGameData, square: number, color: PieceColor): boolean {
  return !isSquareFull(gameData, square) || isEnemyPiece(gameData.board.pieces[square], color);
}

function isSplitTarget(gameData: QChessGameData, square: number, piece: string): boolean {
  return isSquareEmpty(gameData, square) || gameData.board.pieces[square] === piece;
}

function collectSlidingTargets(
  gameData: QChessGameData,
  source: number,
  directions: Array<{ file: number; rank: number }>,
  canLandOn: (square: number) => boolean
): number[] {
  const targets: number[] = [];
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

function collectKnightTargets(gameData: QChessGameData, source: number, canLandOn: (square: number) => boolean): number[] {
  const targets: number[] = [];
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

function collectKingTargets(gameData: QChessGameData, source: number, canLandOn: (square: number) => boolean): number[] {
  const targets: number[] = [];
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

function hasCastleRight(castleFlags: number, color: PieceColor, side: "king" | "queen"): boolean {
  // Bit mapping matches FEN convention: K=1, Q=2, k=4, q=8
  if (color === "white") {
    return side === "king" ? (castleFlags & 1) !== 0 : (castleFlags & 2) !== 0;
  }
  return side === "king" ? (castleFlags & 4) !== 0 : (castleFlags & 8) !== 0;
}

function collectKingCastleTargets(gameData: QChessGameData, source: number, color: PieceColor): number[] {
  const targets: number[] = [];
  const expectedSource = color === "white" ? 4 : 60;
  if (source !== expectedSource) {
    return targets;
  }

  if (
    hasCastleRight(gameData.board.castleFlags, color, "king") &&
    !isSquareFull(gameData, source + 1) &&
    !isSquareFull(gameData, source + 2)
  ) {
    targets.push(source + 2);
  }

  if (
    hasCastleRight(gameData.board.castleFlags, color, "queen") &&
    !isSquareFull(gameData, source - 1) &&
    !isSquareFull(gameData, source - 2) &&
    !isSquareFull(gameData, source - 3)
  ) {
    targets.push(source - 2);
  }

  return targets;
}

function collectPawnTargets(gameData: QChessGameData, source: number, color: PieceColor): number[] {
  const targets: number[] = [];
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

function collectNonPawnTargets(
  gameData: QChessGameData,
  source: number,
  piece: string,
  color: PieceColor,
  canLandOn: (square: number) => boolean
): number[] {
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

export function getLegalTargets(gameData: QChessGameData, source: number, options?: LegalTargetOptions): number[] {
  if (!isOnBoard(source)) {
    return [];
  }

  const piece = gameData.board.pieces[source];
  const color = getPieceColor(piece);
  if (!color || (!options?.ignoreTurnOrder && color !== currentTurnColor(gameData.board.ply))) {
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

export function getSplitTargets(gameData: QChessGameData, source: number, options?: LegalTargetOptions): number[] {
  if (!isOnBoard(source)) {
    return [];
  }
  const piece = gameData.board.pieces[source];
  const color = getPieceColor(piece);
  if (!color || (!options?.ignoreTurnOrder && color !== currentTurnColor(gameData.board.ply)) || piece.toLowerCase() === "p") {
    return [];
  }
  return collectNonPawnTargets(gameData, source, piece, color, (target) => isSplitTarget(gameData, target, piece));
}

export function getMergeTargets(gameData: QChessGameData, sourceA: number, sourceB: number, options?: LegalTargetOptions): number[] {
  if (!isOnBoard(sourceA) || !isOnBoard(sourceB) || sourceA === sourceB) {
    return [];
  }
  const pieceA = gameData.board.pieces[sourceA];
  const pieceB = gameData.board.pieces[sourceB];
  if (pieceA === "." || pieceA !== pieceB) {
    return [];
  }
  const color = getPieceColor(pieceA);
  if (!color || (!options?.ignoreTurnOrder && color !== currentTurnColor(gameData.board.ply)) || pieceA.toLowerCase() === "p") {
    return [];
  }

  const firstTargets = getSplitTargets(gameData, sourceA, options);
  const secondTargets = new Set(getSplitTargets(gameData, sourceB, options));
  return firstTargets.filter((target) => secondTargets.has(target));
}

export function isLegalStandardMove(gameData: QChessGameData, move: QChessMove, options?: LegalTargetOptions): boolean {
  if (!isOnBoard(move.square1) || !isOnBoard(move.square2)) {
    return false;
  }
  if (move.type === MoveType.SplitJump || move.type === MoveType.SplitSlide || move.type === MoveType.MergeJump || move.type === MoveType.MergeSlide) {
    return false;
  }
  return getLegalTargets(gameData, move.square1, options).includes(move.square2);
}

function updateEnPassantSquare(gameData: QChessGameData, move: QChessMove): number {
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

export function clearCastlingRightsForSquare(castleFlags: number, source: number): number {
  let next = castleFlags;
  // Bit mapping matches FEN convention: K=1, Q=2, k=4, q=8
  if (source === 4) {        // e1 — white king: clear both white rights
    next &= ~1;
    next &= ~2;
  } else if (source === 60) { // e8 — black king: clear both black rights
    next &= ~4;
    next &= ~8;
  } else if (source === 0) {  // a1 — white queen-side rook
    next &= ~2;
  } else if (source === 7) {  // h1 — white king-side rook
    next &= ~1;
  } else if (source === 56) { // a8 — black queen-side rook
    next &= ~8;
  } else if (source === 63) { // h8 — black king-side rook
    next &= ~4;
  }
  return next;
}

function clearCastlingRights(castleFlags: number, move: QChessMove): number {
  let next = clearCastlingRightsForSquare(castleFlags, move.square1);
  next = clearCastlingRightsForSquare(next, move.square2);
  if (move.square3 >= 0) {
    next = clearCastlingRightsForSquare(next, move.square3);
  }
  return next;
}

export function applyStandardMove(gameData: QChessGameData, moveInput: string | QChessMove): QChessGameData {
  const move = typeof moveInput === "string" ? parseMoveString(moveInput, gameData) : moveInput;
  if (!move || !isLegalStandardMove(gameData, move)) {
    throw new Error("Illegal or unsupported move");
  }

  const next = cloneGameData(gameData);
  const sourcePiece = next.board.pieces[move.square1];
  const targetPiece = next.board.pieces[move.square2];
  const isPawnMove = sourcePiece.toLowerCase() === "p";
  const isCapture = targetPiece !== "." || move.type === MoveType.PawnEnPassant;

  if (move.type === MoveType.PawnEnPassant) {
    const capturedSquare = sourcePiece === sourcePiece.toUpperCase() ? move.square2 - 8 : move.square2 + 8;
    next.board.pieces[capturedSquare] = ".";
    next.board.probabilities[capturedSquare] = 0;
  }

  if (move.type === MoveType.KingSideCastle) {
    next.board.pieces[move.square2] = sourcePiece;
    next.board.pieces[move.square1] = ".";
    next.board.pieces[move.square1 + 1] = next.board.pieces[move.square1 + 3];
    next.board.pieces[move.square1 + 3] = ".";
    next.board.probabilities[move.square2] = 1;
    next.board.probabilities[move.square1] = 0;
    next.board.probabilities[move.square1 + 1] = 1;
    next.board.probabilities[move.square1 + 3] = 0;
  } else if (move.type === MoveType.QueenSideCastle) {
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

  // Pawn promotion: when a pawn reaches the last rank, replace it with the promotion piece
  if (isPawnMove) {
    const targetRank = getRank(move.square2);
    const promotionRank = sourcePiece === "P" ? 7 : 0;
    if (targetRank === promotionRank) {
      const isWhite = sourcePiece === "P";
      if (move.promotionPiece) {
        // Use the specified promotion piece, ensuring correct case for the color
        const pieceChar = String.fromCharCode(move.promotionPiece);
        next.board.pieces[move.square2] = isWhite ? pieceChar.toUpperCase() : pieceChar.toLowerCase();
      } else {
        // Default to queen
        next.board.pieces[move.square2] = isWhite ? "Q" : "q";
      }
    }
  }

  next.board.ply += 1;
  next.board.enPassantSquare = updateEnPassantSquare(gameData, move);
  next.board.castleFlags = clearCastlingRights(next.board.castleFlags, move);
  // Standard moves operate on classical (probability=1) boards, so use classical reset logic:
  // piece count always changes by exactly 1 on capture, so this is equivalent to the quantum rule.
  next.board.fiftyCount = isPawnMove || isCapture ? 0 : gameData.board.fiftyCount + 1;
  if (isPawnMove || isCapture) {
    let pc = 0;
    for (let i = 0; i < 64; i++) pc += next.board.probabilities[i];
    next.board.fiftyPieceCount = pc;
  }

  return next;
}
