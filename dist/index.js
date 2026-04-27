import {
  QCEngine,
  StackExplorer,
  buildLegalMoveSet,
  createStackExplorer,
  validatePlayerShape
} from "./chunk-XCCDOHCS.js";
import {
  BOARD_SQUARES,
  CLASSICAL_START_FEN,
  FIFTY_MOVE_PLY_LIMIT,
  MoveCode,
  MoveType,
  MoveVariant,
  PARITY_MATRIX,
  PROBABILITY_EPSILON,
  QuantumChessQuantumAdapter,
  applyClassicalShadowMove,
  applyStandardMove,
  assertValidGameModeConfig,
  buildOperationPlan,
  buildPgn,
  buildStandardMoveFromSquares,
  classicalBoardToFen,
  clearCastlingRightsForSquare,
  clearCastlingRightsFromMove,
  clearSandboxBoard,
  cloneGameData,
  computeMergeTargets,
  createClassicalStartGameData,
  createEmptyGameData,
  createGameModeConfig,
  createIsolatedPort,
  createQuantumForgePort,
  createQuantumVisualSnapshot,
  detectKingCapture,
  exportPgn,
  fenToGameData,
  formatMoveString,
  gameDataToPositionString,
  getFile,
  getGameModePreset,
  getLegalTargets,
  getMergeTargets,
  getPieceColor,
  getRank,
  getSplitTargets,
  indexToSquareName,
  isBlackPiece,
  isCurrentTurnPiece,
  isEnemyPiece,
  isFiftyMoveDraw,
  isLegalStandardMove,
  isOnBoard,
  isWhitePiece,
  listGameModePresets,
  moveRecordsToPgnEntries,
  parseMoveString,
  parsePgn,
  pgnToMoveStrings,
  pieceForMoveSource,
  placeSandboxPiece,
  promotedOrSourcePiece,
  prunePiecesByProbabilities,
  relocateSandboxPiece,
  remapPieceSymbol,
  selectPiece,
  squareNameToIndex,
  updateFiftyMoveCounter,
  validateGameModeConfig
} from "./chunk-HYPD7VU7.js";
import {
  createPoolingPort
} from "./chunk-GFDDVLHQ.js";

// src/match-runner.ts
var DEFAULT_MAX_PLY = 500;
var QCMatchRunner = class {
  config;
  engine = null;
  startingData = null;
  running = false;
  aborted = false;
  // Time tracking
  whiteMs = 0;
  blackMs = 0;
  turnStartedAt = 0;
  constructor(config) {
    this.config = config;
  }
  /**
   * Run the match to completion. Initializes and runs the game loop.
   */
  async run(quantum, onEvent, adapterFactory) {
    this.initialize(quantum, this.config);
    return this.runLoop(onEvent, adapterFactory);
  }
  /**
   * Initialize the engine and position. Synchronous.
   * Called by MatchBridge before the game loop so the initial board state is
   * available immediately (no await needed for display updates).
   */
  initialize(quantum, config) {
    const engine = new QCEngine(quantum, config.rules);
    this.engine = engine;
    const position = config.startingPosition ?? { startingFen: CLASSICAL_START_FEN, history: [] };
    engine.initializeFromPosition(position);
    this.startingData = fenToGameData(position.startingFen) ?? createClassicalStartGameData();
    if (config.sandbox?.ignoreTurnOrder) {
      engine.setIgnoreTurnOrder(true);
    }
    if (config.sandbox?.forceMeasurement) {
      engine.setForceMeasurement(config.sandbox.forceMeasurement);
    }
    if (config.timeControl) {
      this.whiteMs = config.timeControl.initialSeconds * 1e3;
      this.blackMs = config.timeControl.initialSeconds * 1e3;
    }
  }
  /** Run the game loop after initialize(). */
  async runLoop(onEvent, adapterFactory) {
    const { config } = this;
    const engine = this.engine;
    const startingData = this.startingData;
    this.running = true;
    this.aborted = false;
    const white = config.white;
    const black = config.black;
    if (white.initialize) await white.initialize();
    if (black.initialize) await black.initialize();
    const maxPly = config.maxPly ?? DEFAULT_MAX_PLY;
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 3;
    const peaks = { maxPropertyCount: 0, maxAncillaCount: 0, minTotalProbability: Infinity, plyAtMaxProperties: 0 };
    const getQuantumHealth = () => {
      try {
        return engine.quantum?.getHealthSnapshot?.();
      } catch {
        return void 0;
      }
    };
    const updatePeaks = (h, ply) => {
      if (!h) return;
      if (h.propertyCount > peaks.maxPropertyCount) {
        peaks.maxPropertyCount = h.propertyCount;
        peaks.plyAtMaxProperties = ply;
      }
      if (h.ancillaCount > peaks.maxAncillaCount) peaks.maxAncillaCount = h.ancillaCount;
      if (h.totalProbability < peaks.minTotalProbability) peaks.minTotalProbability = h.totalProbability;
    };
    while (this.running && !this.aborted) {
      const gameData = engine.getGameData();
      const ply = gameData.board.ply;
      if (ply >= maxPly) {
        return this.endGame("draw", "max_ply", onEvent, void 0, peaks);
      }
      const isWhiteTurn = ply % 2 === 0;
      const activePlayer = isWhiteTurn ? white : black;
      const inactivePlayer = isWhiteTurn ? black : white;
      const color = isWhiteTurn ? "white" : "black";
      const faultColor = color;
      const ignoreTurnOrder = config.sandbox?.ignoreTurnOrder;
      const view = engine.getView(ignoreTurnOrder);
      const playerQuantum = activePlayer.quantumEnabled ?? true;
      if (!playerQuantum) {
        view.legalMoves = {
          standard: view.legalMoves.standard,
          splits: [],
          merges: [],
          count: view.legalMoves.standard.length
        };
        view.quantumEnabled = false;
      }
      if (view.legalMoves.count === 0) {
        return this.endGame("draw", "stalemate", onEvent, void 0, peaks);
      }
      const clock = this.buildClock(isWhiteTurn);
      this.turnStartedAt = Date.now();
      let explorer = null;
      if (activePlayer.control === "ai" && adapterFactory) {
        explorer = createStackExplorer(engine, startingData, adapterFactory);
      }
      let choice;
      try {
        const rawChoice = await activePlayer.chooseMove(view, explorer, clock);
        if (!rawChoice) {
          const winner = isWhiteTurn ? "black" : "white";
          return this.endGame(winner, "player_exception", onEvent, {
            faultPlayer: faultColor,
            failureClass: "player_exception",
            errorMessage: `${activePlayer.name} returned null/undefined from chooseMove (forfeit)`
          }, peaks);
        }
        choice = rawChoice;
      } catch (err) {
        const msg = err?.message ?? String(err);
        const isOOM = msg.includes("OutOfMemory") || msg.includes("out of memory") || msg.includes("memory access out of bounds") || err instanceof RangeError;
        const reason = isOOM ? "oom" : "player_exception";
        const failureClass = isOOM ? "search_oom" : "player_exception";
        console.error(`[QCMatchRunner] Player "${activePlayer.name}" threw during chooseMove (${failureClass}):`, msg);
        onEvent?.({ type: "error", ply, message: `${activePlayer.name}: ${msg}` });
        const winner = isWhiteTurn ? "black" : "white";
        return this.endGame(winner, reason, onEvent, {
          faultPlayer: faultColor,
          failureClass,
          errorMessage: msg,
          errorStack: err?.stack?.split("\n").slice(0, 8).join("\n"),
          quantumState: getQuantumHealth()
        }, peaks);
      } finally {
        if (explorer && typeof explorer.dispose === "function") {
          explorer.dispose();
        }
      }
      if (this.aborted) {
        return this.endGame("draw", "abort", onEvent, void 0, peaks);
      }
      if (config.timeControl) {
        const elapsed = Date.now() - this.turnStartedAt;
        if (isWhiteTurn) {
          this.whiteMs -= elapsed;
          if (this.whiteMs <= 0) {
            return this.endGame("black", "timeout", onEvent, void 0, peaks);
          }
          this.whiteMs += config.timeControl.incrementSeconds * 1e3;
          this.whiteMs = Math.min(this.whiteMs, config.timeControl.maxSeconds * 1e3);
        } else {
          this.blackMs -= elapsed;
          if (this.blackMs <= 0) {
            return this.endGame("white", "timeout", onEvent, void 0, peaks);
          }
          this.blackMs += config.timeControl.incrementSeconds * 1e3;
          this.blackMs = Math.min(this.blackMs, config.timeControl.maxSeconds * 1e3);
        }
        onEvent?.({
          type: "clock",
          whiteMs: this.whiteMs,
          blackMs: this.blackMs
        });
      }
      if (!isLegalChoice(choice, view.legalMoves)) {
        console.error(`[QCMatchRunner] Player "${activePlayer.name}" chose illegal move at ply ${ply}:`, JSON.stringify(choice));
        onEvent?.({ type: "error", ply, message: `${activePlayer.name} chose illegal move: ${JSON.stringify(choice)}` });
        const winner = isWhiteTurn ? "black" : "white";
        return this.endGame(winner, "illegal_move", onEvent, {
          faultPlayer: faultColor,
          failureClass: "quantum_divergence",
          attemptedMove: JSON.stringify(choice),
          quantumState: getQuantumHealth()
        }, peaks);
      }
      if (choice._forceMeasurement) {
        engine.setForceMeasurement(choice._forceMeasurement);
      }
      let result;
      try {
        result = engine.executeMove(choice);
        consecutiveErrors = 0;
      } catch (err) {
        consecutiveErrors++;
        const msg = err?.message ?? String(err);
        const isOOM = msg.includes("OutOfMemory") || msg.includes("out of memory") || msg.includes("memory access out of bounds") || err instanceof RangeError;
        console.error(`[QCMatchRunner] executeMove threw for ${activePlayer.name} at ply ${ply} (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}${isOOM ? ", OOM" : ""}):`, msg);
        onEvent?.({ type: "error", ply, message: `Move execution error: ${msg}` });
        if (choice._forceMeasurement) {
          engine.setForceMeasurement("random");
        }
        if (isOOM || consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          const reason = isOOM ? "oom" : "abort";
          return this.endGame("draw", reason, onEvent, {
            faultPlayer: faultColor,
            failureClass: isOOM ? "execution_oom" : "player_exception",
            errorMessage: msg,
            errorStack: err?.stack?.split("\n").slice(0, 8).join("\n"),
            attemptedMove: JSON.stringify(choice),
            quantumState: getQuantumHealth(),
            consecutiveErrors
          }, peaks);
        }
        continue;
      }
      if (choice._forceMeasurement) {
        engine.setForceMeasurement("random");
      }
      if (!result.success) {
        if (result.error) {
          onEvent?.({ type: "error", ply, message: result.error });
          continue;
        }
        console.error(`[QCMatchRunner] Move execution failed for ${activePlayer.name}:`, choice, result.moveRecord);
        const winner = isWhiteTurn ? "black" : "white";
        return this.endGame(winner, "illegal_move", onEvent, {
          faultPlayer: faultColor,
          failureClass: "execution_failure",
          attemptedMove: JSON.stringify(choice),
          quantumState: getQuantumHealth()
        }, peaks);
      }
      if (config.serverAuthority && activePlayer.control !== "human_remote") {
        const override = await config.serverAuthority.onMoveExecuted(
          result.moveRecord.moveString,
          ply,
          result
        );
        if (override && override.forceMeasurement) {
        }
      }
      const health = getQuantumHealth();
      updatePeaks(health, ply);
      await onEvent?.({
        type: "move",
        ply,
        color,
        moveRecord: result.moveRecord,
        gameData: result.gameData,
        legalMoveCount: {
          standard: view.legalMoves.standard.length,
          splits: view.legalMoves.splits.length,
          merges: view.legalMoves.merges.length,
          total: view.legalMoves.count
        },
        quantumHealth: health
      });
      inactivePlayer.onOpponentMove?.(result.moveRecord, engine.getView());
      await new Promise((r) => setTimeout(r, config.moveDelayMs ?? 0));
      const checkWin = !config.sandbox || config.sandbox.respectWinCondition;
      if (checkWin) {
        const winResult = engine.checkWinCondition();
        if (winResult) {
          const winner = winResult === "white_win" ? "white" : "black";
          return this.endGame(winner, "checkmate", onEvent, void 0, peaks);
        }
        if (engine.checkFiftyMoveRule()) {
          return this.endGame("draw", "fifty_move", onEvent, void 0, peaks);
        }
      }
    }
    return this.endGame("draw", "abort", onEvent, void 0, peaks);
  }
  /** Abort a running match. */
  abort() {
    this.aborted = true;
    this.running = false;
  }
  /** Get the current engine view (for spectating). */
  getCurrentView() {
    return this.engine?.getView() ?? null;
  }
  /** Get the current engine (for advanced integrations). */
  getEngine() {
    return this.engine;
  }
  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------
  buildClock(isWhiteTurn) {
    if (!this.config.timeControl) return null;
    return {
      remainingMs: isWhiteTurn ? this.whiteMs : this.blackMs,
      incrementMs: this.config.timeControl.incrementSeconds * 1e3,
      opponentRemainingMs: isWhiteTurn ? this.blackMs : this.whiteMs
    };
  }
  endGame(winner, reason, onEvent, diagnostics, peaks) {
    this.running = false;
    const engine = this.engine;
    const result = {
      winner,
      reason,
      totalPly: engine.getGameData().board.ply,
      moveHistory: [...engine.getMoveHistory()],
      ...diagnostics ? { diagnostics } : {},
      ...peaks && peaks.maxPropertyCount > 0 ? { quantumPeaks: peaks } : {}
    };
    this.config.white.onGameOver?.(result);
    this.config.black.onGameOver?.(result);
    onEvent?.({ type: "game_over", result });
    return result;
  }
};
function isLegalChoice(choice, legalMoves) {
  switch (choice.type) {
    case "standard":
      return legalMoves.standard.some(
        (m) => m.from === choice.from && m.to === choice.to
      );
    case "split":
      return legalMoves.splits.some(
        (m) => m.from === choice.from && (m.targetA === choice.targetA && m.targetB === choice.targetB || m.targetA === choice.targetB && m.targetB === choice.targetA)
      );
    case "merge":
      return legalMoves.merges.some(
        (m) => m.to === choice.to && (m.sourceA === choice.sourceA && m.sourceB === choice.sourceB || m.sourceA === choice.sourceB && m.sourceB === choice.sourceA)
      );
  }
}

