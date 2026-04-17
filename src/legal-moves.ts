import {
  getLegalTargets,
  getSplitTargets,
  getMergeTargets,
  indexToSquareName,
  parseMoveString,
  buildStandardMoveFromSquares,
  isCurrentTurnPiece,
  getPieceColor,
  MoveType,
  MoveVariant,
  type QChessGameData,
  type LegalTargetOptions
} from "./core";
import { fastLegalTargets } from "./attacks";
import type { QCLegalMoveSet, QCMoveOption, QCSplitOption, QCMergeOption } from "./types";

const EPSILON = 1e-6;

/**
 * Build the complete set of legal moves for the current side to move.
 * Wraps qc-core's getLegalTargets/getSplitTargets/getMergeTargets.
 */
export function buildLegalMoveSet(
  gameData: QChessGameData,
  options?: LegalTargetOptions
): QCLegalMoveSet {
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

function buildStandardMoves(
  gameData: QChessGameData,
  options?: LegalTargetOptions
): QCMoveOption[] {
  const moves: QCMoveOption[] = [];
  const { pieces, probabilities, ply, enPassantSquare, castleFlags } = gameData.board;

  for (let source = 0; source < 64; source++) {
    const piece = pieces[source];
    if (piece === "." || probabilities[source] <= EPSILON) continue;
    if (!options?.ignoreTurnOrder && !isCurrentTurnPiece(piece, ply, probabilities[source])) continue;

    const isWhite = piece >= "A" && piece <= "Z";

    // Use precomputed attack tables for fast target generation
    const targets = fastLegalTargets(
      pieces, probabilities, source, piece, isWhite, enPassantSquare, castleFlags
    );

    for (const target of targets) {
      const parsed = buildStandardMoveFromSquares(source, target, gameData);

      const move: QCMoveOption = {
        from: source,
        to: target,
        type: parsed.type,
        variant: parsed.variant,
        willMeasure: parsed.variant === MoveVariant.Excluded || parsed.variant === MoveVariant.Capture,
        piece,
        notation: ""
      };

      if (piece.toLowerCase() === "p") {
        const targetRank = target >> 3;
        const isPromotion = (piece === "P" && targetRank === 7) || (piece === "p" && targetRank === 0);
        if (isPromotion) {
          move.promotionChoices = ["q", "r", "b", "n"];
        }
      }

      moves.push(move);
    }
  }

  return moves;
}

function buildSplitMoves(
  gameData: QChessGameData,
  options?: LegalTargetOptions
): QCSplitOption[] {
  const splits: QCSplitOption[] = [];

  for (let source = 0; source < 64; source++) {
    const piece = gameData.board.pieces[source];
    if (piece === "." || gameData.board.probabilities[source] <= EPSILON) continue;
    // Pawns can't split
    if (piece.toLowerCase() === "p") continue;
    if (!options?.ignoreTurnOrder && !isCurrentTurnPiece(piece, gameData.board.ply, gameData.board.probabilities[source])) continue;

    const targets = getSplitTargets(gameData, source, options);
    if (targets.length < 2) continue;

    // Generate all pairs of split targets
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
          type: parsed.type as MoveType.SplitJump | MoveType.SplitSlide,
          piece,
          notation
        });
      }
    }
  }

  return splits;
}

function buildMergeMoves(
  gameData: QChessGameData,
  options?: LegalTargetOptions
): QCMergeOption[] {
  const merges: QCMergeOption[] = [];

  // Find all pairs of same-piece squares with fractional probability (in superposition)
  const pieceSources = new Map<string, number[]>();

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
            type: parsed.type as MoveType.MergeJump | MoveType.MergeSlide,
            piece,
            notation
          });
        }
      }
    }
  }

  return merges;
}
