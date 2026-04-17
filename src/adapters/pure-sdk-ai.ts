import type {
  QCPlayer,
  QCEngineView,
  QCExplorer,
  QCMoveChoice,
  QCClock,
  QCGameResult,
  QCMoveOption,
  QCSplitOption,
  QCMergeOption,
  QCLegalMoveSet
} from "../types";
import { zobristHash } from "../zobrist";

// ---------------------------------------------------------------------------
// Transposition Table (classical positions only)
// ---------------------------------------------------------------------------

const enum TTFlag {
  EXACT = 0,
  LOWER_BOUND = 1, // score >= beta (beta cutoff)
  UPPER_BOUND = 2  // score <= alpha (failed low)
}

interface TTEntry {
  hash: number;
  depth: number;
  score: number;
  flag: TTFlag;
  bestMove: number; // choiceKey of best move
}

const TT_SIZE = 1 << 20; // ~1M entries, ~32MB
const TT_MASK = TT_SIZE - 1;

class TranspositionTable {
  private table: (TTEntry | null)[] = new Array(TT_SIZE).fill(null);

  probe(hash: number, depth: number, alpha: number, beta: number): { score: number; hit: boolean; bestMove: number } {
    const entry = this.table[hash & TT_MASK];
    if (!entry || entry.hash !== hash) return { score: 0, hit: false, bestMove: -1 };
    if (entry.depth < depth) return { score: 0, hit: false, bestMove: entry.bestMove };

    if (entry.flag === TTFlag.EXACT) return { score: entry.score, hit: true, bestMove: entry.bestMove };
    if (entry.flag === TTFlag.LOWER_BOUND && entry.score >= beta) return { score: entry.score, hit: true, bestMove: entry.bestMove };
    if (entry.flag === TTFlag.UPPER_BOUND && entry.score <= alpha) return { score: entry.score, hit: true, bestMove: entry.bestMove };

    return { score: 0, hit: false, bestMove: entry.bestMove };
  }

  store(hash: number, depth: number, score: number, flag: TTFlag, bestMove: number): void {
    const idx = hash & TT_MASK;
    const existing = this.table[idx];
    // Replace if empty, same hash, or lower depth (always-replace with depth preference)
    if (!existing || existing.hash === hash || existing.depth <= depth) {
      this.table[idx] = { hash, depth, score, flag, bestMove };
    }
  }

  clear(): void {
    this.table.fill(null);
  }
}

export interface PureSDKAIOptions {
  /** Search depth in ply. Default 3. Higher = stronger but slower. */
  maxDepth?: number;
  /**
   * Number of Monte Carlo samples for quantum positions.
   * Classical positions (all probs 0 or 1) skip sampling.
   * Default 8.
   */
  sampleCount?: number;
  /** Time limit in ms. Search aborts and returns best-so-far when exceeded. Default 5000. */
  maxTimeMs?: number;
  /** Fraction of remaining clock to use (0-1). Default 0.05 (5%). */
  clockFraction?: number;
}

// ---------------------------------------------------------------------------
// Piece values (centipawns)
// ---------------------------------------------------------------------------

const PIECE_VAL: Record<string, number> = {
  P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000,
  p: -100, n: -320, b: -330, r: -500, q: -900, k: -20000
};

// Unsigned piece values for move ordering
const ABS_PIECE_VAL: Record<string, number> = {
  P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000,
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000
};

// ---------------------------------------------------------------------------
// Piece-square tables (from white's perspective, index 0 = a1)
// Black flips: use index (63 - sq)
// ---------------------------------------------------------------------------

const PAWN_TABLE = [
   0,  0,  0,  0,  0,  0,  0,  0,
   5, 10, 10,-20,-20, 10, 10,  5,
   5, -5,-10,  0,  0,-10, -5,  5,
   0,  0,  0, 20, 20,  0,  0,  0,
   5,  5, 10, 25, 25, 10,  5,  5,
  10, 10, 20, 30, 30, 20, 10, 10,
  50, 50, 50, 50, 50, 50, 50, 50,
   0,  0,  0,  0,  0,  0,  0,  0
];

const KNIGHT_TABLE = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50
];

const BISHOP_TABLE = [
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,  5,  0,  0,  0,  0,  5,-10,
  -10, 10, 10, 10, 10, 10, 10,-10,
  -10,  0, 10, 10, 10, 10,  0,-10,
  -10,  5,  5, 10, 10,  5,  5,-10,
  -10,  0,  5, 10, 10,  5,  0,-10,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -20,-10,-10,-10,-10,-10,-10,-20
];

const ROOK_TABLE = [
   0,  0,  0,  5,  5,  0,  0,  0,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
   5, 10, 10, 10, 10, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0
];