// src/game-runner.ts
var DEFAULT_RULES = {
  quantumEnabled: true,
  allowSplitMerge: true,
  allowMeasurementAnnotations: true,
  allowCastling: true,
  allowEnPassant: true,
  allowPromotion: true,
  objective: "checkmate"
};
var CLASSICAL_RULES = {
  ...DEFAULT_RULES,
  quantumEnabled: false,
  allowSplitMerge: false
};
async function createGameRunner() {
  const QFW = await import("@quantum-native/quantum-forge-chess");
  await QFW.QuantumForge.initialize();
  const { QuantumChessQuantumAdapter: QuantumChessQuantumAdapter2, createQuantumForgePort: createQuantumForgePort2 } = await import("./quantum-5ZZTKPOI.js");
  const { createPoolingPort: createPoolingPort2 } = await import("./pooling-port-UR4QS7AH.js");
  const basePort = createQuantumForgePort2(QFW);
  const pool = createPoolingPort2(basePort);
  function createAdapter() {
    return new QuantumChessQuantumAdapter2(createPoolingPort2(createQuantumForgePort2(QFW)));
  }
  return {
    async playMatch(white, black, options = {}) {
      const rules = options.classicalOnly ? { ...CLASSICAL_RULES, ...options.rules } : { ...DEFAULT_RULES, ...options.rules };
      const config = {
        white,
        black,
        rules,
        maxPly: options.maxPly,
        moveDelayMs: options.moveDelayMs,
        timeControl: options.timeControl,
        startingPosition: options.startingFen || options.history ? {
          startingFen: options.startingFen ?? CLASSICAL_START_FEN,
          history: options.history ?? []
        } : void 0
      };
      pool.resetAll();
      const quantum = new QuantumChessQuantumAdapter2(pool);
      const adapterFactory = () => createAdapter();
      const runner = new QCMatchRunner(config);
      return runner.run(quantum, options.onEvent, adapterFactory);
    },
    dispose() {
    }
  };
}

// src/zobrist.ts
var PIECE_CHARS = "PNBRQKpnbrqk";
var NUM_PIECES = 12;
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = seed + 1831565813 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return (t ^ t >>> 14) >>> 0;
  };
}
var rng = mulberry32(1369822183);
var PIECE_SQUARE_KEYS = [];
for (let p = 0; p < NUM_PIECES; p++) {
  PIECE_SQUARE_KEYS[p] = [];
  for (let sq = 0; sq < 64; sq++) {
    PIECE_SQUARE_KEYS[p][sq] = rng();
  }
}
var SIDE_TO_MOVE_KEY = rng();
var CASTLING_KEYS = [];
for (let i = 0; i < 16; i++) CASTLING_KEYS[i] = rng();
var EP_FILE_KEYS = [];
for (let f = 0; f < 8; f++) EP_FILE_KEYS[f] = rng();
function pieceIndex(piece) {
  const idx = PIECE_CHARS.indexOf(piece);
  return idx;
}
function zobristHash(pieces, probabilities, ply, castleFlags, enPassantSquare) {
  let hash = 0;
  for (let sq = 0; sq < 64; sq++) {
    const p = pieces[sq];
    if (p === ".") continue;
    if (probabilities[sq] < 1e-3) continue;
    const idx = pieceIndex(p);
    if (idx >= 0) hash ^= PIECE_SQUARE_KEYS[idx][sq];
  }
  if (ply % 2 === 1) hash ^= SIDE_TO_MOVE_KEY;
  hash ^= CASTLING_KEYS[castleFlags & 15];
  if (enPassantSquare >= 0 && enPassantSquare < 64) {
    hash ^= EP_FILE_KEYS[enPassantSquare & 7];
  }
  return hash >>> 0;
}

