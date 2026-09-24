import { getFile, getRank, indexToSquareName, isBlackPiece, isWhitePiece, squareNameToIndex } from "./board";
import { MoveType, MoveVariant, type QChessGameData, type QChessMove } from "./types";

const MOVE_REGEX =
  /^([pnbrqkPNBRQK]?)([a-h][1-8])([\^-]?)([wx]?)([a-h][1-8])(ep)?(\^)?([wx]?)([a-h][1-8])?([nbrqNBRQ])?(\.m[01])?(\.s[1-9]\d{0,3})?(\.p[1-3]|\.a[1-9]\d{0,5})?$/;

/** Rider resolution. The phase dial and split slider snap to these steps. */
export const PHASE_MILLIDEGREES_PER_QUARTER = 90000;
export const SPLIT_FRACTION_SCALE = 10000;
export const STANDARD_SPLIT_FRACTION = 0.5;

/** Quarter turns to whole millidegrees in [0, 360000). */
export function phaseQuartersToMillidegrees(phaseQuarters: number): number {
  const full = 4 * PHASE_MILLIDEGREES_PER_QUARTER;
  const md = Math.round(phaseQuarters * PHASE_MILLIDEGREES_PER_QUARTER);
  return ((md % full) + full) % full;
}

/** Canonical phase value: quarter turns in [0, 4), snapped to a millidegree. */
export function normalizePhaseQuarters(raw: number | undefined): number {
  if (!raw || !Number.isFinite(raw)) return 0;
  return phaseQuartersToMillidegrees(raw) / PHASE_MILLIDEGREES_PER_QUARTER;
}

/** True when the rider is a whole number of quarter turns (Alchemy's dial). */
export function isWholeQuarterPhase(phaseQuarters: number): boolean {
  return phaseQuartersToMillidegrees(phaseQuarters) % PHASE_MILLIDEGREES_PER_QUARTER === 0;
}

/** Canonical split fraction snapped to 1/10000, or undefined for the standard split. */
export function normalizeSplitFraction(raw: number | undefined): number | undefined {
  if (raw === undefined || !Number.isFinite(raw)) return undefined;
  const n = Math.round(raw * SPLIT_FRACTION_SCALE);
  if (n <= 0 || n >= SPLIT_FRACTION_SCALE) return undefined;
  const f = n / SPLIT_FRACTION_SCALE;
  return f === STANDARD_SPLIT_FRACTION ? undefined : f;
}

/**
 * The rider suffixes in canonical order: `.s<n>` then `.p<k>` or `.a<n>`.
 * Whole quarter turns always print as `.p`, so an Alchemy history and a
 * Universal QC history spell the same rotation the same way.
 */
export function formatRiderSuffix(move: Pick<QChessMove, "type" | "phaseQuarters" | "splitFraction">): string {
  // Strength belongs to splits and merges; on any other move it is not
  // spelled, so a stray field can never format into a string the parser refuses.
  const takesStrength =
    move.type === MoveType.SplitJump || move.type === MoveType.SplitSlide ||
    move.type === MoveType.MergeJump || move.type === MoveType.MergeSlide;
  const f = takesStrength ? normalizeSplitFraction(move.splitFraction) : undefined;
  const split = f === undefined ? "" : `.s${Math.round(f * SPLIT_FRACTION_SCALE)}`;
  const md = move.phaseQuarters ? phaseQuartersToMillidegrees(move.phaseQuarters) : 0;
  if (md === 0) return split;
  return md % PHASE_MILLIDEGREES_PER_QUARTER === 0
    ? `${split}.p${md / PHASE_MILLIDEGREES_PER_QUARTER}`
    : `${split}.a${md}`;
}

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

/**
 * Squares strictly between source and target along a rook/bishop line, in
 * order from source to target. Empty when the squares do not share a line or
 * are adjacent — the same geometry hasExclusivePath answers true/false for.
 * These are the squares a Slide move's exclusion measurement can interrogate.
 */
export function slidePathSquares(source: number, target: number): number[] {
  if (!hasExclusivePath(source, target)) return [];
  const fileStep = Math.sign(getFile(target) - getFile(source));
  const rankStep = Math.sign(getRank(target) - getRank(source));
  const step = rankStep * 8 + fileStep;
  const squares: number[] = [];
  for (let sq = source + step; sq !== target; sq += step) squares.push(sq);
  return squares;
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
  let splitFraction: number | undefined;
  if (match[12]) {
    const n = Number(match[12].slice(2));
    // The standard split is spelled with no suffix.
    if (n <= 0 || n >= SPLIT_FRACTION_SCALE || n === STANDARD_SPLIT_FRACTION * SPLIT_FRACTION_SCALE) return null;
    splitFraction = normalizeSplitFraction(n / SPLIT_FRACTION_SCALE);
  }
  let phaseQuarters = 0;
  if (match[13]?.startsWith(".p")) {
    phaseQuarters = Number(match[13].slice(2));
  } else if (match[13]) {
    const md = Number(match[13].slice(2));
    // One spelling per rotation: whole quarters are `.p<k>`, never `.a`.
    if (md <= 0 || md >= 4 * PHASE_MILLIDEGREES_PER_QUARTER || md % PHASE_MILLIDEGREES_PER_QUARTER === 0) return null;
    phaseQuarters = md / PHASE_MILLIDEGREES_PER_QUARTER;
  }
  if (splitFraction !== undefined && match[3] !== "^" && match[7] !== "^") return null;

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
    promotionPiece,
    phaseQuarters,
    ...(splitFraction !== undefined ? { splitFraction } : {})
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
  const riders = formatRiderSuffix(move);
  const promotion = move.promotionPiece ? String.fromCharCode(move.promotionPiece) : "";

  if (move.type === MoveType.SplitJump || move.type === MoveType.SplitSlide) {
    const s3 = indexToSquareName(move.square3);
    return `${s1}^${variant}${s2}${s3}${measure}${riders}`;
  }
  if (move.type === MoveType.MergeJump || move.type === MoveType.MergeSlide) {
    const s3 = indexToSquareName(move.square3);
    return `${s1}${s2}^${variant}${s3}${measure}${riders}`;
  }
  return `${s1}${variant}${s2}${promotion}${measure}${riders}`;
}
