/**
 * Standard Algebraic Notation parser.
 *
 * Bridges the gap between externally-sourced PGN games (which use SAN like
 * "Nf3", "exd5+", "O-O", "e8=Q") and the engine's source-target move format
 * ("g1f3", "e4xd5", "e7e8Q"). The puzzle-discovery worker uses this to
 * replay Lichess game prefixes through the engine before sampling a
 * position for AI evaluation.
 *
 * This parser only handles classical chess SAN — it does not attempt to
 * interpret quantum operations (splits, merges, measurements) since those
 * never appear in source PGNs.
 *
 * Resolution algorithm per move:
 *   1. Strip decoration ("+", "#", "!?", "e.p.")
 *   2. Detect castling shorthand (O-O / O-O-O / 0-0 / 0-0-0)
 *   3. Otherwise regex-parse into (pieceType?, fileHint?, rankHint?,
 *      capture?, targetSquare, promotion?)
 *   4. Enumerate candidate source squares: pieces of the right type and
 *      color, matching any disambiguation hints, that can legally reach
 *      the target square per `getLegalTargets`
 *   5. Exactly one candidate must match — throw on ambiguity or no-match
 *   6. Build a QChessMove via `buildStandardMoveFromSquares`, set promotion
 *      piece if applicable, and return.
 *
 * For a sequence of SAN moves, use `sanSequenceToEngineMoves` which
 * advances the game data through each move and returns both the engine-
 * format move strings and the final game data.
 */

import { getFile, getRank, indexToSquareName, squareNameToIndex } from "./board";
import { buildStandardMoveFromSquares, formatMoveString } from "./move";
import { fenToGameData } from "./state";
import { applyStandardMove, getLegalTargets } from "./rules";
import type { QChessGameData, QChessMove } from "./types";

export class SanParseError extends Error {
  constructor(message: string, public readonly san?: string) {
    super(message);
    this.name = "SanParseError";
  }
}

/**
 * Regex for a standard SAN piece/pawn move (excluding castling).
 *   Capture groups:
 *     1: piece letter (KQRBN) or undefined for a pawn move
 *     2: file hint (a–h) or undefined
 *     3: rank hint (1–8) or undefined
 *     4: "x" if capture, otherwise undefined
 *     5: target square (always present)
 *     6: promotion piece letter (QRBN) or undefined
 */
const SAN_REGEX = /^([KQRBN])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=([QRBN]))?$/;

/** Parse one SAN move in the context of `gameData`. Throws on bad input. */
export function parseSan(san: string, gameData: QChessGameData): QChessMove {
  if (!san) {
    throw new SanParseError("Empty SAN move");
  }
  const cleaned = stripDecorations(san);
  const sideToMove: "white" | "black" =
    gameData.board.ply % 2 === 0 ? "white" : "black";

  // Castling shorthand — check before regex because "O-O" doesn't match it.
  if (isKingSideCastle(cleaned)) {
    return buildCastleMove(gameData, sideToMove, "king-side", san);
  }
  if (isQueenSideCastle(cleaned)) {
    return buildCastleMove(gameData, sideToMove, "queen-side", san);
  }

  const match = SAN_REGEX.exec(cleaned);
  if (!match) {
    throw new SanParseError(`Unrecognized SAN: "${san}"`, san);
  }
  const pieceLetter = match[1] ?? "P"; // pawn moves have no leading letter
  const fileHint = match[2];
  const rankHint = match[3];
  const targetSan = match[5];
  const promotionLetter = match[6];

  const target = squareNameToIndex(targetSan);
  const pieceChar =
    sideToMove === "white" ? pieceLetter.toUpperCase() : pieceLetter.toLowerCase();

  // Enumerate candidate sources.
  const candidates: number[] = [];
  for (let sq = 0; sq < 64; sq++) {
    if (gameData.board.pieces[sq] !== pieceChar) continue;
    if (fileHint && getFile(sq) !== "abcdefgh".indexOf(fileHint)) continue;
    if (rankHint && getRank(sq) !== Number(rankHint) - 1) continue;
    // Cheaper to check "can this piece reach the target" via the engine's
    // own move generator than to reimplement piece-by-piece reachability.
    const reachable = getLegalTargets(gameData, sq).includes(target);
    if (reachable) candidates.push(sq);
  }

  if (candidates.length === 0) {
    throw new SanParseError(
      `No legal ${pieceChar} move matches "${san}" in the current position`,
      san,
    );
  }
  if (candidates.length > 1) {
    throw new SanParseError(
      `Ambiguous SAN "${san}" — multiple candidates: ${candidates
        .map(indexToSquareName)
        .join(", ")}`,
      san,
    );
  }

  const source = candidates[0];
  const move = buildStandardMoveFromSquares(source, target, gameData);
  if (promotionLetter) {
    const promChar =
      sideToMove === "white"
        ? promotionLetter.toUpperCase()
        : promotionLetter.toLowerCase();
    move.promotionPiece = promChar.charCodeAt(0);
  }
  return move;
}

/**
 * Replay a SAN move sequence on top of a classical FEN. Returns the
 * engine-format move strings (suitable for use as `QChessPosition.history`)
 * and the resulting game data after all moves are applied.
 *
 * If any move can't be parsed or applied, throws a SanParseError carrying
 * the failing index and SAN token for debugging.
 */
export function sanSequenceToEngineMoves(
  sans: readonly string[],
  startingFen: string,
): { moves: string[]; finalGameData: QChessGameData } {
  let gameData = fenToGameData(startingFen);
  if (!gameData) {
    throw new SanParseError(`Invalid starting FEN: "${startingFen}"`);
  }
  const moves: string[] = [];
  for (let i = 0; i < sans.length; i++) {
    const san = sans[i];
    let move: QChessMove;
    try {
      move = parseSan(san, gameData);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new SanParseError(`At ply ${i + 1} "${san}": ${msg}`, san);
    }
    const moveString = formatMoveString(move);
    moves.push(moveString);
    gameData = applyStandardMove(gameData, move);
  }
  return { moves, finalGameData: gameData };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripDecorations(san: string): string {
  return san
    .trim()
    .replace(/[!?+#]+$/g, "")        // !, ?, +, #
    .replace(/\s*e\.?\s*p\.?$/i, ""); // "e.p." / "ep" en-passant marker
}

function isKingSideCastle(s: string): boolean {
  return s === "O-O" || s === "0-0" || s === "o-o";
}
function isQueenSideCastle(s: string): boolean {
  return s === "O-O-O" || s === "0-0-0" || s === "o-o-o";
}

function buildCastleMove(
  gameData: QChessGameData,
  side: "white" | "black",
  direction: "king-side" | "queen-side",
  originalSan: string,
): QChessMove {
  const rank = side === "white" ? 0 : 7;
  const kingSquare = rank * 8 + 4; // e1 / e8
  const targetSquare =
    direction === "king-side" ? rank * 8 + 6 : rank * 8 + 2; // g / c
  const piece = gameData.board.pieces[kingSquare];
  const expectedKing = side === "white" ? "K" : "k";
  if (piece !== expectedKing) {
    throw new SanParseError(
      `Castling "${originalSan}" but no ${expectedKing} on ${indexToSquareName(kingSquare)}`,
      originalSan,
    );
  }
  if (!getLegalTargets(gameData, kingSquare).includes(targetSquare)) {
    throw new SanParseError(
      `Castling "${originalSan}" is not legal in the current position`,
      originalSan,
    );
  }
  return buildStandardMoveFromSquares(kingSquare, targetSquare, gameData);
}