// src/adapters/pure-sdk-ai.ts
var TT_SIZE = 1 << 20;
var TT_MASK = TT_SIZE - 1;
var TranspositionTable = class {
  table = new Array(TT_SIZE).fill(null);
  probe(hash, depth, alpha, beta) {
    const entry = this.table[hash & TT_MASK];
    if (!entry || entry.hash !== hash) return { score: 0, hit: false, bestMove: -1 };
    if (entry.depth < depth) return { score: 0, hit: false, bestMove: entry.bestMove };
    if (entry.flag === 0 /* EXACT */) return { score: entry.score, hit: true, bestMove: entry.bestMove };
    if (entry.flag === 1 /* LOWER_BOUND */ && entry.score >= beta) return { score: entry.score, hit: true, bestMove: entry.bestMove };
    if (entry.flag === 2 /* UPPER_BOUND */ && entry.score <= alpha) return { score: entry.score, hit: true, bestMove: entry.bestMove };
    return { score: 0, hit: false, bestMove: entry.bestMove };
  }
  store(hash, depth, score, flag, bestMove) {
    const idx = hash & TT_MASK;
    const existing = this.table[idx];
    if (!existing || existing.hash === hash || existing.depth <= depth) {
      this.table[idx] = { hash, depth, score, flag, bestMove };
    }
  }
  clear() {
    this.table.fill(null);
  }
};
var PIECE_VAL = {
  P: 100,
  N: 320,
  B: 330,
  R: 500,
  Q: 900,
  K: 2e4,
  p: -100,
  n: -320,
  b: -330,
  r: -500,
  q: -900,
  k: -2e4
};
var ABS_PIECE_VAL = {
  P: 100,
  N: 320,
  B: 330,
  R: 500,
  Q: 900,
  K: 2e4,
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 2e4
};
var PAWN_TABLE = [
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  5,
  10,
  10,
  -20,
  -20,
  10,
  10,
  5,
  5,
  -5,
  -10,
  0,
  0,
  -10,
  -5,
  5,
  0,
  0,
  0,
  20,
  20,
  0,
  0,
  0,
  5,
  5,
  10,
  25,
  25,
  10,
  5,
  5,
  10,
  10,
  20,
  30,
  30,
  20,
  10,
  10,
  50,
  50,
  50,
  50,
  50,
  50,
  50,
  50,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0
];
var KNIGHT_TABLE = [
  -50,
  -40,
  -30,
  -30,
  -30,
  -30,
  -40,
  -50,
  -40,
  -20,
  0,
  5,
  5,
  0,
  -20,
  -40,
  -30,
  5,
  10,
  15,
  15,
  10,
  5,
  -30,
  -30,
  0,
  15,
  20,
  20,
  15,
  0,
  -30,
  -30,
  5,
  15,
  20,
  20,
  15,
  5,
  -30,
  -30,
  0,
  10,
  15,
  15,
  10,
  0,
  -30,
  -40,
  -20,
  0,
  0,
  0,
  0,
  -20,
  -40,
  -50,
  -40,
  -30,
  -30,
  -30,
  -30,
  -40,
  -50
];
var BISHOP_TABLE = [
  -20,
  -10,
  -10,
  -10,
  -10,
  -10,
  -10,
  -20,
  -10,
  5,
  0,
  0,
  0,
  0,
  5,
  -10,
  -10,
  10,
  10,
  10,
  10,
  10,
  10,
  -10,
  -10,
  0,
  10,
  10,
  10,
  10,
  0,
  -10,
  -10,
  5,
  5,
  10,
  10,
  5,
  5,
  -10,
  -10,
  0,
  5,
  10,
  10,
  5,
  0,
  -10,
  -10,
  0,
  0,
  0,
  0,
  0,
  0,
  -10,
  -20,
  -10,
  -10,
  -10,
  -10,
  -10,
  -10,
  -20
];
var ROOK_TABLE = [
  0,
  0,
  0,
  5,
  5,
  0,
  0,
  0,
  -5,
  0,
  0,
  0,
  0,
  0,
  0,
  -5,
  -5,
  0,
  0,
  0,
  0,
  0,
  0,
  -5,
  -5,
  0,
  0,
  0,
  0,
  0,
  0,
  -5,
  -5,
  0,
  0,
  0,
  0,
  0,
  0,
  -5,
  -5,
  0,
  0,
  0,
  0,
  0,
  0,
  -5,
  5,
  10,
  10,
  10,
  10,
  10,
  10,
  5,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0
];
var QUEEN_TABLE = [
  -20,
  -10,
  -10,
  -5,
  -5,
  -10,
  -10,
  -20,
  -10,
  0,
  5,
  0,
  0,
  0,
  0,
  -10,
  -10,
  5,
  5,
  5,
  5,
  5,
  0,
  -10,
  0,
  0,
  5,
  5,
  5,
  5,
  0,
  -5,
  -5,
  0,
  5,
  5,
  5,
  5,
  0,
  -5,
  -10,
  0,
  5,
  5,
  5,
  5,
  0,
  -10,
  -10,
  0,
  0,
  0,
  0,
  0,
  0,
  -10,
  -20,
  -10,
  -10,
  -5,
  -5,
  -10,
  -10,
  -20
];
var KING_MG_TABLE = [
  20,
  30,
  10,
  0,
  0,
  10,
  30,
  20,
  20,
  20,
  0,
  0,
  0,
  0,
  20,
  20,
  -10,
  -20,
  -20,
  -20,
  -20,
  -20,
  -20,
  -10,
  -20,
  -30,
  -30,
  -40,
  -40,
  -30,
  -30,
  -20,
  -30,
  -40,
  -40,
  -50,
  -50,
  -40,
  -40,
  -30,
  -30,
  -40,
  -40,
  -50,
  -50,
  -40,
  -40,
  -30,
  -30,
  -40,
  -40,
  -50,
  -50,
  -40,
  -40,
  -30,
  -30,
  -40,
  -40,
  -50,
  -50,
  -40,
  -40,
  -30
];
var PST = {
  p: PAWN_TABLE,
  n: KNIGHT_TABLE,
  b: BISHOP_TABLE,
  r: ROOK_TABLE,
  q: QUEEN_TABLE,
  k: KING_MG_TABLE
};
function fileOf(sq) {
  return sq & 7;
}
function rankOf(sq) {
  return sq >> 3;
}
var PureSDKAdapter = class {
  name;
  control = "ai";
  author = "Quantum Chess";
  description;
  opts;
  tt = new TranspositionTable();
  searchDeadline = 0;
  nodesSearched = 0;
  // Killer moves: indexed by depth, stores up to 2 move keys per depth
  killerMoves = [];
  /** If true, only consider standard moves (no splits/merges). */
  classicalOnly;
  /** How many plies from root include quantum moves (splits/merges).
   *  Beyond this depth, only standard moves are searched. Similar to
   *  aqaqaq's movegen_ply. Default 1 = quantum at root only. */
  quantumSearchPly;
  /** Branching factor and timing stats collected during the last search. */
  lastSearchStats = null;
  // Internal stat accumulators (reset per search)
  _branchingNodes = null;
  _branchingMoves = null;
  constructor(name = "Quantum Engine", options = {}) {
    this.name = name;
    this.classicalOnly = options.classicalOnly ?? false;
    this.quantumSearchPly = options.quantumSearchPly ?? 1;
    const qLabel = this.classicalOnly ? ", classical only" : this.quantumSearchPly < 99 ? `, qPly=${this.quantumSearchPly}` : "";
    this.description = `Pure SDK AI (depth ${options.maxDepth ?? 3}${qLabel})`;
    this.opts = {
      maxDepth: options.maxDepth ?? 3,
      sampleCount: options.sampleCount ?? 8,
      maxTimeMs: options.maxTimeMs ?? 5e3,
      clockFraction: options.clockFraction ?? 0.05
    };
    for (let i = 0; i < 20; i++) this.killerMoves.push([-1, -1]);
  }
  async chooseMove(view, explorer, clock) {
    if (!explorer) {
      return this.fallbackMove(view);
    }
    const timeLimit = clock ? Math.min(clock.remainingMs * this.opts.clockFraction, this.opts.maxTimeMs) : this.opts.maxTimeMs;
    this.searchDeadline = Date.now() + timeLimit;
    this.nodesSearched = 0;
    this._branchingNodes = [0];
    this._branchingMoves = [0];
    for (let i = 0; i < this.killerMoves.length; i++) {
      this.killerMoves[i] = [-1, -1];
    }
    const isWhite = view.sideToMove === "white";
    const { legalMoves } = view;
    const candidates = this.orderMoves(legalMoves, view, 0);
    let bestChoice = candidates[0].choice;
    let bestScore = -Infinity;
    const timePerDepth = [];
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
          const msg = err?.message ?? "";
          if (msg.includes("OutOfMemory") || msg.includes("out of memory") || msg.includes("memory access out of bounds") || err instanceof RangeError) {
            depthAborted = true;
            oomAborted = true;
            break;
          }
          throw err;
        }
      }
      timePerDepth.push(Date.now() - depthStart);
      if (depthAborted) break;
      if (!this.isTimeUp()) {
        bestChoice = iterBestChoice;
        bestScore = iterBestScore;
        completedDepth = depth;
        const bestKey = this.choiceKey(iterBestChoice);
        const idx = candidates.findIndex((c) => this.choiceKey(c.choice) === bestKey);
        if (idx > 0) {
          const [item] = candidates.splice(idx, 1);
          candidates.unshift(item);
        }
      }
    }
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
      oomAborted
    };
    this._branchingNodes = null;
    this._branchingMoves = null;
    return bestChoice;
  }
  onGameOver(_result) {
  }
  dispose() {
  }
  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------
  /**
   * Evaluate a single root move by applying it and searching deeper.
   * Returns score from the active player's perspective (higher = better for us).
   */
  evaluateMove(explorer, choice, move, remainingDepth, isWhiteRoot, alpha, beta) {
    const hasUndo = typeof explorer.undo === "function";
    if (move?.willMeasure) {
      const pass = explorer.apply(choice, { forceMeasurement: "pass" });
      const p = pass.measurementPassProbability ?? 0.5;
      const passScore = pass.success ? this.negamax(pass.explorer, remainingDepth, -Infinity, Infinity, !isWhiteRoot) : this.staticEval(pass.explorer);
      if (hasUndo && pass.explorer === explorer) explorer.undo();
      const fail = explorer.apply(choice, { forceMeasurement: "fail" });
      const failScore = fail.success ? this.negamax(fail.explorer, remainingDepth, -Infinity, Infinity, !isWhiteRoot) : this.staticEval(fail.explorer);
      if (hasUndo && fail.explorer === explorer) explorer.undo();
      const expected = p * passScore + (1 - p) * failScore;
      return isWhiteRoot ? expected : -expected;
    }
    const result = explorer.apply(choice);
    if (!result.success) return -99999;
    const score = this.negamax(result.explorer, remainingDepth, alpha, beta, !isWhiteRoot);
    if (hasUndo && result.explorer === explorer) explorer.undo();
    return isWhiteRoot ? score : -score;
  }
  /**
   * Negamax with alpha-beta pruning.
   * Returns score from white's perspective.
   * `ply` is distance from root (0 = root's children, 1 = grandchildren, etc.)
   */
  negamax(explorer, depth, alpha, beta, maximizing, ply = 1) {
    this.nodesSearched++;
    if (this._branchingNodes) {
      while (this._branchingNodes.length <= ply) {
        this._branchingNodes.push(0);
        this._branchingMoves.push(0);
      }
      this._branchingNodes[ply]++;
    }
    if (depth <= 0 || this.isTimeUp()) {
      return this.quiesce(explorer, alpha, beta, maximizing, 2);
    }
    const board = explorer.view.gameData.board;
    const isClassicalPos = this.isClassicalPosition(board.probabilities);
    let ttHash = 0;
    let ttBestMove = -1;
    if (isClassicalPos) {
      ttHash = zobristHash(board.pieces, board.probabilities, board.ply, board.castleFlags, board.enPassantSquare);
      const ttResult = this.tt.probe(ttHash, depth, alpha, beta);
      if (ttResult.hit) return ttResult.score;
      ttBestMove = ttResult.bestMove;
    }
    const moves = explorer.view.legalMoves;
    if (moves.count === 0) {
      return this.staticEval(explorer);
    }
    const staticScore = this.staticEval(explorer);
    if (depth >= 4 && ply >= 1 && moves.count > 5) {
      const evalAboveBeta = maximizing ? staticScore >= beta : staticScore <= alpha;
      if (evalAboveBeta) {
        const R = depth > 6 ? 4 : 3;
        const nullScore = this.negamax(explorer, depth - 1 - R, alpha, beta, !maximizing, ply + 1);
        if (maximizing && nullScore >= beta) {
          if (isClassicalPos) this.tt.store(ttHash, depth, beta, 1 /* LOWER_BOUND */, -1);
          return beta;
        }
        if (!maximizing && nullScore <= alpha) {
          if (isClassicalPos) this.tt.store(ttHash, depth, alpha, 2 /* UPPER_BOUND */, -1);
          return alpha;
        }
      }
    }
    let futilityPrune = false;
    const FUTILITY_MARGINS = [0, 200, 500];
    if (depth <= 2) {
      const margin = FUTILITY_MARGINS[depth] ?? 0;
      if (maximizing && staticScore + margin < alpha) futilityPrune = true;
      if (!maximizing && staticScore - margin > beta) futilityPrune = true;
    }
    const candidates = this.orderMovesForSearch(moves, explorer.view, depth, ply);
    if (candidates.length === 0) {
      return this.staticEval(explorer);
    }
    if (ttBestMove >= 0) {
      const ttIdx = candidates.findIndex((c) => this.choiceKey(c.choice) === ttBestMove);
      if (ttIdx > 0) {
        const [item] = candidates.splice(ttIdx, 1);
        candidates.unshift(item);
      }
    }
    if (this._branchingMoves) {
      this._branchingMoves[ply] += candidates.length;
    }
    const hasUndo = typeof explorer.undo === "function";
    if (maximizing) {
      let best = -Infinity;
      for (let mi = 0; mi < candidates.length; mi++) {
        const { choice, willMeasure, priority } = candidates[mi];
        if (this.isTimeUp()) break;
        const isQuiet = priority <= 100;
        const isCapture = priority >= 1e4;
        if (futilityPrune && isQuiet && !willMeasure) continue;
        const useReduction = isQuiet && mi > 1 && depth >= 2 && !willMeasure;
        const reduction = useReduction ? depth >= 4 ? 2 : 1 : 0;
        const searchDepth = depth - 1 - reduction;
        let score;
        if (willMeasure) {
          const pass = explorer.apply(choice, { forceMeasurement: "pass" });
          const p = pass.measurementPassProbability ?? 0.5;
          const ps = pass.success ? this.negamax(pass.explorer, searchDepth, alpha, beta, true, ply + 1) : this.staticEval(pass.explorer);
          if (hasUndo && pass.explorer === explorer) explorer.undo();
          const fail = explorer.apply(choice, { forceMeasurement: "fail" });
          const fs = fail.success ? this.negamax(fail.explorer, searchDepth, alpha, beta, true, ply + 1) : this.staticEval(fail.explorer);
          if (hasUndo && fail.explorer === explorer) explorer.undo();
          score = p * ps + (1 - p) * fs;
        } else {
          const result = explorer.apply(choice);
          score = result.success ? this.negamax(result.explorer, searchDepth, alpha, beta, false, ply + 1) : -99999;
          if (hasUndo && result.explorer === explorer) explorer.undo();
          if (useReduction && score > alpha && result.success) {
            const result2 = explorer.apply(choice);
            score = result2.success ? this.negamax(result2.explorer, depth - 1, alpha, beta, false, ply + 1) : -99999;
            if (hasUndo && result2.explorer === explorer) explorer.undo();
          }
        }
        if (score > best) {
          best = score;
          ttBestMove = this.choiceKey(choice);
        }
        alpha = Math.max(alpha, score);
        if (alpha >= beta) {
          if (!willMeasure && depth < this.killerMoves.length) {
            const key = this.choiceKey(choice);
            const killers = this.killerMoves[depth];
            if (killers[0] !== key) {
              killers[1] = killers[0];
              killers[0] = key;
            }
          }
          if (isClassicalPos) this.tt.store(ttHash, depth, best, 1 /* LOWER_BOUND */, ttBestMove);
          break;
        }
      }
      if (isClassicalPos) {
        const flag = best <= alpha ? 2 /* UPPER_BOUND */ : 0 /* EXACT */;
        this.tt.store(ttHash, depth, best, flag, ttBestMove);
      }
      return best;
    } else {
      let best = Infinity;
      for (let mi = 0; mi < candidates.length; mi++) {
        const { choice, willMeasure, priority } = candidates[mi];
        if (this.isTimeUp()) break;
        const isQuiet = priority <= 100;
        if (futilityPrune && isQuiet && !willMeasure) continue;
        const useReduction = isQuiet && mi > 1 && depth >= 2 && !willMeasure;
        const reduction = useReduction ? depth >= 4 ? 2 : 1 : 0;
        const searchDepth = depth - 1 - reduction;
        let score;
        if (willMeasure) {
          const pass = explorer.apply(choice, { forceMeasurement: "pass" });
          const p = pass.measurementPassProbability ?? 0.5;
          const ps = pass.success ? this.negamax(pass.explorer, searchDepth, alpha, beta, false, ply + 1) : this.staticEval(pass.explorer);
          if (hasUndo && pass.explorer === explorer) explorer.undo();
          const fail = explorer.apply(choice, { forceMeasurement: "fail" });
          const fs = fail.success ? this.negamax(fail.explorer, searchDepth, alpha, beta, false, ply + 1) : this.staticEval(fail.explorer);
          if (hasUndo && fail.explorer === explorer) explorer.undo();
          score = p * ps + (1 - p) * fs;
        } else {
          const result = explorer.apply(choice);
          score = result.success ? this.negamax(result.explorer, searchDepth, alpha, beta, true, ply + 1) : 99999;
          if (hasUndo && result.explorer === explorer) explorer.undo();
          if (useReduction && score < beta && result.success) {
            const result2 = explorer.apply(choice);
            score = result2.success ? this.negamax(result2.explorer, depth - 1, alpha, beta, true, ply + 1) : 99999;
            if (hasUndo && result2.explorer === explorer) explorer.undo();
          }
        }
        if (score < best) {
          best = score;
          ttBestMove = this.choiceKey(choice);
        }
        beta = Math.min(beta, score);
        if (alpha >= beta) {
          if (!willMeasure && depth < this.killerMoves.length) {
            const key = this.choiceKey(choice);
            const killers = this.killerMoves[depth];
            if (killers[0] !== key) {
              killers[1] = killers[0];
              killers[0] = key;
            }
          }
          if (isClassicalPos) this.tt.store(ttHash, depth, best, 2 /* UPPER_BOUND */, ttBestMove);
          break;
        }
      }
      if (isClassicalPos) {
        const flag = best >= beta ? 1 /* LOWER_BOUND */ : 0 /* EXACT */;
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
  quiesce(explorer, alpha, beta, maximizing, maxQDepth) {
    this.nodesSearched++;
    const standPat = this.staticEval(explorer);
    if (maxQDepth <= 0 || this.isTimeUp()) return standPat;
    if (maximizing) {
      if (standPat >= beta) return standPat;
      if (standPat > alpha) alpha = standPat;
    } else {
      if (standPat <= alpha) return standPat;
      if (standPat < beta) beta = standPat;
    }
    const moves = explorer.view.legalMoves;
    const captures = [];
    for (const m of moves.standard) {
      if (m.variant !== 3) continue;
      const victim = explorer.view.gameData.board.pieces[m.to];
      const victimVal = ABS_PIECE_VAL[victim] ?? 0;
      captures.push({
        choice: { type: "standard", from: m.from, to: m.to },
        willMeasure: m.willMeasure ?? false,
        victimVal
      });
    }
    captures.sort((a, b) => b.victimVal - a.victimVal);
    const hasUndo = typeof explorer.undo === "function";
    if (maximizing) {
      for (const { choice, willMeasure } of captures) {
        if (this.isTimeUp()) break;
        let score;
        if (willMeasure) {
          const pass = explorer.apply(choice, { forceMeasurement: "pass" });
          const p = pass.measurementPassProbability ?? 0.5;
          const ps = pass.success ? this.quiesce(pass.explorer, alpha, beta, true, maxQDepth - 1) : standPat;
          if (hasUndo && pass.explorer === explorer) explorer.undo();
          const fail = explorer.apply(choice, { forceMeasurement: "fail" });
          const fs = fail.success ? this.quiesce(fail.explorer, alpha, beta, true, maxQDepth - 1) : standPat;
          if (hasUndo && fail.explorer === explorer) explorer.undo();
          score = p * ps + (1 - p) * fs;
        } else {
          const result = explorer.apply(choice);
          score = result.success ? this.quiesce(result.explorer, alpha, beta, false, maxQDepth - 1) : standPat;
          if (hasUndo && result.explorer === explorer) explorer.undo();
        }
        if (score > alpha) alpha = score;
        if (alpha >= beta) break;
      }
      return alpha;
    } else {
      for (const { choice, willMeasure } of captures) {
        if (this.isTimeUp()) break;
        let score;
        if (willMeasure) {
          const pass = explorer.apply(choice, { forceMeasurement: "pass" });
          const p = pass.measurementPassProbability ?? 0.5;
          const ps = pass.success ? this.quiesce(pass.explorer, alpha, beta, false, maxQDepth - 1) : standPat;
          if (hasUndo && pass.explorer === explorer) explorer.undo();
          const fail = explorer.apply(choice, { forceMeasurement: "fail" });
          const fs = fail.success ? this.quiesce(fail.explorer, alpha, beta, false, maxQDepth - 1) : standPat;
          if (hasUndo && fail.explorer === explorer) explorer.undo();
          score = p * ps + (1 - p) * fs;
        } else {
          const result = explorer.apply(choice);
          score = result.success ? this.quiesce(result.explorer, alpha, beta, true, maxQDepth - 1) : standPat;
          if (hasUndo && result.explorer === explorer) explorer.undo();
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
  staticEval(explorer) {
    const { gameData } = explorer.view;
    const eval_ = explorer.evaluate();
    if (eval_.isCheckmate) return eval_.score > 0 ? 99999 : -99999;
    if (eval_.isStalemate) return 0;
    let score = 0;
    let whiteBishops = 0;
    let blackBishops = 0;
    const whitePawnFiles = new Uint8Array(8);
    const blackPawnFiles = new Uint8Array(8);
    for (let sq = 0; sq < 64; sq++) {
      const piece = gameData.board.pieces[sq];
      const prob = gameData.board.probabilities[sq];
      if (piece === "." || prob <= 1e-6) continue;
      const isWhite = piece === piece.toUpperCase();
      const sign = isWhite ? 1 : -1;
      const pieceType = piece.toLowerCase();
      score += (PIECE_VAL[piece] ?? 0) * prob;
      const table = PST[pieceType];
      if (table) {
        const pstIdx = isWhite ? sq : 63 - sq;
        score += sign * table[pstIdx] * prob;
      }
      if (pieceType === "b") {
        if (isWhite) whiteBishops += prob;
        else blackBishops += prob;
      }
      if (pieceType === "p") {
        const file = fileOf(sq);
        if (isWhite) whitePawnFiles[file] += prob;
        else blackPawnFiles[file] += prob;
      }
    }
    if (whiteBishops >= 1.5) score += 30;
    if (blackBishops >= 1.5) score -= 30;
    for (let f = 0; f < 8; f++) {
      if (whitePawnFiles[f] > 1) score -= 15 * (whitePawnFiles[f] - 1);
      if (blackPawnFiles[f] > 1) score += 15 * (blackPawnFiles[f] - 1);
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
  choiceKey(choice) {
    if (choice.type === "standard") return choice.from | choice.to << 6;
    if (choice.type === "split") return 4096 + choice.from | choice.targetA << 6 | choice.targetB << 12;
    return 8192 + choice.sourceA | choice.sourceB << 6 | choice.to << 12;
  }
  /** Order moves for root search (more info available from view). */
  orderMoves(legalMoves, view, depth) {
    const ordered = [];
    const killers = depth < this.killerMoves.length ? this.killerMoves[depth] : [-1, -1];
    const probs = view.gameData.board.probabilities;
    for (const m of legalMoves.standard) {
      const choice = { type: "standard", from: m.from, to: m.to };
      let priority = 0;
      const srcProb = probs[m.from];
      if (m.variant === 3) {
        const victim = view.gameData.board.pieces[m.to];
        const attacker = view.gameData.board.pieces[m.from];
        const victimProb = probs[m.to];
        const victimVal = (ABS_PIECE_VAL[victim] ?? 0) * victimProb;
        const attackerVal = (ABS_PIECE_VAL[attacker] ?? 0) * srcProb;
        priority = 1e4 + Math.round(victimVal * 10 - attackerVal);
      }
      if (m.promotionChoices) {
        priority = Math.max(priority, 9e3);
      }
      const key = this.choiceKey(choice);
      if (key === killers[0]) priority = Math.max(priority, 8e3);
      else if (key === killers[1]) priority = Math.max(priority, 7500);
      const toFile = fileOf(m.to);
      const toRank = rankOf(m.to);
      if (toFile >= 2 && toFile <= 5 && toRank >= 2 && toRank <= 5) {
        priority += 50;
        if (toFile >= 3 && toFile <= 4 && toRank >= 3 && toRank <= 4) {
          priority += 50;
        }
      }
      ordered.push({ choice, move: m, priority });
    }
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
    ordered.sort((a, b) => b.priority - a.priority);
    return ordered;
  }
  /** Move ordering for internal search nodes with probability weighting. */
  orderMovesForSearch(moves, view, depth, ply = 0) {
    const result = [];
    const probs = view.gameData.board.probabilities;
    const killers = depth < this.killerMoves.length ? this.killerMoves[depth] : [-1, -1];
    for (const m of moves.standard) {
      const choice = { type: "standard", from: m.from, to: m.to };
      let priority = 0;
      const srcProb = probs[m.from];
      if (m.variant === 3) {
        const victim = view.gameData.board.pieces[m.to];
        const attacker = view.gameData.board.pieces[m.from];
        const victimProb = probs[m.to];
        const victimVal = (ABS_PIECE_VAL[victim] ?? 0) * victimProb;
        const attackerVal = (ABS_PIECE_VAL[attacker] ?? 0) * srcProb;
        priority = 1e4 + Math.round(victimVal * 10 - attackerVal);
      }
      if (m.promotionChoices) priority = Math.max(priority, 9e3);
      const key = this.choiceKey(choice);
      if (key === killers[0]) priority = Math.max(priority, 8e3);
      else if (key === killers[1]) priority = Math.max(priority, 7500);
      if (priority <= 0) {
        priority = Math.round(srcProb * 100);
      }
      result.push({ choice, willMeasure: m.willMeasure, priority });
    }
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
  isClassicalPosition(probs) {
    for (let i = 0; i < 64; i++) {
      const p = probs[i];
      if (p > 1e-3 && p < 0.999) return false;
    }
    return true;
  }
  isTimeUp() {
    if (this.nodesSearched % 64 !== 0) return false;
    return Date.now() >= this.searchDeadline;
  }
  fallbackMove(view) {
    const captures = view.legalMoves.standard.filter((m) => m.variant === 3);
    if (captures.length > 0) {
      const best = captures.reduce((a, b) => {
        const aVal = ABS_PIECE_VAL[view.gameData.board.pieces[a.to]] ?? 0;
        const bVal = ABS_PIECE_VAL[view.gameData.board.pieces[b.to]] ?? 0;
        return bVal > aVal ? b : a;
      });
      return { type: "standard", from: best.from, to: best.to };
    }
    const all = [
      ...view.legalMoves.standard.map((m) => ({ type: "standard", from: m.from, to: m.to })),
      ...this.classicalOnly ? [] : view.legalMoves.splits.map((m) => ({ type: "split", from: m.from, targetA: m.targetA, targetB: m.targetB })),
      ...this.classicalOnly ? [] : view.legalMoves.merges.map((m) => ({ type: "merge", sourceA: m.sourceA, sourceB: m.sourceB, to: m.to }))
    ];
    return all[Math.floor(Math.random() * all.length)];
  }
};

// src/adapters/random-player.ts
var RandomPlayer = class {
  name;
  control = "ai";
  author = "Quantum Chess";
  description = "Picks a random legal move each turn.";
  quantumEnabled;
  constructor(name = "Random", options) {
    this.name = name;
    this.quantumEnabled = options?.quantumEnabled ?? true;
  }
  async chooseMove(view) {
    const { legalMoves } = view;
    const all = [
      ...legalMoves.standard.map((m) => ({
        type: "standard",
        from: m.from,
        to: m.to,
        ...m.promotionChoices ? { promotion: m.promotionChoices[Math.floor(Math.random() * m.promotionChoices.length)] } : {}
      })),
      ...legalMoves.splits.map((m) => ({
        type: "split",
        from: m.from,
        targetA: m.targetA,
        targetB: m.targetB
      })),
      ...legalMoves.merges.map((m) => ({
        type: "merge",
        sourceA: m.sourceA,
        sourceB: m.sourceB,
        to: m.to
      }))
    ];
    if (all.length === 0) {
      throw new Error("RandomPlayer: no legal moves available");
    }
    return all[Math.floor(Math.random() * all.length)];
  }
  onGameOver(_result) {
  }
  dispose() {
  }
};

// src/adapters/http-player.ts
var HttpPlayerAdapter = class {
  name;
  control = "ai";
  author;
  description;
  endpoint;
  authToken;
  timeoutMs;
  abortController = null;
  constructor(options) {
    this.endpoint = options.endpoint;
    this.name = options.name;
    this.author = options.author;
    this.description = options.description;
    this.authToken = options.authToken;
    this.timeoutMs = options.timeoutMs ?? 3e4;
  }
  async chooseMove(view, _explorer, clock) {
    this.abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      this.abortController?.abort();
    }, this.timeoutMs);
    try {
      const headers = {
        "Content-Type": "application/json"
      };
      if (this.authToken) {
        headers["Authorization"] = `Bearer ${this.authToken}`;
      }
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ view, clock }),
        signal: this.abortController.signal
      });
      if (!response.ok) {
        throw new Error(`AI server error: ${response.status} ${response.statusText}`);
      }
      const choice = await response.json();
      return choice;
    } finally {
      clearTimeout(timeoutId);
      this.abortController = null;
    }
  }
  dispose() {
    this.abortController?.abort();
  }
};

// src/adapters/module-worker-player.ts
var ModuleWorkerPlayer = class {
  constructor(url, fallbackName = "Custom AI") {
    this.url = url;
    this.name = fallbackName;
    this.description = "Custom AI Worker";
  }
  url;
  control = "ai";
  name;
  author;
  description;
  quantumEnabled;
  worker = null;
  initialized = false;
  async initialize() {
    if (this.initialized) return;
    this.worker = new Worker(new URL("./adapters/module-worker-runtime.js", import.meta.url), { type: "module" });
    const response = await this.request({ type: "initialize", url: this.url });
    if (response.type !== "initialized") throw new Error("Custom AI worker did not initialize.");
    this.name = response.name;
    this.author = response.author;
    this.description = response.description ?? this.description;
    this.quantumEnabled = response.quantumEnabled;
    this.initialized = true;
  }
  async chooseMove(view, _explorer, clock) {
    const response = await this.request({ type: "chooseMove", view, clock });
    if (response.type !== "move") throw new Error("Custom AI worker did not return a move.");
    return response.choice;
  }
  onOpponentMove(move, view) {
    this.worker?.postMessage({ type: "opponentMove", move, view });
  }
  onGameOver(result) {
    this.worker?.postMessage({ type: "gameOver", result });
  }
  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.initialized = false;
  }
  request(message) {
    const worker = this.worker;
    if (!worker) throw new Error("Custom AI worker not initialized");
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        worker.removeEventListener("message", messageHandler);
        worker.removeEventListener("error", errorHandler);
      };
      const messageHandler = (event) => {
        const msg = event.data;
        cleanup();
        if (msg.type === "error") {
          reject(new Error(msg.message));
          return;
        }
        resolve(msg);
      };
      const errorHandler = (event) => {
        cleanup();
        reject(new Error(`Custom AI worker error: ${event.message}`));
      };
      worker.addEventListener("message", messageHandler);
      worker.addEventListener("error", errorHandler);
      worker.postMessage(message);
    });
  }
};

