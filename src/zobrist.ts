/**
 * Zobrist hashing for quantum chess positions.
 *
 * Assigns random 32-bit keys to piece-square combinations and XORs them
 * together for a fast position hash. Used for transposition tables.
 *
 * For quantum chess, we hash the piece identity (which piece is on which square)
 * but NOT the probability. Two positions with the same pieces on the same squares
 * but different probabilities are considered the same for TT purposes — the
 * probability-weighted eval handles the difference.
 *
 * Also includes side-to-move, castling rights, and en passant square.
 */

// 12 piece types (P,N,B,R,Q,K,p,n,b,r,q,k) × 64 squares = 768 keys
// + 1 side-to-move key
// + 16 castling rights keys (4 bits)
// + 8 en passant file keys

const PIECE_CHARS = "PNBRQKpnbrqk";
const NUM_PIECES = 12;

// Deterministic PRNG for reproducible keys (mulberry32)
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0);
  };
}

const rng = mulberry32(0x51A5D3E7); // fixed seed for reproducibility

// Precompute all Zobrist keys
const PIECE_SQUARE_KEYS: number[][] = []; // [pieceIndex][square]
for (let p = 0; p < NUM_PIECES; p++) {
  PIECE_SQUARE_KEYS[p] = [];
  for (let sq = 0; sq < 64; sq++) {
    PIECE_SQUARE_KEYS[p][sq] = rng();
  }
}

const SIDE_TO_MOVE_KEY = rng();

const CASTLING_KEYS: number[] = [];
for (let i = 0; i < 16; i++) CASTLING_KEYS[i] = rng();

const EP_FILE_KEYS: number[] = [];
for (let f = 0; f < 8; f++) EP_FILE_KEYS[f] = rng();

function pieceIndex(piece: string): number {
  const idx = PIECE_CHARS.indexOf(piece);
  return idx; // -1 if not a piece
}

/**
 * Compute full Zobrist hash from a board state.
 */
export function zobristHash(
  pieces: readonly string[],
  probabilities: readonly number[],
  ply: number,
  castleFlags: number,
  enPassantSquare: number
): number {
  let hash = 0;

  // Piece-square keys (only for pieces with probability > 0.1%)
  for (let sq = 0; sq < 64; sq++) {
    const p = pieces[sq];
    if (p === ".") continue;
    if (probabilities[sq] < 0.001) continue;
    const idx = pieceIndex(p);
    if (idx >= 0) hash ^= PIECE_SQUARE_KEYS[idx][sq];
  }

  // Side to move
  if (ply % 2 === 1) hash ^= SIDE_TO_MOVE_KEY;

  // Castling rights
  hash ^= CASTLING_KEYS[castleFlags & 0xF];

  // En passant file (only if there's an EP square)
  if (enPassantSquare >= 0 && enPassantSquare < 64) {
    hash ^= EP_FILE_KEYS[enPassantSquare & 7];
  }

  return hash >>> 0; // ensure unsigned 32-bit
}

/**
 * Incrementally update hash for a piece moving from one square to another.
 */
export function zobristMovePiece(hash: number, piece: string, from: number, to: number): number {
  const idx = pieceIndex(piece);
  if (idx < 0) return hash;
  hash ^= PIECE_SQUARE_KEYS[idx][from]; // remove from source
  hash ^= PIECE_SQUARE_KEYS[idx][to];   // add to destination
  return hash >>> 0;
}

/**
 * Incrementally update hash for a piece being removed (captured).
 */
export function zobristRemovePiece(hash: number, piece: string, square: number): number {
  const idx = pieceIndex(piece);
  if (idx < 0) return hash;
  hash ^= PIECE_SQUARE_KEYS[idx][square];
  return hash >>> 0;
}

/**
 * Flip side to move in hash.
 */
export function zobristFlipSide(hash: number): number {
  return (hash ^ SIDE_TO_MOVE_KEY) >>> 0;
}

/**
 * Update castling rights in hash.
 */
export function zobristUpdateCastling(hash: number, oldFlags: number, newFlags: number): number {
  hash ^= CASTLING_KEYS[oldFlags & 0xF];
  hash ^= CASTLING_KEYS[newFlags & 0xF];
  return hash >>> 0;
}

/**
 * Update en passant in hash.
 */
export function zobristUpdateEP(hash: number, oldEP: number, newEP: number): number {
  if (oldEP >= 0 && oldEP < 64) hash ^= EP_FILE_KEYS[oldEP & 7];
  if (newEP >= 0 && newEP < 64) hash ^= EP_FILE_KEYS[newEP & 7];
  return hash >>> 0;
}
