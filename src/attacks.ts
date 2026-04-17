/**
 * Precomputed attack tables for fast move generation.
 *
 * Instead of computing legal targets per-piece at runtime via iteration,
 * these tables provide O(1) lookup of possible target squares.
 *
 * For jumping pieces (knights, kings): fixed offset tables.
 * For sliding pieces (bishops, rooks, queens): ray tables that provide
 * all squares along each ray direction, stopped by the first blocker.
 * For pawns: separate tables for pushes and captures.
 */

// ---------------------------------------------------------------------------
// Board geometry helpers
// ---------------------------------------------------------------------------

function fileOf(sq: number): number { return sq & 7; }
function rankOf(sq: number): number { return sq >> 3; }
function toIndex(file: number, rank: number): number { return rank * 8 + file; }

// ---------------------------------------------------------------------------
// Knight attacks (precomputed)
// ---------------------------------------------------------------------------

const KNIGHT_OFFSETS = [
  { df: -2, dr: -1 }, { df: -2, dr: 1 }, { df: -1, dr: -2 }, { df: -1, dr: 2 },
  { df: 1, dr: -2 }, { df: 1, dr: 2 }, { df: 2, dr: -1 }, { df: 2, dr: 1 }
];

/** KNIGHT_ATTACKS[square] = array of target squares a knight can jump to */
export const KNIGHT_ATTACKS: readonly number[][] = (() => {
  const table: number[][] = [];
  for (let sq = 0; sq < 64; sq++) {
    const f = fileOf(sq), r = rankOf(sq);
    const targets: number[] = [];
    for (const { df, dr } of KNIGHT_OFFSETS) {
      const nf = f + df, nr = r + dr;
      if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) targets.push(toIndex(nf, nr));
    }
    table.push(targets);
  }
  return table;
})();

// ---------------------------------------------------------------------------
// King attacks (precomputed)
// ---------------------------------------------------------------------------

const KING_OFFSETS = [
  { df: -1, dr: -1 }, { df: -1, dr: 0 }, { df: -1, dr: 1 },
  { df: 0, dr: -1 }, { df: 0, dr: 1 },
  { df: 1, dr: -1 }, { df: 1, dr: 0 }, { df: 1, dr: 1 }
];

/** KING_ATTACKS[square] = array of target squares a king can move to */
export const KING_ATTACKS: readonly number[][] = (() => {
  const table: number[][] = [];
  for (let sq = 0; sq < 64; sq++) {
    const f = fileOf(sq), r = rankOf(sq);
    const targets: number[] = [];
    for (const { df, dr } of KING_OFFSETS) {
      const nf = f + df, nr = r + dr;
      if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) targets.push(toIndex(nf, nr));
    }
    table.push(targets);
  }
  return table;
})();

// ---------------------------------------------------------------------------
// Sliding piece rays (precomputed)
// ---------------------------------------------------------------------------

type Direction = { df: number; dr: number };

const ROOK_DIRECTIONS: Direction[] = [
  { df: 0, dr: 1 }, { df: 0, dr: -1 }, { df: 1, dr: 0 }, { df: -1, dr: 0 }
];

const BISHOP_DIRECTIONS: Direction[] = [
  { df: 1, dr: 1 }, { df: 1, dr: -1 }, { df: -1, dr: 1 }, { df: -1, dr: -1 }
];

/**
 * RAY_SQUARES[square][directionIndex] = ordered array of squares along that ray.
 * Stops at the board edge. Caller stops at the first blocker.
 */
function buildRayTable(directions: Direction[]): number[][][] {
  const table: number[][][] = [];
  for (let sq = 0; sq < 64; sq++) {
    const rays: number[][] = [];
    const f = fileOf(sq), r = rankOf(sq);
    for (const { df, dr } of directions) {
      const ray: number[] = [];
      let nf = f + df, nr = r + dr;
      while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
        ray.push(toIndex(nf, nr));
        nf += df;
        nr += dr;
      }
      rays.push(ray);
    }
    table.push(rays);
  }
  return table;
}

/** Rook rays: 4 directions (N/S/E/W) */
export const ROOK_RAYS: readonly (readonly number[])[][] = buildRayTable(ROOK_DIRECTIONS);

/** Bishop rays: 4 directions (NE/NW/SE/SW) */
export const BISHOP_RAYS: readonly (readonly number[])[][] = buildRayTable(BISHOP_DIRECTIONS);

/** Queen rays: all 8 directions (union of rook + bishop) */
export const QUEEN_RAYS: readonly (readonly number[])[][] = buildRayTable([...ROOK_DIRECTIONS, ...BISHOP_DIRECTIONS]);

// ---------------------------------------------------------------------------
// Pawn attacks (precomputed)
// ---------------------------------------------------------------------------

/** WHITE_PAWN_PUSHES[square] = array of forward push targets (1 or 2 squares) */
export const WHITE_PAWN_PUSHES: readonly number[][] = (() => {
  const table: number[][] = [];
  for (let sq = 0; sq < 64; sq++) {
    const r = rankOf(sq);
    const targets: number[] = [];
    if (r < 7) targets.push(sq + 8);          // one forward
    if (r === 1) targets.push(sq + 16);        // two forward from rank 2
    table.push(targets);
  }
  return table;
})();

/** BLACK_PAWN_PUSHES[square] = array of forward push targets */
export const BLACK_PAWN_PUSHES: readonly number[][] = (() => {
  const table: number[][] = [];
  for (let sq = 0; sq < 64; sq++) {
    const r = rankOf(sq);
    const targets: number[] = [];
    if (r > 0) targets.push(sq - 8);           // one forward
    if (r === 6) targets.push(sq - 16);        // two forward from rank 7
    table.push(targets);
  }
  return table;
})();