// src/adapters/worker-player.ts
var WorkerPlayerAdapter = class {
  name;
  control = "ai";
  author;
  description;
  worker = null;
  workerUrl;
  constructor(options) {
    this.workerUrl = options.workerUrl;
    this.name = options.name;
    this.author = options.author;
    this.description = options.description;
  }
  async initialize() {
    this.worker = new Worker(this.workerUrl, { type: "module" });
  }
  async chooseMove(view, _explorer, clock) {
    if (!this.worker) throw new Error("Worker not initialized");
    return new Promise((resolve, reject) => {
      const handler = (e) => {
        this.worker.removeEventListener("message", handler);
        this.worker.removeEventListener("error", errorHandler);
        resolve(e.data);
      };
      const errorHandler = (e) => {
        this.worker.removeEventListener("message", handler);
        this.worker.removeEventListener("error", errorHandler);
        reject(new Error(`Worker error: ${e.message}`));
      };
      this.worker.addEventListener("message", handler);
      this.worker.addEventListener("error", errorHandler);
      this.worker.postMessage({ type: "chooseMove", view, clock });
    });
  }
  onGameOver(result) {
    this.worker?.postMessage({ type: "gameOver", result });
  }
  dispose() {
    this.worker?.terminate();
    this.worker = null;
  }
};