const QUEEN_TABLE = [
  -20,-10,-10, -5, -5,-10,-10,-20,
  -10,  0,  5,  0,  0,  0,  0,-10,
  -10,  5,  5,  5,  5,  5,  0,-10,
    0,  0,  5,  5,  5,  5,  0, -5,
   -5,  0,  5,  5,  5,  5,  0, -5,
  -10,  0,  5,  5,  5,  5,  0,-10,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -20,-10,-10, -5, -5,-10,-10,-20
];

// King: middlegame (stay safe, stay castled)
const KING_MG_TABLE = [
   20, 30, 10,  0,  0, 10, 30, 20,
   20, 20,  0,  0,  0,  0, 20, 20,
  -10,-20,-20,-20,-20,-20,-20,-10,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30
];

const PST: Record<string, number[]> = {
  p: PAWN_TABLE,
  n: KNIGHT_TABLE,
  b: BISHOP_TABLE,
  r: ROOK_TABLE,
  q: QUEEN_TABLE,
  k: KING_MG_TABLE
};

// ---------------------------------------------------------------------------
// Helper: file/rank from square index
// ---------------------------------------------------------------------------

function fileOf(sq: number): number { return sq & 7; }
function rankOf(sq: number): number { return sq >> 3; }

/**
 * Pure SDK AI -- self-contained alpha-beta search using only QCExplorer.
 *
 * No WASM, no UCI, no external engine. Works identically for quantum
 * and classical positions. Uses the explorer for move generation,
 * position evaluation, and lookahead.
 *
 * For quantum positions (pieces in superposition), uses expectimax:
 * measurement moves branch on pass/fail weighted by probability.
 */
export class PureSDKAdapter implements QCPlayer {
  readonly name: string;
  readonly control = "ai" as const;
  readonly author = "Quantum Chess";
  readonly description: string;

  private readonly opts: Required<PureSDKAIOptions>;
  private readonly tt = new TranspositionTable();
  private searchDeadline = 0;
  private nodesSearched = 0;

  // Killer moves: indexed by depth, stores up to 2 move keys per depth
  private killerMoves: Array<[number, number]> = [];

  /** If true, only consider standard moves (no splits/merges). */
  readonly classicalOnly: boolean;

  /** How many plies from root include quantum moves (splits/merges).
   *  Beyond this depth, only standard moves are searched. Similar to
   *  aqaqaq's movegen_ply. Default 1 = quantum at root only. */
  readonly quantumSearchPly: number;

  /** Branching factor and timing stats collected during the last search. */
  lastSearchStats: {
    nodesPerDepth: number[];
    movesPerDepth: number[];
    avgBranchingByPly: number[];
    totalNodes: number;
    avgBranching: number;
    /** Time per iterative deepening iteration (ms). Index 0 = depth 1. */
    timePerDepth: number[];
    /** Total search time (ms). */
    totalTimeMs: number;
    /** Deepest completed depth. */
    completedDepth: number;
    /** Whether search was aborted by OOM. */
    oomAborted: boolean;
  } | null = null;

  // Internal stat accumulators (reset per search)
  private _branchingNodes: number[] | null = null;
  private _branchingMoves: number[] | null = null;

  constructor(name: string = "Quantum Engine", options: PureSDKAIOptions & {
    classicalOnly?: boolean;
    quantumSearchPly?: number;
  } = {}) {
    this.name = name;
    this.classicalOnly = options.classicalOnly ?? false;
    this.quantumSearchPly = options.quantumSearchPly ?? 1;
    const qLabel = this.classicalOnly ? ", classical only" : this.quantumSearchPly < 99 ? `, qPly=${this.quantumSearchPly}` : "";
    this.description = `Pure SDK AI (depth ${options.maxDepth ?? 3}${qLabel})`;
    this.opts = {
      maxDepth: options.maxDepth ?? 3,
      sampleCount: options.sampleCount ?? 8,
      maxTimeMs: options.maxTimeMs ?? 5000,
      clockFraction: options.clockFraction ?? 0.05
    };
    // Pre-allocate killer move slots
    for (let i = 0; i < 20; i++) this.killerMoves.push([-1, -1]);
  }

