/**
 * execution.ts — Pure game logic for applying moves to board state.
 *
 * These functions operate on QChessGameData without any UI, quantum adapter,
 * or network dependencies, making them safe to share between client and server.
 */

import { isWhitePiece, isBlackPiece } from "./board";
import { clearCastlingRightsForSquare } from "./rules";
import { cloneGameData, createEmptyGameData } from "./state";
import { MoveType, type QChessGameData, type QChessMove } from "./types";
import {
  getLegalTargets,
  getSplitTargets,
  getMergeTargets,
  type LegalTargetOptions
} from "./rules";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Minimum probability threshold for piece existence.
 * Matches the C++ engine's FLT_EPSILON used for amplitude pruning.
 */
export const PROBABILITY_EPSILON = 1.1920929e-7;

/** Fifty-move rule threshold: piece count must change by at least this much to reset. */
const FIFTY_MOVE_THRESHOLD = 0.9999;

/** Ply limit for the quantum 50-move rule (100 half-moves = 50 full moves). */
export const FIFTY_MOVE_PLY_LIMIT = 100;

/**
 * Update the quantum fifty-move counter based on the change in total piece count
 * (sum of square probabilities). Resets when the piece count changes by >= 1.0.
 * This matches the C++ QuantumChessEngine implementation.
 */
export function updateFiftyMoveCounter(gameData: QChessGameData): { fiftyCount: number; fiftyPieceCount: number } {
  let pieceCount = 0;
  for (let i = 0; i < 64; i++) pieceCount += gameData.board.probabilities[i];

  if (Math.abs(pieceCount - gameData.board.fiftyPieceCount) > FIFTY_MOVE_THRESHOLD) {
    return { fiftyCount: 0, fiftyPieceCount: pieceCount };
  }
  return { fiftyCount: gameData.board.fiftyCount + 1, fiftyPieceCount: gameData.board.fiftyPieceCount };
}

/**
 * Check if the quantum fifty-move rule draw condition is met.
 */
export function isFiftyMoveDraw(gameData: QChessGameData): boolean {
  return gameData.board.fiftyCount >= FIFTY_MOVE_PLY_LIMIT;
}

// ---------------------------------------------------------------------------
// Castling rights
// ---------------------------------------------------------------------------

export function clearCastlingRightsFromMove(castleFlags: number, squares: number[]): number {
  return squares.reduce(
    (flags, sq) => (sq >= 0 ? clearCastlingRightsForSquare(flags, sq) : flags),
    castleFlags
  );
}

// ---------------------------------------------------------------------------
// Move helpers
// ---------------------------------------------------------------------------

export function pieceForMoveSource(gameData: QChessGameData, move: QChessMove): string {
  const piece1 = gameData.board.pieces[move.square1];
  if (piece1 !== ".") return piece1;
  if (move.type === MoveType.MergeJump || move.type === MoveType.MergeSlide) {
    return gameData.board.pieces[move.square2];
  }
  return ".";
}

export function promotedOrSourcePiece(sourcePiece: string, move: QChessMove): string {
  if (move.promotionPiece) {
    const ch = String.fromCharCode(move.promotionPiece);
    // Match case to source piece color (uppercase = white, lowercase = black)
    return sourcePiece === sourcePiece.toUpperCase() ? ch.toUpperCase() : ch.toLowerCase();
  }
  return sourcePiece;
}

export function prunePiecesByProbabilities(gameData: QChessGameData): void {
  for (let sq = 0; sq < 64; sq++) {
    if (gameData.board.probabilities[sq] <= PROBABILITY_EPSILON) {
      gameData.board.pieces[sq] = ".";
    }
  }
}

export function remapPieceSymbol(gameData: QChessGameData, piece: string, extraSquares: number[]): void {
  if (piece === ".") return;
  for (const sq of extraSquares) {
    if (sq >= 0 && sq < 64) {
      gameData.board.pieces[sq] = gameData.board.probabilities[sq] > PROBABILITY_EPSILON ? piece : ".";
    }
  }
}

// ---------------------------------------------------------------------------
// Classical shadow move (updates board pieces after quantum move)
// ---------------------------------------------------------------------------

