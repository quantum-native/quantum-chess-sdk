// What a move's measurement actually asks, and how likely it is to pass.
//
// The engine measures one AND-combined condition per move. Which squares go
// into that condition depends on the move's variant, and knowing it lets us
// answer two questions from the board alone:
//
//   - what to report to a search as the branch weight, and
//   - whether undoing the move needs a replay (an uncertain measurement
//     destroys amplitudes; a certain one destroys nothing).

import {
  buildStandardMoveFromSquares,
  MoveType,
  MoveVariant,
  type QChessGameData,
} from "./core";

import type { QCMoveChoice } from "./types";

const PROBABILITY_EPSILON = 1e-6;

/** Strictly between empty and present, i.e. carrying amplitude to collapse. */
export function isSuperposed(p: number): boolean {
  return p > PROBABILITY_EPSILON && p < 1 - PROBABILITY_EPSILON;
}

/** Squares strictly between two squares on a shared rank, file, or diagonal. */
export function squaresBetween(from: number, to: number): number[] {
  const fileStep = Math.sign((to & 7) - (from & 7));
  const rankStep = Math.sign((to >> 3) - (from >> 3));
  const step = rankStep * 8 + fileStep;
  if (step === 0) return [];
  const out: number[] = [];
  for (let sq = from + step; sq !== to; sq += step) {
    if (sq < 0 || sq > 63) return []; // not a straight line; nothing between
    out.push(sq);
  }
  return out;
}

/**
 * Probability that a measuring move goes through, read off the state before
 * the move. Returns undefined when the move doesn't measure, and for the
 * cases whose condition spans several superposed squares at once (a slide
 * capture past a superposed square, castling through one) — those need a
 * joint distribution over the whole predicate set, which the adapter doesn't
 * expose, and a wrong number would be worse than none.
 *
 * The conditions, by variant:
 *
 *   Excluded (move into a square that may be occupied)
 *     target is empty                          → 1 - P(target)
 *   Capture
 *     source is occupied, and for a slide every square along the path is
 *     empty                                    → P(source), when no path
 *                                                square is superposed
 *
 * A capture is never gated on its target: the target's amplitude is
 * entangled into the capture rather than measured, so a capture from a
 * fully-present source always goes through even onto a superposed square.
 */
export function measurementPassProbability(
  gameData: QChessGameData,
  choice: QCMoveChoice
): number | undefined {
  if (choice.type !== "standard") return undefined;

  const piece = gameData.board.pieces[choice.from];
  if (!piece || piece === ".") return undefined;

  const probs = gameData.board.probabilities;
  const move = buildStandardMoveFromSquares(choice.from, choice.to, gameData);

  if (move.variant === MoveVariant.Excluded) {
    // Castling measures the squares between king and rook, not the target.
    if (move.type === MoveType.KingSideCastle || move.type === MoveType.QueenSideCastle) {
      return undefined;
    }
    return 1 - (probs[choice.to] ?? 0);
  }

  if (move.variant === MoveVariant.Capture) {
    if (move.type === MoveType.Slide) {
      for (const sq of squaresBetween(choice.from, choice.to)) {
        if (isSuperposed(probs[sq] ?? 0)) return undefined;
      }
    }
    return probs[choice.from] ?? 0;
  }

  return undefined;
}

/**
 * Whether a move's measurement can destroy amplitude, and so whether undoing
 * it needs a replay rather than a gate reversal.
 *
 * A measurement whose outcome was already certain collapses nothing — the
 * engine still reports `measured`, but the state is unchanged by it and
 * reversing the recorded gates restores it exactly. Only an uncertain
 * outcome destroys information. An unknown probability counts as uncertain:
 * replaying needlessly costs time, skipping a needed replay costs
 * correctness.
 */
export function measurementCanCollapse(
  gameData: QChessGameData,
  choice: QCMoveChoice
): boolean {
  const p = measurementPassProbability(gameData, choice);
  return p === undefined || isSuperposed(p);
}