  async chooseMove(
    view: QCEngineView,
    explorer: QCExplorer | null,
    clock: QCClock | null
  ): Promise<QCMoveChoice> {
    if (!explorer) {
      return this.fallbackMove(view);
    }

    // Set time budget
    const timeLimit = clock
      ? Math.min(clock.remainingMs * this.opts.clockFraction, this.opts.maxTimeMs)
      : this.opts.maxTimeMs;
    this.searchDeadline = Date.now() + timeLimit;
    this.nodesSearched = 0;
    this._branchingNodes = [0];
    this._branchingMoves = [0];

    // Clear killer moves
    for (let i = 0; i < this.killerMoves.length; i++) {
      this.killerMoves[i] = [-1, -1];
    }

    const isWhite = view.sideToMove === "white";
    const { legalMoves } = view;

    // Iterative deepening: search depth 1, 2, ... up to maxDepth
    // Each iteration refines move ordering for the next
    const candidates = this.orderMoves(legalMoves, view, 0);
    let bestChoice = candidates[0].choice;
    let bestScore = -Infinity;
    const timePerDepth: number[] = [];
    let completedDepth = 0;
    let oomAborted = false;
    const searchStart = Date.now();

    for (let depth = 1; depth <= this.opts.maxDepth; depth++) {
      if (this.isTimeUp()) break;
      const depthStart = Date.now();

      let iterBestChoice = candidates[0].choice;
      let iterBestScore = -Infinity;
      let alpha = -Infinity;
      const beta = Infinity;
      let depthAborted = false;

      for (const { choice, move } of candidates) {
        if (this.isTimeUp()) break;

        try {
          const score = this.evaluateMove(explorer, choice, move, depth - 1, isWhite, alpha, beta);
          if (score > iterBestScore) {
            iterBestScore = score;
            iterBestChoice = choice;
          }
          alpha = Math.max(alpha, score);
        } catch (err) {
          // OOM or other quantum sim error — abort this depth, keep best from prior depth
          const msg = (err as Error)?.message ?? "";
          if (msg.includes("OutOfMemory") || msg.includes("out of memory") || msg.includes("memory access out of bounds") || err instanceof RangeError) {
            depthAborted = true;
            oomAborted = true;
            break;
          }
          throw err; // re-throw non-OOM errors
        }
      }

      timePerDepth.push(Date.now() - depthStart);
      if (depthAborted) break;

      // Only update best if we completed this depth (not interrupted)
      if (!this.isTimeUp()) {
        bestChoice = iterBestChoice;
        bestScore = iterBestScore;
        completedDepth = depth;

        // Move best move to front for next iteration
        const bestKey = this.choiceKey(iterBestChoice);
        const idx = candidates.findIndex(c => this.choiceKey(c.choice) === bestKey);
        if (idx > 0) {
          const [item] = candidates.splice(idx, 1);
          candidates.unshift(item);
        }
      }
    }

    // Compute branching factor and timing stats
    const nodes = this._branchingNodes ?? [];
    const moves = this._branchingMoves ?? [];
    const avgByPly = nodes.map((n, i) => n > 0 ? moves[i] / n : 0);
    const totalMoves = moves.reduce((s, n) => s + n, 0);
    const totalNodes = nodes.reduce((s, n) => s + n, 0);
    this.lastSearchStats = {
      nodesPerDepth: nodes,
      movesPerDepth: moves,
      avgBranchingByPly: avgByPly,
      totalNodes: this.nodesSearched,
      avgBranching: totalNodes > 0 ? totalMoves / totalNodes : 0,
      timePerDepth,
      totalTimeMs: Date.now() - searchStart,
      completedDepth,
      oomAborted,
    };
    this._branchingNodes = null;
    this._branchingMoves = null;

    return bestChoice;
  }

  onGameOver(_result: QCGameResult): void {}
  dispose(): void {}

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  /**
   * Evaluate a single root move by applying it and searching deeper.
   * Returns score from the active player's perspective (higher = better for us).
   */
  private evaluateMove(
    explorer: QCExplorer,
    choice: QCMoveChoice,
    move: { willMeasure?: boolean } | null,
    remainingDepth: number,
    isWhiteRoot: boolean,
    alpha: number,
    beta: number
  ): number {
    const hasUndo = typeof (explorer as any).undo === "function";

    if (move?.willMeasure) {
      // Expectimax: branch on both measurement outcomes (sequential for do/undo)
      const pass = explorer.apply(choice, { forceMeasurement: "pass" });
      const p = pass.measurementPassProbability ?? 0.5;
      const passScore = pass.success
        ? this.negamax(pass.explorer, remainingDepth, -Infinity, Infinity, !isWhiteRoot)
        : this.staticEval(pass.explorer);
      if (hasUndo && pass.explorer === explorer) (explorer as any).undo();

      const fail = explorer.apply(choice, { forceMeasurement: "fail" });
      const failScore = fail.success
        ? this.negamax(fail.explorer, remainingDepth, -Infinity, Infinity, !isWhiteRoot)
        : this.staticEval(fail.explorer);
      if (hasUndo && fail.explorer === explorer) (explorer as any).undo();

      const expected = p * passScore + (1 - p) * failScore;
      return isWhiteRoot ? expected : -expected;
    }

    const result = explorer.apply(choice);
    if (!result.success) return -99999;

    const score = this.negamax(result.explorer, remainingDepth, alpha, beta, !isWhiteRoot);
    if (hasUndo && result.explorer === explorer) (explorer as any).undo();
    return isWhiteRoot ? score : -score;
  }