// src/adapters/websocket-player.ts
var WebSocketPlayerAdapter = class {
  name;
  control = "ai";
  author;
  description;
  ws = null;
  url;
  pending = /* @__PURE__ */ new Map();
  requestId = 0;
  constructor(options) {
    this.url = options.url;
    this.name = options.name;
    this.author = options.author;
    this.description = options.description;
  }
  async initialize() {
    this.ws = new WebSocket(this.url);
    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const resolve = this.pending.get(msg.requestId);
        if (resolve) {
          this.pending.delete(msg.requestId);
          resolve(msg.choice);
        }
      } catch {
      }
    };
    await new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error(`WebSocket connection failed: ${this.url}`));
    });
  }
  async chooseMove(view, _explorer, clock) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }
    const id = this.requestId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ type: "chooseMove", requestId: id, view, clock }));
    });
  }
  onOpponentMove(move, view) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "opponentMove", move, view }));
    }
  }
  onGameOver(result) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "gameOver", result }));
    }
  }
  dispose() {
    this.pending.clear();
    this.ws?.close();
    this.ws = null;
  }
};

// src/adapters/local-human.ts
var LocalHumanPlayer = class {
  name;
  control = "human_local";
  pendingResolve = null;
  boardUI = null;
  /** Queued premove to auto-submit when chooseMove is called. */
  queuedPremove = null;
  constructor(name) {
    this.name = name;
  }
  /** Connect a board UI to receive turn notifications. */
  setBoardUI(boardUI) {
    this.boardUI = boardUI;
  }
  async chooseMove(view, _explorer, _clock) {
    this.boardUI?.onTurnStart(view.legalMoves);
    const premove = this.queuedPremove;
    this.queuedPremove = null;
    if (premove) {
      if (this.isPremoveLegal(premove, view.legalMoves)) {
        this.boardUI?.onTurnEnd();
        return premove;
      }
      this.boardUI?.onPremoveInvalid?.();
    }
    return new Promise((resolve) => {
      this.pendingResolve = resolve;
    });
  }
  /**
   * Called by the board UI when the human completes a move gesture.
   * Resolves the pending chooseMove() promise.
   */
  submitMove(choice) {
    if (!this.pendingResolve) return;
    const resolve = this.pendingResolve;
    this.pendingResolve = null;
    this.boardUI?.onTurnEnd();
    resolve(choice);
  }
  /** Whether a move is currently expected (it's this player's turn). */
  isAwaitingMove() {
    return this.pendingResolve !== null;
  }
  /** Queue a premove to auto-submit when it becomes this player's turn. */
  queuePremove(choice) {
    this.queuedPremove = choice;
  }
  /** Clear any queued premove. */
  clearPremove() {
    this.queuedPremove = null;
  }
  /** Whether a premove is currently queued. */
  hasPremove() {
    return this.queuedPremove !== null;
  }
  /** Check if a premove choice matches any legal move in the current position. */
  isPremoveLegal(choice, legalMoves) {
    if (choice.type === "standard") {
      return legalMoves.standard.some((m) => m.from === choice.from && m.to === choice.to);
    }
    if (choice.type === "split") {
      return legalMoves.splits.some((m) => m.from === choice.from && m.targetA === choice.targetA && m.targetB === choice.targetB);
    }
    if (choice.type === "merge") {
      return legalMoves.merges.some((m) => m.sourceA === choice.sourceA && m.sourceB === choice.sourceB && m.to === choice.to);
    }
    return false;
  }
  /** Cancel any pending move (e.g. game aborted). */
  cancelPendingMove() {
    this.pendingResolve = null;
    this.queuedPremove = null;
    this.boardUI?.onTurnEnd();
  }
  onOpponentMove(move, view) {
  }
  onGameOver(result) {
    this.cancelPendingMove();
  }
  dispose() {
    this.cancelPendingMove();
    this.boardUI = null;
  }
};