export function applyClassicalShadowMove(gameData: QChessGameData, move: QChessMove): QChessGameData {
  const next = cloneGameData(gameData);
  const sourcePiece = pieceForMoveSource(gameData, move);
  const movedPiece = promotedOrSourcePiece(sourcePiece, move);

  next.board.ply += 1;

  // Set en passant square for two-step pawn advances
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

  const clear = (sq: number) => { if (sq >= 0 && sq < 64) next.board.pieces[sq] = "."; };
  clear(move.square1);
  clear(move.square2);
  clear(move.square3);

  switch (move.type) {
    case MoveType.Jump:
    case MoveType.Slide:
    case MoveType.PawnCapture:
      if (gameData.board.probabilities[move.square1] > PROBABILITY_EPSILON) next.board.pieces[move.square1] = movedPiece;
      if (gameData.board.probabilities[move.square2] > PROBABILITY_EPSILON) next.board.pieces[move.square2] = movedPiece;
      break;

    case MoveType.PawnEnPassant: {
      // Clear the captured pawn (one rank behind the target)
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

    case MoveType.SplitJump:
    case MoveType.SplitSlide:
      if (gameData.board.probabilities[move.square1] > PROBABILITY_EPSILON) next.board.pieces[move.square1] = sourcePiece;
      if (gameData.board.probabilities[move.square2] > PROBABILITY_EPSILON) next.board.pieces[move.square2] = sourcePiece;
      if (move.square3 >= 0 && gameData.board.probabilities[move.square3] > PROBABILITY_EPSILON) next.board.pieces[move.square3] = sourcePiece;
      break;

    case MoveType.MergeJump:
    case MoveType.MergeSlide:
      if (gameData.board.probabilities[move.square1] > PROBABILITY_EPSILON) next.board.pieces[move.square1] = sourcePiece;
      if (gameData.board.probabilities[move.square2] > PROBABILITY_EPSILON) next.board.pieces[move.square2] = sourcePiece;
      if (move.square3 >= 0 && gameData.board.probabilities[move.square3] > PROBABILITY_EPSILON) next.board.pieces[move.square3] = sourcePiece;
      break;

    case MoveType.KingSideCastle: {
      const rook = isWhitePiece(sourcePiece) ? "R" : "r";
      clear(move.square1 + 3);
      clear(move.square1 + 1);
      if (gameData.board.probabilities[move.square1] > PROBABILITY_EPSILON) next.board.pieces[move.square1] = sourcePiece;
      if (gameData.board.probabilities[move.square2] > PROBABILITY_EPSILON) next.board.pieces[move.square2] = sourcePiece;
      if (gameData.board.probabilities[move.square1 + 3] > PROBABILITY_EPSILON) next.board.pieces[move.square1 + 3] = rook;
      if (gameData.board.probabilities[move.square1 + 1] > PROBABILITY_EPSILON) next.board.pieces[move.square1 + 1] = rook;
      break;
    }

    case MoveType.QueenSideCastle: {
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

  // Quantum fifty-move rule: reset when total piece count changes by >= 1
  const fifty = updateFiftyMoveCounter(next);
  next.board.fiftyCount = fifty.fiftyCount;
  next.board.fiftyPieceCount = fifty.fiftyPieceCount;

  return next;
}

// ---------------------------------------------------------------------------
// Win condition detection
// ---------------------------------------------------------------------------

export function detectKingCapture(gameData: QChessGameData): "white_win" | "black_win" | null {
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

// ---------------------------------------------------------------------------
// Sandbox helpers
// ---------------------------------------------------------------------------

export function clearSandboxBoard(): QChessGameData {
  return createEmptyGameData();
}

export function placeSandboxPiece(
  gameData: QChessGameData,
  square: number,
  piece: string
): QChessGameData {
  if (square < 0 || square > 63) return gameData;
  const next = cloneGameData(gameData);
  next.board.pieces[square] = piece === "." ? "." : piece;
  next.board.probabilities[square] = piece === "." ? 0 : 1;
  return next;
}

export function relocateSandboxPiece(
  gameData: QChessGameData,
  from: number,
  to: number
): QChessGameData {
  if (from < 0 || from > 63 || to < 0 || to > 63 || from === to) return gameData;
  const next = cloneGameData(gameData);
  next.board.pieces[to] = next.board.pieces[from];
  next.board.probabilities[to] = 1;
  next.board.pieces[from] = ".";
  next.board.probabilities[from] = 0;
  return next;
}

// ---------------------------------------------------------------------------
// Board interaction helpers
// ---------------------------------------------------------------------------

export function isCurrentTurnPiece(piece: string, ply: number, probability: number): boolean {
  if (piece === "." || probability <= PROBABILITY_EPSILON) return false;
  return ply % 2 === 0 ? isWhitePiece(piece) : isBlackPiece(piece);
}

export function selectPiece(
  gameData: QChessGameData,
  square: number,
  ignoreTurnOrder?: boolean
): { legalTargets: number[]; splitTargets: number[] } | null {
  const piece = gameData.board.pieces[square];
  if (!ignoreTurnOrder && !isCurrentTurnPiece(piece, gameData.board.ply, gameData.board.probabilities[square])) {
    return null;
  }
  const opts: LegalTargetOptions | undefined = ignoreTurnOrder ? { ignoreTurnOrder } : undefined;
  const targets = getLegalTargets(gameData, square, opts);
  if (targets.length === 0) return null;
  return {
    legalTargets: targets,
    splitTargets: getSplitTargets(gameData, square, opts)
  };
}

export function computeMergeTargets(
  gameData: QChessGameData,
  sourceA: number,
  sourceB: number,
  ignoreTurnOrder?: boolean
): number[] {
  const opts: LegalTargetOptions | undefined = ignoreTurnOrder ? { ignoreTurnOrder } : undefined;
  return getMergeTargets(gameData, sourceA, sourceB, opts);
}