  /**
   * Negamax with alpha-beta pruning.
   * Returns score from white's perspective.
   * `ply` is distance from root (0 = root's children, 1 = grandchildren, etc.)
   */
  private negamax(
    explorer: QCExplorer,
    depth: number,
    alpha: number,
    beta: number,
    maximizing: boolean,
    ply: number = 1
  ): number {
    this.nodesSearched++;
    // Track branching factor stats
    if (this._branchingNodes) {
      while (this._branchingNodes.length <= ply) { this._branchingNodes.push(0); this._branchingMoves!.push(0); }
      this._branchingNodes[ply]++;
    }

    if (depth <= 0 || this.isTimeUp()) {
      return this.quiesce(explorer, alpha, beta, maximizing, 2);
    }

    // Transposition table probe (classical positions only)
    const board = explorer.view.gameData.board;
    const isClassicalPos = this.isClassicalPosition(board.probabilities);
    let ttHash = 0;
    let ttBestMove = -1;
    if (isClassicalPos) {
      ttHash = zobristHash(board.pieces, board.probabilities, board.ply, board.castleFlags, board.enPassantSquare);
      const ttResult = this.tt.probe(ttHash, depth, alpha, beta);
      if (ttResult.hit) return ttResult.score;
      ttBestMove = ttResult.bestMove; // may have a best move even if depth was too shallow
    }

    const moves = explorer.view.legalMoves;
    if (moves.count === 0) {
      return this.staticEval(explorer);
    }

    // Static eval for pruning decisions (computed once, reused)
    const staticScore = this.staticEval(explorer);

    // Null-move pruning: only when static eval already beats the bound
    // (we're likely in a good position, so passing should still be good).
    // Gate: depth >= 4 (avoid qsearch explosion at depth 3), eval above threshold.
    if (depth >= 4 && ply >= 1 && moves.count > 5) {
      const evalAboveBeta = maximizing ? staticScore >= beta : staticScore <= alpha;
      if (evalAboveBeta) {
        const R = depth > 6 ? 4 : 3; // adaptive reduction
        const nullScore = this.negamax(explorer, depth - 1 - R, alpha, beta, !maximizing, ply + 1);
        if (maximizing && nullScore >= beta) {
          if (isClassicalPos) this.tt.store(ttHash, depth, beta, TTFlag.LOWER_BOUND, -1);
          return beta;
        }
        if (!maximizing && nullScore <= alpha) {
          if (isClassicalPos) this.tt.store(ttHash, depth, alpha, TTFlag.UPPER_BOUND, -1);
          return alpha;
        }
      }
    }

    // Futility pruning: at shallow depth, if static eval + margin can't reach
    // the bound, skip quiet moves entirely.
    let futilityPrune = false;
    const FUTILITY_MARGINS = [0, 200, 500]; // depth 0, 1, 2
    if (depth <= 2) {
      const margin = FUTILITY_MARGINS[depth] ?? 0;
      if (maximizing && staticScore + margin < alpha) futilityPrune = true;
      if (!maximizing && staticScore - margin > beta) futilityPrune = true;
    }

    // Get and order moves. Quantum moves (splits/merges) only at ply < quantumSearchPly.
    const candidates = this.orderMovesForSearch(moves, explorer.view, depth, ply);
    if (candidates.length === 0) {
      return this.staticEval(explorer);
    }

    // If TT had a best move, promote it to front of candidates
    if (ttBestMove >= 0) {
      const ttIdx = candidates.findIndex(c => this.choiceKey(c.choice) === ttBestMove);
      if (ttIdx > 0) {
        const [item] = candidates.splice(ttIdx, 1);
        candidates.unshift(item);
      }
    }

    // Track branching factor
    if (this._branchingMoves) {
      this._branchingMoves[ply] += candidates.length;
    }

    const hasUndo = typeof (explorer as any).undo === "function";

    if (maximizing) {
      let best = -Infinity;
      for (let mi = 0; mi < candidates.length; mi++) {
        const { choice, willMeasure, priority } = candidates[mi];
        if (this.isTimeUp()) break;

        // LMR: late quiet moves (not captures/killers/promotions, index > 3)
        // get searched at reduced depth first. If they beat alpha, re-search at full depth.
        const isQuiet = priority <= 100; // 100 = max quiet priority (100% prob piece)
        const isCapture = priority >= 10000;

        // Futility pruning: skip quiet moves at depth 1 when position is hopeless
        if (futilityPrune && isQuiet && !willMeasure) continue;

        // LMR: reduce quiet moves after the first 2. More aggressive at higher depth.
        const useReduction = isQuiet && mi > 1 && depth >= 2 && !willMeasure;
        const reduction = useReduction ? (depth >= 4 ? 2 : 1) : 0;
        const searchDepth = depth - 1 - reduction;

        let score: number;

        if (willMeasure) {
          const pass = explorer.apply(choice, { forceMeasurement: "pass" });
          const p = pass.measurementPassProbability ?? 0.5;
          const ps = pass.success ? this.negamax(pass.explorer, searchDepth, alpha, beta, true, ply + 1) : this.staticEval(pass.explorer);
          if (hasUndo && pass.explorer === explorer) (explorer as any).undo();

          const fail = explorer.apply(choice, { forceMeasurement: "fail" });
          const fs = fail.success ? this.negamax(fail.explorer, searchDepth, alpha, beta, true, ply + 1) : this.staticEval(fail.explorer);
          if (hasUndo && fail.explorer === explorer) (explorer as any).undo();

          score = p * ps + (1 - p) * fs;
        } else {
          const result = explorer.apply(choice);
          score = result.success
            ? this.negamax(result.explorer, searchDepth, alpha, beta, false, ply + 1)
            : -99999;
          if (hasUndo && result.explorer === explorer) (explorer as any).undo();

          // LMR re-search: if reduced search found something promising, search at full depth
          if (useReduction && score > alpha && result.success) {
            const result2 = explorer.apply(choice);
            score = result2.success
              ? this.negamax(result2.explorer, depth - 1, alpha, beta, false, ply + 1)
              : -99999;
            if (hasUndo && result2.explorer === explorer) (explorer as any).undo();
          }
        }

        if (score > best) { best = score; ttBestMove = this.choiceKey(choice); }
        alpha = Math.max(alpha, score);
        if (alpha >= beta) {
          if (!willMeasure && depth < this.killerMoves.length) {
            const key = this.choiceKey(choice);
            const killers = this.killerMoves[depth];
            if (killers[0] !== key) { killers[1] = killers[0]; killers[0] = key; }
          }
          if (isClassicalPos) this.tt.store(ttHash, depth, best, TTFlag.LOWER_BOUND, ttBestMove);
          break;
        }
      }
      if (isClassicalPos) {
        const flag = best <= alpha ? TTFlag.UPPER_BOUND : TTFlag.EXACT;
        this.tt.store(ttHash, depth, best, flag, ttBestMove);
      }
      return best;
    } else {
      let best = Infinity;
      for (let mi = 0; mi < candidates.length; mi++) {
        const { choice, willMeasure, priority } = candidates[mi];
        if (this.isTimeUp()) break;

        const isQuiet = priority <= 100;

        // Futility pruning: skip quiet moves at depth 1 when position is hopeless
        if (futilityPrune && isQuiet && !willMeasure) continue;

        // LMR: reduce quiet moves after the first 2. More aggressive at higher depth.
        const useReduction = isQuiet && mi > 1 && depth >= 2 && !willMeasure;
        const reduction = useReduction ? (depth >= 4 ? 2 : 1) : 0;
        const searchDepth = depth - 1 - reduction;

        let score: number;

        if (willMeasure) {
          const pass = explorer.apply(choice, { forceMeasurement: "pass" });
          const p = pass.measurementPassProbability ?? 0.5;
          const ps = pass.success ? this.negamax(pass.explorer, searchDepth, alpha, beta, false, ply + 1) : this.staticEval(pass.explorer);
          if (hasUndo && pass.explorer === explorer) (explorer as any).undo();

          const fail = explorer.apply(choice, { forceMeasurement: "fail" });
          const fs = fail.success ? this.negamax(fail.explorer, searchDepth, alpha, beta, false, ply + 1) : this.staticEval(fail.explorer);
          if (hasUndo && fail.explorer === explorer) (explorer as any).undo();

          score = p * ps + (1 - p) * fs;
        } else {
          const result = explorer.apply(choice);
          score = result.success
            ? this.negamax(result.explorer, searchDepth, alpha, beta, true, ply + 1)
            : 99999;
          if (hasUndo && result.explorer === explorer) (explorer as any).undo();

          if (useReduction && score < beta && result.success) {
            const result2 = explorer.apply(choice);
            score = result2.success
              ? this.negamax(result2.explorer, depth - 1, alpha, beta, true, ply + 1)
              : 99999;
            if (hasUndo && result2.explorer === explorer) (explorer as any).undo();
          }
        }

        if (score < best) { best = score; ttBestMove = this.choiceKey(choice); }
        beta = Math.min(beta, score);
        if (alpha >= beta) {
          if (!willMeasure && depth < this.killerMoves.length) {
            const key = this.choiceKey(choice);
            const killers = this.killerMoves[depth];
            if (killers[0] !== key) { killers[1] = killers[0]; killers[0] = key; }
          }
          if (isClassicalPos) this.tt.store(ttHash, depth, best, TTFlag.UPPER_BOUND, ttBestMove);
          break;
        }
      }
      if (isClassicalPos) {
        const flag = best >= beta ? TTFlag.LOWER_BOUND : TTFlag.EXACT;
        this.tt.store(ttHash, depth, best, flag, ttBestMove);
      }
      return best;
    }
  }