// src/adapters/remote-human.ts
var RemoteHumanPlayer = class {
  name;
  control = "human_remote";
  connection;
  constructor(name, connection) {
    this.name = name;
    this.connection = connection;
  }
  async chooseMove(_view, _explorer, _clock) {
    return this.connection.waitForMove();
  }
  onGameOver(result) {
    this.connection.sendGameResult?.(result);
  }
  dispose() {
    this.connection.cancel?.();
  }
};

// src/adapters/match-bridge.ts
var MatchBridge = class {
  constructor(config, callbacks) {
    this.config = config;
    this.callbacks = callbacks;
  }
  config;
  callbacks;
  runner = null;
  runPromise = null;
  /**
   * Start the match. Non-blocking -- the game loop runs in the background.
   * @param quantum The quantum adapter for this game.
   * @param adapterFactory Optional factory for creating fresh adapters (enables QCExplorer for AI players).
   */
  /**
   * Start the match. Non-blocking -- the game loop runs in the background.
   * Returns the initial board state after position initialization (before any
   * moves are played). This allows the caller to update the display immediately
   * without touching the quantum adapter directly.
   */
  start(quantum, adapterFactory) {
    this.runner = new QCMatchRunner(this.config);
    this.runner.initialize(quantum, this.config);
    const initialState = this.runner.getEngine()?.getGameData() ?? null;
    const handler = async (event) => {
      switch (event.type) {
        case "move":
          await this.callbacks.onMove(event);
          break;
        case "game_over":
          this.callbacks.onGameOver(event.result);
          break;
        case "clock":
          this.callbacks.onClockUpdate(event.whiteMs, event.blackMs);
          break;
        case "error":
          this.callbacks.onError(event.message);
          break;
      }
    };
    this.runPromise = this.runner.runLoop(handler, adapterFactory).catch((err) => {
      this.callbacks.onError(`Match error: ${err?.message ?? err}`);
      return {
        winner: "draw",
        reason: "abort",
        totalPly: 0,
        moveHistory: []
      };
    });
    return initialState;
  }
  /** Abort the match. */
  stop() {
    this.runner?.abort();
    this.runner = null;
    this.runPromise = null;
  }
  /** Get the underlying runner (for spectating, getting current view). */
  getRunner() {
    return this.runner;
  }
  /** Whether the match is currently running. */
  get isRunning() {
    return this.runner !== null;
  }
};

