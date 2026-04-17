import { getFile, getRank, indexToSquareName, isBlackPiece, isWhitePiece, squareNameToIndex } from "./board";
import { MoveType, MoveVariant, type QChessGameData, type QChessMove } from "./types";

const MOVE_REGEX =
  /^([pnbrqkPNBRQK]?)([a-h][1-8])([\^-]?)([wx]?)([a-h][1-8])(ep)?(\^)?([wx]?)([a-h][1-8])?([nbrqNBRQ])?(\.m[01])?$/;

function hasExclusivePath(source: number, target: number): boolean {
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

function parseVariant(raw: string): MoveVariant {
  if (raw === "x") {
    return MoveVariant.Capture;
  }
  if (raw === "w") {
    return MoveVariant.Excluded;
  }
  return MoveVariant.Basic;
}

function inferStandardVariant(sourcePiece: string, targetPiece: string): MoveVariant {
  if (targetPiece === "." || targetPiece === sourcePiece) {
    return MoveVariant.Basic;
  }
  if ((isWhitePiece(sourcePiece) && isBlackPiece(targetPiece)) || (isBlackPiece(sourcePiece) && isWhitePiece(targetPiece))) {
    return MoveVariant.Capture;
  }
  return MoveVariant.Excluded;
}

function inferPawnForwardVariant(sourcePiece: string, targetPiece: string): MoveVariant {
  return targetPiece === "." || targetPiece === sourcePiece ? MoveVariant.Basic : MoveVariant.Excluded;
}

function inferCastleVariant(square1: number, square2: number, sourcePiece: string, gameData: QChessGameData): MoveVariant {
  const rookPiece = isWhitePiece(sourcePiece) ? "R" : "r";
  const target1Piece = gameData.board.pieces[square2];
  const target2Square = square2 > square1 ? square1 + 1 : square1 - 1;
  const target2Piece = gameData.board.pieces[target2Square];
  return target1Piece !== "." || (target2Piece !== "." && target2Piece !== rookPiece) ? MoveVariant.Excluded : MoveVariant.Basic;
}

function inferMoveVariant(piece: string, square1: number, square2: number, gameData?: QChessGameData): MoveVariant {
  if (!gameData || piece === ".") {
    return MoveVariant.Basic;
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

function inferStandardMoveType(piece: string, square1: number, square2: number, isEnPassant: boolean): MoveType {
  const pieceType = piece.toLowerCase();
  if (pieceType === "p") {
    const forward = piece >= "A" && piece <= "Z" ? 8 : -8;
    if (isEnPassant) {
      return MoveType.PawnEnPassant;
    }
    if (square2 === square1 + forward) {
      return MoveType.Jump;
    }
    if (square2 === square1 + 2 * forward) {
      return MoveType.Slide;
    }
    return MoveType.PawnCapture;
  }

  if (pieceType === "k" && square2 === square1 + 2) {
    return MoveType.KingSideCastle;
  }
  if (pieceType === "k" && square2 === square1 - 2) {
    return MoveType.QueenSideCastle;
  }
  if (pieceType === "k" || pieceType === "n") {
    return MoveType.Jump;
  }
  return hasExclusivePath(square1, square2) ? MoveType.Slide : MoveType.Jump;
}

/**
 * Build a QChessMove directly from square indices, bypassing string/regex parsing.
 * For standard moves only (not splits/merges — those use parseMoveString).
 * ~100x faster than parseMoveString for the hot path in AI search.
 */
export function buildStandardMoveFromSquares(
  source: number,
  target: number,
  gameData: QChessGameData
): QChessMove {
  const piece = gameData.board.pieces[source];
  const pieceType = piece.toLowerCase();

  // En passant detection
  const isEnPassant = pieceType === "p"
    && getFile(source) !== getFile(target)
    && gameData.board.enPassantSquare === target;

  const type = inferStandardMoveType(piece, source, target, isEnPassant);
  const variant = inferMoveVariant(piece, source, target, gameData);

  // square3 for en passant: the captured pawn's square
  let square3 = -1;
  if (type === MoveType.PawnEnPassant) {
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

export function parseMoveString(moveString: string, gameData?: QChessGameData): QChessMove | null {
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

  let type: MoveType;
  if (isSplit) {
    type = hasExclusivePath(square1, square2) || hasExclusivePath(square1, square3) ? MoveType.SplitSlide : MoveType.SplitJump;
  } else if (isMerge) {
    type = hasExclusivePath(square1, square3) || hasExclusivePath(square2, square3) ? MoveType.MergeSlide : MoveType.MergeJump;
  } else {
    type = inferStandardMoveType(piece, square1, square2, Boolean(match[6]));
    if (!explicitVariant) {
      variant = inferMoveVariant(piece, square1, square2, gameData);
    }
  }

  if (type === MoveType.PawnEnPassant && square3 === -1) {
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

function variantToString(variant: MoveVariant): string {
  if (variant === MoveVariant.Capture) {
    return "x";
  }
  if (variant === MoveVariant.Excluded) {
    return "w";
  }
  return "";
}

export function formatMoveString(move: QChessMove): string {
  const s1 = indexToSquareName(move.square1);
  const s2 = indexToSquareName(move.square2);
  const variant = variantToString(move.variant);
  const measure = move.doesMeasurement ? `.m${move.measurementOutcome}` : "";
  const promotion = move.promotionPiece ? String.fromCharCode(move.promotionPiece) : "";

  if (move.type === MoveType.SplitJump || move.type === MoveType.SplitSlide) {
    const s3 = indexToSquareName(move.square3);
    return `${s1}^${variant}${s2}${s3}${measure}`;
  }
  if (move.type === MoveType.MergeJump || move.type === MoveType.MergeSlide) {
    const s3 = indexToSquareName(move.square3);
    return `${s1}${s2}^${variant}${s3}${measure}`;
  }
  return `${s1}${variant}${s2}${promotion}${measure}`;
}