  // ---------------------------------------------------------------------------
  // Quiescence search
  // ---------------------------------------------------------------------------

  /**
   * Search only captures until the position is quiet (no more captures) or
   * maxQDepth is reached. Prevents the horizon effect where the engine stops
   * searching right before a piece is captured. Uses stand-pat: if the static
   * eval is already good enough, we can choose not to capture (standing pat).
   */
  private quiesce(
    explorer: QCExplorer,
    alpha: number,
    beta: number,
    maximizing: boolean,
    maxQDepth: number
  ): number {
    this.nodesSearched++;

    const standPat = this.staticEval(explorer);

    if (maxQDepth <= 0 || this.isTimeUp()) return standPat;

    // Stand-pat cutoff
    if (maximizing) {
      if (standPat >= beta) return standPat;
      if (standPat > alpha) alpha = standPat;
    } else {
      if (standPat <= alpha) return standPat;
      if (standPat < beta) beta = standPat;
    }

    // Get captures only (variant === 3 means capture)
    const moves = explorer.view.legalMoves;
    const captures: Array<{ choice: QCMoveChoice; willMeasure: boolean; victimVal: number }> = [];
    for (const m of moves.standard) {
      if (m.variant !== 3) continue;
      const victim = explorer.view.gameData.board.pieces[m.to];
      const victimVal = ABS_PIECE_VAL[victim] ?? 0;
      captures.push({
        choice: { type: "standard", from: m.from, to: m.to },
        willMeasure: m.willMeasure ?? false,
        victimVal,
      });
    }

    // Sort by MVV (most valuable victim first)
    captures.sort((a, b) => b.victimVal - a.victimVal);

    const hasUndo = typeof (explorer as any).undo === "function";

    if (maximizing) {
      for (const { choice, willMeasure } of captures) {
        if (this.isTimeUp()) break;
        let score: number;
        if (willMeasure) {
          const pass = explorer.apply(choice, { forceMeasurement: "pass" });
          const p = pass.measurementPassProbability ?? 0.5;
          const ps = pass.success ? this.quiesce(pass.explorer, alpha, beta, true, maxQDepth - 1) : standPat;
          if (hasUndo && pass.explorer === explorer) (explorer as any).undo();

          const fail = explorer.apply(choice, { forceMeasurement: "fail" });
          const fs = fail.success ? this.quiesce(fail.explorer, alpha, beta, true, maxQDepth - 1) : standPat;
          if (hasUndo && fail.explorer === explorer) (explorer as any).undo();

          score = p * ps + (1 - p) * fs;
        } else {
          const result = explorer.apply(choice);
          score = result.success ? this.quiesce(result.explorer, alpha, beta, false, maxQDepth - 1) : standPat;
          if (hasUndo && result.explorer === explorer) (explorer as any).undo();
        }
        if (score > alpha) alpha = score;
        if (alpha >= beta) break;
      }
      return alpha;
    } else {
      for (const { choice, willMeasure } of captures) {
        if (this.isTimeUp()) break;
        let score: number;
        if (willMeasure) {
          const pass = explorer.apply(choice, { forceMeasurement: "pass" });
          const p = pass.measurementPassProbability ?? 0.5;
          const ps = pass.success ? this.quiesce(pass.explorer, alpha, beta, false, maxQDepth - 1) : standPat;
          if (hasUndo && pass.explorer === explorer) (explorer as any).undo();

          const fail = explorer.apply(choice, { forceMeasurement: "fail" });
          const fs = fail.success ? this.quiesce(fail.explorer, alpha, beta, false, maxQDepth - 1) : standPat;
          if (hasUndo && fail.explorer === explorer) (explorer as any).undo();

          score = p * ps + (1 - p) * fs;
        } else {
          const result = explorer.apply(choice);
          score = result.success ? this.quiesce(result.explorer, alpha, beta, true, maxQDepth - 1) : standPat;
          if (hasUndo && result.explorer === explorer) (explorer as any).undo();
        }
        if (score < beta) beta = score;
        if (alpha >= beta) break;
      }
      return beta;
    }
  }

