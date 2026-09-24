export const BOARD_SQUARES = 64;

export enum MoveType {
  Unspecified = 0,
  Jump = 2,
  Slide = 3,
  SplitJump = 4,
  SplitSlide = 5,
  MergeJump = 6,
  MergeSlide = 7,
  PawnCapture = 10,
  PawnEnPassant = 11,
  KingSideCastle = 12,
  QueenSideCastle = 13
}

export enum MoveVariant {
  Unspecified = 0,
  Basic = 1,
  Excluded = 2,
  Capture = 3
}

export enum MoveCode {
  Fail = 0,
  Success = 1,
  WhiteWin = 2,
  BlackWin = 3,
  MutualWin = 4,
  Draw = 5
}

export interface QChessMove {
  square1: number;
  square2: number;
  square3: number;
  type: MoveType;
  variant: MoveVariant;
  doesMeasurement: boolean;
  measurementOutcome: number;
  promotionPiece: number;
  /**
   * Phase rotation rider, in quarter turns (pi/2) in [0, 4): applied to the
   * moving piece's destination square(s) after the move unitary, or to the
   * source before a split. Absent or 0 means no rotation. Alchemy League
   * allows whole quarters (`.p<k>`); Universal QC any angle (`.a<millidegrees>`).
   */
  phaseQuarters?: number;
  /**
   * Split strength (Universal QC): the fraction of a split's first iSwap,
   * source to square2, or of a merge's last iSwap, square1 to the target,
   * negated. A merge at strength f undoes a split at strength f. Absent means
   * the standard 0.5. Serialized as `.s<fraction x 10000>`.
   */
  splitFraction?: number;
}

/**
 * The identity of a quantum chess position — the source of truth.
 * This is everything needed to reconstruct the full quantum state
 * by replaying the history through the quantum simulator.
 */
export interface QChessPosition {
  /** The classical starting position (FEN) before any moves. */
  startingFen: string;
  /**
   * Setup moves that create the initial quantum state (superposition, entanglement)
   * before gameplay begins. These are replayed to build quantum state but do not
   * count as game moves. After replay, the engine resets ply to match the FEN's
   * active color, clears en passant, and resets the fifty-move counter.
   *
   * The FEN's active color determines whose turn it is at game start,
   * regardless of how many setup moves there are.
   */
  setupMoves?: string[];
  /** Game move strings played from the position after setup. */
  history: string[];
}

/**
 * Board state derived from the quantum simulation — a display cache.
 * Updated after each move by reading probabilities from the quantum adapter.
 * NEVER use this to initialize or reconstruct quantum state.
 */
export interface QChessBoardState {
  pieces: string[];
  probabilities: number[];
  ply: number;
  fiftyCount: number;
  fiftyPieceCount: number;
  castleFlags: number;
  enPassantSquare: number;
}

/**
 * Full game state = position identity + board display cache.
 *
 * `position` is the source of truth for quantum state reconstruction.
 * `board` is a derived snapshot for rendering and game logic.
 */
export interface QChessGameData {
  position: QChessPosition;
  board: QChessBoardState;
}