// src/ai-loader.ts
async function loadCustomAI(source) {
  switch (source.type) {
    case "module": {
      if (source.runInWorker !== false && typeof Worker !== "undefined") {
        const adapter = new ModuleWorkerPlayer(source.url, source.name);
        await adapter.initialize();
        return adapter;
      }
      const mod = await import(
        /* @vite-ignore */
        source.url
      );
      const player = mod.default;
      const error = validatePlayerShape(player);
      if (error) {
        throw new Error(`Invalid AI module at ${source.url}: ${error}`);
      }
      if (!player.control) {
        player.control = "ai";
      }
      return player;
    }
    case "http": {
      return new HttpPlayerAdapter({
        endpoint: source.url,
        name: source.name,
        authToken: source.authToken,
        timeoutMs: source.timeoutMs
      });
    }
    case "websocket": {
      const adapter = new WebSocketPlayerAdapter({
        url: source.url,
        name: source.name
      });
      await adapter.initialize();
      return adapter;
    }
    case "worker": {
      const adapter = new WorkerPlayerAdapter({
        workerUrl: source.url,
        name: source.name
      });
      await adapter.initialize();
      return adapter;
    }
  }
}

// src/tournament/standings.ts
function computeStandings(playerNames, matches) {
  const stats = /* @__PURE__ */ new Map();
  for (const name of playerNames) {
    stats.set(name, { wins: 0, losses: 0, draws: 0, opponents: [] });
  }
  for (const match of matches) {
    const whiteStats = stats.get(match.white);
    const blackStats = stats.get(match.black);
    if (!whiteStats || !blackStats) continue;
    whiteStats.opponents.push(match.black);
    blackStats.opponents.push(match.white);
    if (match.result.winner === "white") {
      whiteStats.wins++;
      blackStats.losses++;
    } else if (match.result.winner === "black") {
      blackStats.wins++;
      whiteStats.losses++;
    } else {
      whiteStats.draws++;
      blackStats.draws++;
    }
  }
  const scores = /* @__PURE__ */ new Map();
  for (const [name, s] of stats) {
    scores.set(name, s.wins + 0.5 * s.draws);
  }
  const standings = [];
  for (const [name, s] of stats) {
    let tiebreak = 0;
    for (const opp of s.opponents) {
      tiebreak += scores.get(opp) ?? 0;
    }
    standings.push({
      player: name,
      wins: s.wins,
      losses: s.losses,
      draws: s.draws,
      score: scores.get(name) ?? 0,
      tiebreak
    });
  }
  standings.sort((a, b) => b.score - a.score || b.tiebreak - a.tiebreak);
  return standings;
}