  // ---------------------------------------------------------------------------
  // Evaluation
  // ---------------------------------------------------------------------------

  /**
   * Static evaluation of a position. Returns centipawns from white's perspective.
   * Probability-weighted: a queen at 50% is worth ~450cp, not 900cp.
   */
  private staticEval(explorer: QCExplorer): number {
    const { gameData } = explorer.view;
    const eval_ = explorer.evaluate();

    // Check for terminal positions
    if (eval_.isCheckmate) return eval_.score > 0 ? 99999 : -99999;
    if (eval_.isStalemate) return 0;

    let score = 0;
    let whiteBishops = 0;
    let blackBishops = 0;

    // Track pawns per file for structure analysis
    const whitePawnFiles = new Uint8Array(8);
    const blackPawnFiles = new Uint8Array(8);

    for (let sq = 0; sq < 64; sq++) {
      const piece = gameData.board.pieces[sq];
      const prob = gameData.board.probabilities[sq];
      if (piece === "." || prob <= 1e-6) continue;

      const isWhite = piece === piece.toUpperCase();
      const sign = isWhite ? 1 : -1;
      const pieceType = piece.toLowerCase();

      // Material (probability-weighted)
      score += (PIECE_VAL[piece] ?? 0) * prob;

      // Piece-square table bonus
      const table = PST[pieceType];
      if (table) {
        const pstIdx = isWhite ? sq : (63 - sq);
        score += sign * table[pstIdx] * prob;
      }

      // Track bishops for bishop pair bonus
      if (pieceType === "b") {
        if (isWhite) whiteBishops += prob;
        else blackBishops += prob;
      }

      // Track pawns for structure
      if (pieceType === "p") {
        const file = fileOf(sq);
        if (isWhite) whitePawnFiles[file] += prob;
        else blackPawnFiles[file] += prob;
      }
    }

    // Bishop pair bonus (having two bishops is worth ~30cp)
    if (whiteBishops >= 1.5) score += 30;
    if (blackBishops >= 1.5) score -= 30;

    // Pawn structure penalties
    for (let f = 0; f < 8; f++) {
      // Doubled pawns: penalty for having > 1 pawn on same file
      if (whitePawnFiles[f] > 1) score -= 15 * (whitePawnFiles[f] - 1);
      if (blackPawnFiles[f] > 1) score += 15 * (blackPawnFiles[f] - 1);

      // Isolated pawns: no friendly pawn on adjacent files
      const wLeft = f > 0 ? whitePawnFiles[f - 1] : 0;
      const wRight = f < 7 ? whitePawnFiles[f + 1] : 0;
      if (whitePawnFiles[f] > 0 && wLeft === 0 && wRight === 0) {
        score -= 10 * whitePawnFiles[f];
      }
      const bLeft = f > 0 ? blackPawnFiles[f - 1] : 0;
      const bRight = f < 7 ? blackPawnFiles[f + 1] : 0;
      if (blackPawnFiles[f] > 0 && bLeft === 0 && bRight === 0) {
        score += 10 * blackPawnFiles[f];
      }
    }

    // Mobility bonus: more legal moves = better position
    const moves = explorer.view.legalMoves;
    const sideToMove = gameData.board.ply % 2 === 0 ? 1 : -1;
    score += sideToMove * moves.count * 3;

    return score;
  }