/** WHITE_PAWN_CAPTURES[square] = diagonal capture squares */
export const WHITE_PAWN_CAPTURES: readonly number[][] = (() => {
  const table: number[][] = [];
  for (let sq = 0; sq < 64; sq++) {
    const f = fileOf(sq), r = rankOf(sq);
    const targets: number[] = [];
    if (r < 7 && f > 0) targets.push(sq + 7);  // capture left
    if (r < 7 && f < 7) targets.push(sq + 9);  // capture right
    table.push(targets);
  }
  return table;
})();

/** BLACK_PAWN_CAPTURES[square] = diagonal capture squares */
export const BLACK_PAWN_CAPTURES: readonly number[][] = (() => {
  const table: number[][] = [];
  for (let sq = 0; sq < 64; sq++) {
    const f = fileOf(sq), r = rankOf(sq);
    const targets: number[] = [];
    if (r > 0 && f > 0) targets.push(sq - 9);  // capture left
    if (r > 0 && f < 7) targets.push(sq - 7);  // capture right
    table.push(targets);
  }
  return table;
})();

// ---------------------------------------------------------------------------
// Fast move generation using precomputed tables
// ---------------------------------------------------------------------------

/**
 * Generate all legal target squares for a piece, using precomputed attack tables.
 * ~5-10x faster than the iterative approach for mid-game positions.
 *
 * @param pieces Board pieces array (64 elements)
 * @param probs Board probabilities array (64 elements)
 * @param source Source square index
 * @param piece Piece character at source
 * @param isWhite Whether the piece is white
 * @param enPassantSquare Current en passant square (-1 if none)
 * @param castleFlags Castling rights bitmask
 * @returns Array of legal target square indices
 */
export function fastLegalTargets(
  pieces: readonly string[],
  probs: readonly number[],
  source: number,
  piece: string,
  isWhite: boolean,
  enPassantSquare: number,
  castleFlags: number
): number[] {
  const targets: number[] = [];
  const pt = piece.toLowerCase();
  const PROB_EPSILON = 1e-6;

  // Helper: can this piece land on target? (empty, or enemy, or same-color superposed)
  const canLandOn = (sq: number): boolean => {
    const tp = pieces[sq];
    if (tp === "." || probs[sq] < PROB_EPSILON) return true; // empty
    const targetWhite = tp >= "A" && tp <= "Z";
    if (targetWhite !== isWhite) return true; // enemy piece (capture)
    // Same color: can land if target is in superposition (excluded variant)
    return probs[sq] < 1 - PROB_EPSILON;
  };

  // Helper: is square fully occupied (blocks sliding)?
  const isFull = (sq: number): boolean => {
    return pieces[sq] !== "." && probs[sq] > 1 - PROB_EPSILON;
  };

  switch (pt) {
    case "n":
      for (const t of KNIGHT_ATTACKS[source]) {
        if (canLandOn(t)) targets.push(t);
      }
      break;

    case "k": {
      for (const t of KING_ATTACKS[source]) {
        if (canLandOn(t)) targets.push(t);
      }
      // Castling
      const rank = isWhite ? 0 : 7;
      const kingSq = rank * 8 + 4;
      if (source === kingSq) {
        // King-side: K=bit 0 (white), k=bit 2 (black)
        const ksBit = isWhite ? 1 : 4;
        if ((castleFlags & ksBit) && !isFull(kingSq + 1) && !isFull(kingSq + 2)) {
          targets.push(kingSq + 2);
        }
        // Queen-side: Q=bit 1 (white), q=bit 3 (black)
        const qsBit = isWhite ? 2 : 8;
        if ((castleFlags & qsBit) && !isFull(kingSq - 1) && !isFull(kingSq - 2) && !isFull(kingSq - 3)) {
          targets.push(kingSq - 2);
        }
      }
      break;
    }

    case "r":
      for (const ray of ROOK_RAYS[source]) {
        for (const t of ray) {
          if (canLandOn(t)) targets.push(t);
          if (isFull(t)) break; // blocked
        }
      }
      break;

    case "b":
      for (const ray of BISHOP_RAYS[source]) {
        for (const t of ray) {
          if (canLandOn(t)) targets.push(t);
          if (isFull(t)) break;
        }
      }
      break;

    case "q":
      for (const ray of QUEEN_RAYS[source]) {
        for (const t of ray) {
          if (canLandOn(t)) targets.push(t);
          if (isFull(t)) break;
        }
      }
      break;

    case "p": {
      const pushes = isWhite ? WHITE_PAWN_PUSHES[source] : BLACK_PAWN_PUSHES[source];
      const captures = isWhite ? WHITE_PAWN_CAPTURES[source] : BLACK_PAWN_CAPTURES[source];

      // Pushes: target must be empty
      for (const t of pushes) {
        if (isFull(t)) break; // blocked only by fully-occupied squares
        targets.push(t);
      }

      // Captures: target must have enemy piece (or same-color superposed) or be en passant.
      // Pawns can only capture diagonally — no excluded variant for pawns onto friendly pieces
      // in standard chess. In quantum chess, a pawn CAN capture diagonally to a square with
      // a superposed enemy piece (measurement), but NOT to a friendly superposed piece.
      for (const t of captures) {
        if (t === enPassantSquare) {
          targets.push(t);
        } else {
          const tp = pieces[t];
          if (tp === "." || probs[t] < PROB_EPSILON) continue;
          const targetWhite = tp >= "A" && tp <= "Z";
          if (targetWhite !== isWhite) targets.push(t); // enemy (capture variant)
          // No excluded variant for pawn diagonal moves — pawns don't "exclude" through friendly pieces
        }
      }
      break;
    }
  }

  return targets;
}