// src/tournament/pairings.ts
function roundRobinPairings(playerCount) {
  const n = playerCount % 2 === 0 ? playerCount : playerCount + 1;
  const rounds = [];
  const players = Array.from({ length: n }, (_, i) => i);
  for (let round = 0; round < n - 1; round++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const home = players[i];
      const away = players[n - 1 - i];
      if (home < playerCount && away < playerCount) {
        if (round % 2 === 0) {
          pairs.push([home, away]);
        } else {
          pairs.push([away, home]);
        }
      }
    }
    rounds.push(pairs);
    const last = players.pop();
    players.splice(1, 0, last);
  }
  return rounds;
}
function swissPairing(standings, playerNames, previousPairings) {
  const indexed = standings.map((s, i) => ({
    originalIdx: playerNames.indexOf(s.player),
    score: s.score,
    name: s.player
  }));
  indexed.sort((a, b) => b.score - a.score);
  const pairs = [];
  const paired = /* @__PURE__ */ new Set();
  for (let i = 0; i < indexed.length; i++) {
    if (paired.has(indexed[i].originalIdx)) continue;
    for (let j = i + 1; j < indexed.length; j++) {
      if (paired.has(indexed[j].originalIdx)) continue;
      const pairKey = [indexed[i].originalIdx, indexed[j].originalIdx].sort().join("-");
      if (previousPairings.has(pairKey)) continue;
      pairs.push([indexed[i].originalIdx, indexed[j].originalIdx]);
      paired.add(indexed[i].originalIdx);
      paired.add(indexed[j].originalIdx);
      break;
    }
    if (!paired.has(indexed[i].originalIdx)) {
      for (let j = i + 1; j < indexed.length; j++) {
        if (paired.has(indexed[j].originalIdx)) continue;
        pairs.push([indexed[i].originalIdx, indexed[j].originalIdx]);
        paired.add(indexed[i].originalIdx);
        paired.add(indexed[j].originalIdx);
        break;
      }
    }
  }
  return pairs;
}
function swissRoundCount(playerCount) {
  return Math.ceil(Math.log2(playerCount));
}

// src/tournament/tournament-runner.ts
var QCTournamentRunner = class {
  config;
  aborted = false;
  constructor(config) {
    if (config.players.length < 2) {
      throw new Error("Tournament requires at least 2 players.");
    }
    this.config = config;
  }
  /**
   * Run the tournament to completion.
   * @param adapterFactory - Creates fresh quantum adapters for each match.
   * @param onEvent - Optional event handler.
   */
  async run(adapterFactory, onEvent) {
    const { config } = this;
    const playerNames = config.players.map((p) => p.name);
    const allMatches = [];
    const gamesPerMatch = config.gamesPerMatch ?? 2;
    if (config.format === "round_robin") {
      return this.runRoundRobin(adapterFactory, onEvent);
    } else if (config.format === "swiss") {
      return this.runSwiss(adapterFactory, onEvent);
    } else {
      throw new Error(`Tournament format '${config.format}' not yet supported.`);
    }
  }
  abort() {
    this.aborted = true;
  }
  async runRoundRobin(adapterFactory, onEvent) {
    const { config } = this;
    const playerNames = config.players.map((p) => p.name);
    const rounds = roundRobinPairings(config.players.length);
    const allMatches = [];
    const gamesPerMatch = config.gamesPerMatch ?? 2;
    for (let roundIdx = 0; roundIdx < rounds.length; roundIdx++) {
      if (this.aborted) break;
      onEvent?.({ type: "round_start", round: roundIdx + 1, totalRounds: rounds.length });
      for (const [whiteIdx, blackIdx] of rounds[roundIdx]) {
        if (this.aborted) break;
        const results = await this.playMatch(
          whiteIdx,
          blackIdx,
          gamesPerMatch,
          adapterFactory,
          onEvent,
          roundIdx + 1
        );
        allMatches.push(...results);
      }
      const standings = computeStandings(playerNames, allMatches);
      onEvent?.({ type: "round_end", round: roundIdx + 1, standings });
    }
    const finalStandings = computeStandings(playerNames, allMatches);
    const result = {
      standings: finalStandings,
      matches: allMatches,
      format: "round_robin",
      rounds: rounds.length
    };
    onEvent?.({ type: "tournament_end", result });
    return result;
  }
  async runSwiss(adapterFactory, onEvent) {
    const { config } = this;
    const playerNames = config.players.map((p) => p.name);
    const totalRounds = swissRoundCount(config.players.length);
    const allMatches = [];
    const previousPairings = /* @__PURE__ */ new Set();
    const gamesPerMatch = config.gamesPerMatch ?? 2;
    for (let roundIdx = 0; roundIdx < totalRounds; roundIdx++) {
      if (this.aborted) break;
      onEvent?.({ type: "round_start", round: roundIdx + 1, totalRounds });
      const standings = computeStandings(playerNames, allMatches);
      const pairs = swissPairing(standings, playerNames, previousPairings);
      for (const [whiteIdx, blackIdx] of pairs) {
        if (this.aborted) break;
        const pairKey = [whiteIdx, blackIdx].sort().join("-");
        previousPairings.add(pairKey);
        const results = await this.playMatch(
          whiteIdx,
          blackIdx,
          gamesPerMatch,
          adapterFactory,
          onEvent,
          roundIdx + 1
        );
        allMatches.push(...results);
      }
      const roundStandings = computeStandings(playerNames, allMatches);
      onEvent?.({ type: "round_end", round: roundIdx + 1, standings: roundStandings });
    }
    const finalStandings = computeStandings(playerNames, allMatches);
    const result = {
      standings: finalStandings,
      matches: allMatches,
      format: "swiss",
      rounds: totalRounds
    };
    onEvent?.({ type: "tournament_end", result });
    return result;
  }
  /**
   * Play a match between two players (one or more games with color alternation).
   */
  async playMatch(playerAIdx, playerBIdx, gamesCount, adapterFactory, onEvent, round = 1) {
    const { config } = this;
    const results = [];
    for (let game = 0; game < gamesCount; game++) {
      if (this.aborted) break;
      const whiteIdx = game % 2 === 0 ? playerAIdx : playerBIdx;
      const blackIdx = game % 2 === 0 ? playerBIdx : playerAIdx;
      const white = config.players[whiteIdx];
      const black = config.players[blackIdx];
      onEvent?.({ type: "match_start", round, white: white.name, black: black.name });
      const runner = new QCMatchRunner({
        white,
        black,
        rules: config.rules,
        timeControl: config.timeControl,
        maxPly: config.maxPly ?? 500
      });
      const quantum = adapterFactory();
      const gameResult = await runner.run(quantum, void 0, adapterFactory);
      const matchResult = {
        white: white.name,
        black: black.name,
        result: gameResult
      };
      results.push(matchResult);
      onEvent?.({ type: "match_end", round, result: matchResult });
    }
    return results;
  }
};
export {
  BOARD_SQUARES,
  CLASSICAL_START_FEN,
  FIFTY_MOVE_PLY_LIMIT,
  HttpPlayerAdapter,
  LocalHumanPlayer,
  MatchBridge,
  ModuleWorkerPlayer,
  MoveCode,
  MoveType,
  MoveVariant,
  PARITY_MATRIX,
  PROBABILITY_EPSILON,
  PureSDKAdapter,
  QCEngine,
  QCMatchRunner,
  QCTournamentRunner,
  QuantumChessQuantumAdapter,
  RandomPlayer,
  RemoteHumanPlayer,
  StackExplorer,
  WebSocketPlayerAdapter,
  WorkerPlayerAdapter,
  applyClassicalShadowMove,
  applyStandardMove,
  assertValidGameModeConfig,
  buildLegalMoveSet,
  buildOperationPlan,
  buildPgn,
  buildStandardMoveFromSquares,
  classicalBoardToFen,
  clearCastlingRightsForSquare,
  clearCastlingRightsFromMove,
  clearSandboxBoard,
  cloneGameData,
  computeMergeTargets,
  computeStandings,
  createClassicalStartGameData,
  createEmptyGameData,
  createGameModeConfig,
  createGameRunner,
  createIsolatedPort,
  createPoolingPort,
  createQuantumForgePort,
  createQuantumVisualSnapshot,
  createStackExplorer,
  detectKingCapture,
  exportPgn,
  fenToGameData,
  formatMoveString,
  gameDataToPositionString,
  getFile,
  getGameModePreset,
  getLegalTargets,
  getMergeTargets,
  getPieceColor,
  getRank,
  getSplitTargets,
  indexToSquareName,
  isBlackPiece,
  isCurrentTurnPiece,
  isEnemyPiece,
  isFiftyMoveDraw,
  isLegalStandardMove,
  isOnBoard,
  isWhitePiece,
  listGameModePresets,
  loadCustomAI,
  moveRecordsToPgnEntries,
  parseMoveString,
  parsePgn,
  pgnToMoveStrings,
  pieceForMoveSource,
  placeSandboxPiece,
  promotedOrSourcePiece,
  prunePiecesByProbabilities,
  relocateSandboxPiece,
  remapPieceSymbol,
  roundRobinPairings,
  selectPiece,
  squareNameToIndex,
  swissPairing,
  swissRoundCount,
  updateFiftyMoveCounter,
  validateGameModeConfig,
  validatePlayerShape
};