  // ---------------------------------------------------------------------------
  // Move ordering
  // ---------------------------------------------------------------------------

  /** Key for identifying a move choice (for killer moves, best-move tracking). */
  /** Integer key for fast killer move matching. Encodes move type + squares into a single number. */
  private choiceKey(choice: QCMoveChoice): number {
    if (choice.type === "standard") return choice.from | (choice.to << 6);
    if (choice.type === "split") return 4096 + choice.from | (choice.targetA << 6) | (choice.targetB << 12);
    return 8192 + (choice.sourceA) | (choice.sourceB << 6) | (choice.to << 12);
  }

  /** Order moves for root search (more info available from view). */
  private orderMoves(
    legalMoves: QCLegalMoveSet,
    view: QCEngineView,
    depth: number
  ): Array<{ choice: QCMoveChoice; move: { willMeasure?: boolean } | null; priority: number }> {
    const ordered: Array<{ choice: QCMoveChoice; move: { willMeasure?: boolean } | null; priority: number }> = [];

    const killers = depth < this.killerMoves.length ? this.killerMoves[depth] : [-1, -1];

    const probs = view.gameData.board.probabilities;

    // Standard moves
    for (const m of legalMoves.standard) {
      const choice: QCMoveChoice = { type: "standard", from: m.from, to: m.to };
      let priority = 0;
      const srcProb = probs[m.from];

      // Captures: probability-weighted MVV-LVA
      if (m.variant === 3) {
        const victim = view.gameData.board.pieces[m.to];
        const attacker = view.gameData.board.pieces[m.from];
        const victimProb = probs[m.to];
        const victimVal = (ABS_PIECE_VAL[victim] ?? 0) * victimProb;
        const attackerVal = (ABS_PIECE_VAL[attacker] ?? 0) * srcProb;
        priority = 10000 + Math.round(victimVal * 10 - attackerVal);
      }

      // Promotion
      if (m.promotionChoices) {
        priority = Math.max(priority, 9000);
      }

      // Killer move bonus
      const key = this.choiceKey(choice);
      if (key === killers[0]) priority = Math.max(priority, 8000);
      else if (key === killers[1]) priority = Math.max(priority, 7500);

      // Center control bonus
      const toFile = fileOf(m.to);
      const toRank = rankOf(m.to);
      if (toFile >= 2 && toFile <= 5 && toRank >= 2 && toRank <= 5) {
        priority += 50;
        // Extra bonus for central 4 squares
        if (toFile >= 3 && toFile <= 4 && toRank >= 3 && toRank <= 4) {
          priority += 50;
        }
      }

      ordered.push({ choice, move: m, priority });
    }

    // Splits and merges: only at plies within quantumSearchPly (ply 0 = root)
    // classicalOnly disables entirely; quantumSearchPly limits depth
    if (!this.classicalOnly && 0 < this.quantumSearchPly) {
      for (const m of legalMoves.splits) {
        ordered.push({
          choice: { type: "split", from: m.from, targetA: m.targetA, targetB: m.targetB },
          move: null,
          priority: 500
        });
      }
      for (const m of legalMoves.merges) {
        ordered.push({
          choice: { type: "merge", sourceA: m.sourceA, sourceB: m.sourceB, to: m.to },
          move: null,
          priority: 400
        });
      }
    }

    // Sort descending by priority
    ordered.sort((a, b) => b.priority - a.priority);
    return ordered;
  }

  /** Move ordering for internal search nodes with probability weighting. */
  private orderMovesForSearch(
    moves: QCLegalMoveSet,
    view: QCEngineView,
    depth: number,
    ply: number = 0
  ): Array<{ choice: QCMoveChoice; willMeasure: boolean; priority: number }> {
    const result: Array<{ choice: QCMoveChoice; willMeasure: boolean; priority: number }> = [];
    const probs = view.gameData.board.probabilities;

    const killers = depth < this.killerMoves.length ? this.killerMoves[depth] : [-1, -1];

    for (const m of moves.standard) {
      const choice: QCMoveChoice = { type: "standard", from: m.from, to: m.to };
      let priority = 0;
      const srcProb = probs[m.from];

      if (m.variant === 3) {
        // Captures: MVV-LVA weighted by probability of both attacker and victim
        const victim = view.gameData.board.pieces[m.to];
        const attacker = view.gameData.board.pieces[m.from];
        const victimProb = probs[m.to];
        const victimVal = (ABS_PIECE_VAL[victim] ?? 0) * victimProb;
        const attackerVal = (ABS_PIECE_VAL[attacker] ?? 0) * srcProb;
        priority = 10000 + Math.round(victimVal * 10 - attackerVal);
      }

      if (m.promotionChoices) priority = Math.max(priority, 9000);

      const key = this.choiceKey(choice);
      if (key === killers[0]) priority = Math.max(priority, 8000);
      else if (key === killers[1]) priority = Math.max(priority, 7500);

      // Quiet moves: order by piece probability (classical 100% first,
      // superposed 50% later). Better pruning since classical pieces
      // produce more decisive positions.
      if (priority <= 0) {
        priority = Math.round(srcProb * 100);
      }

      result.push({ choice, willMeasure: m.willMeasure, priority });
    }

    // Include splits and merges only at ply < quantumSearchPly
    if (!this.classicalOnly && ply < this.quantumSearchPly) {
      for (const m of moves.splits) {
        const srcProb = probs[m.from];
        result.push({
          choice: { type: "split", from: m.from, targetA: m.targetA, targetB: m.targetB },
          willMeasure: false,
          priority: Math.round(500 * srcProb)
        });
      }
      for (const m of moves.merges) {
        result.push({
          choice: { type: "merge", sourceA: m.sourceA, sourceB: m.sourceB, to: m.to },
          willMeasure: false,
          priority: 400
        });
      }
    }

    result.sort((a, b) => b.priority - a.priority);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Check if all probabilities are 0 or 1 (no quantum superposition). */
  private isClassicalPosition(probs: readonly number[]): boolean {
    for (let i = 0; i < 64; i++) {
      const p = probs[i];
      if (p > 0.001 && p < 0.999) return false;
    }
    return true;
  }

  private isTimeUp(): boolean {
    // Check every 64 nodes to avoid Date.now() overhead
    if (this.nodesSearched % 64 !== 0) return false;
    return Date.now() >= this.searchDeadline;
  }

  private fallbackMove(view: QCEngineView): QCMoveChoice {
    // Pick best capture, or random move
    const captures = view.legalMoves.standard.filter(m => m.variant === 3);
    if (captures.length > 0) {
      const best = captures.reduce((a, b) => {
        const aVal = ABS_PIECE_VAL[view.gameData.board.pieces[a.to]] ?? 0;
        const bVal = ABS_PIECE_VAL[view.gameData.board.pieces[b.to]] ?? 0;
        return bVal > aVal ? b : a;
      });
      return { type: "standard", from: best.from, to: best.to };
    }

    const all: QCMoveChoice[] = [
      ...view.legalMoves.standard.map((m): QCMoveChoice => ({ type: "standard", from: m.from, to: m.to })),
      ...(this.classicalOnly ? [] : view.legalMoves.splits.map((m): QCMoveChoice => ({ type: "split", from: m.from, targetA: m.targetA, targetB: m.targetB }))),
      ...(this.classicalOnly ? [] : view.legalMoves.merges.map((m): QCMoveChoice => ({ type: "merge", sourceA: m.sourceA, sourceB: m.sourceB, to: m.to })))
    ];
    return all[Math.floor(Math.random() * all.length)];
  }
}
