import type {
  MoveType,
  MoveVariant,
  QChessGameData,
  QChessPosition,
  RulesConfig,
  TimeControlConfig,
  PlayerControl
} from "./core";

// ---------------------------------------------------------------------------
// Engine view (read-only game state snapshot)
// ---------------------------------------------------------------------------

/** Read-only game state snapshot provided to players each turn. */
export interface QCEngineView {
  /** Current board state: pieces, probabilities, ply, castle flags, en passant. */
  gameData: Readonly<QChessGameData>;

  /** Which color is to move. */
  sideToMove: "white" | "black";

  /** All legal moves for the side to move. */
  legalMoves: QCLegalMoveSet;

  /** Move history for the current game. */
  moveHistory: readonly QCMoveRecord[];

  /** Whether quantum rules are enabled for this game. */
  quantumEnabled: boolean;

  /** Game rules configuration. */
  rules: Readonly<RulesConfig>;
}

// ---------------------------------------------------------------------------
// Legal moves
// ---------------------------------------------------------------------------

/** Legal moves organized by category. */
export interface QCLegalMoveSet {
  /** All legal standard moves (jump, slide, captures, castling, promotion). */
  standard: QCMoveOption[];

  /** All legal split moves (quantum superposition). */
  splits: QCSplitOption[];

  /** All legal merge moves (quantum recombination). */
  merges: QCMergeOption[];

  /** Total count of all legal moves. */
  count: number;
}

/** A single legal standard move. */
export interface QCMoveOption {
  /** Source square (0-63, a1=0, h8=63). */
  from: number;

  /** Target square. */
  to: number;

  /** Move type (Jump, Slide, PawnCapture, etc). */
  type: MoveType;

  /** Move variant (Basic, Excluded, Capture). */
  variant: MoveVariant;

  /** Whether this move will trigger a quantum measurement. */
  willMeasure: boolean;

  /** The piece being moved (e.g. "P", "n", "Q"). */
  piece: string;

  /** For promotion moves, the set of valid promotion pieces. */
  promotionChoices?: string[];

  /** Human-readable notation (e.g. "e2-e4", "Nb1-c3"). */
  notation: string;
}

/** A legal split (superposition) move. */
export interface QCSplitOption {
  from: number;
  targetA: number;
  targetB: number;
  type: MoveType.SplitJump | MoveType.SplitSlide;
  piece: string;
  notation: string;
}

/** A legal merge (recombination) move. */
export interface QCMergeOption {
  sourceA: number;
  sourceB: number;
  to: number;
  type: MoveType.MergeJump | MoveType.MergeSlide;
  piece: string;
  notation: string;
}

// ---------------------------------------------------------------------------
// Move records and choices
// ---------------------------------------------------------------------------

/** Record of a completed move. */
export interface QCMoveRecord {
  /** Move string in internal notation (e.g. "e2-e4", "e2^e3e4"). */
  moveString: string;

  /** Human-readable notation. */
  notation: string;

  /** Ply at which this move was played. */
  ply: number;

  /** Whether the move was blocked by a failed measurement. */
  wasBlocked: boolean;

  /** Whether a quantum measurement occurred. */
  wasMeasurement: boolean;

  /** If measured, whether the measurement passed. */
  measurementPassed?: boolean;

  /**
   * Whether the moving piece was in superposition (source-square probability
   * below 1) when this move was played. Standard moves only; absent means
   * unknown. Feeds the Cheshire Cat feat and the Superposition Strike
   * achievement.
   */
  moverWasSuperposed?: boolean;

  /**
   * The piece symbol the applied move took: the piece standing on the target
   * square before the move (the pawn removed by en passant). Absent when the
   * move captured nothing. Feeds game-end classification (a king here means
   * the game ended by capture, not collapse) and the Tunneling feat.
   */
  capturedPiece?: string;

  /**
   * The move was a slide whose path crossed at least one superposed piece
   * and whose exclusion measurement let the mover through. Feeds the
   * Tunneling feat: sliding through a piece in superposition.
   */
  slidThroughSuperposed?: boolean;

  /** Piece probabilities after this move (64 floats). */
  probabilitiesAfter?: number[];
}

/** A player's move choice. One of three shapes depending on move type. */
export type QCMoveChoice =
  | { type: "standard"; from: number; to: number; promotion?: string; phaseQuarters?: number; _forceMeasurement?: "m0" | "m1" }
  | { type: "split"; from: number; targetA: number; targetB: number; phaseQuarters?: number; _forceMeasurement?: "m0" | "m1" }
  | { type: "merge"; sourceA: number; sourceB: number; to: number; phaseQuarters?: number; _forceMeasurement?: "m0" | "m1" };

// phaseQuarters (Alchemy League rulesets): optional pi/2-increment phase
// rotation applied to the moving piece. Only honored when the active
// rules allow phase rotation; the engine rejects it otherwise.

// NOTE: _forceMeasurement is an internal field used by RemoteHumanPlayer to pass
// the server's authoritative measurement outcome. It is not part of the public API.
// AI authors should never set this field.

// ---------------------------------------------------------------------------
// Player interface
// ---------------------------------------------------------------------------

/**
 * Search explorer for AI lookahead.
 *
 * Use apply() to try a move, examine the resulting position via view/evaluate,
 * then call undo() to restore and try the next move.
 */
export interface QCExplorer {
  apply(
    choice: QCMoveChoice,
    options?: { forceMeasurement?: "pass" | "fail" }
  ): QCExplorerResult;
  undo(): void;
  fork(count?: number): QCExplorer[];
  readonly view: QCEngineView;
  readonly depth: number;
  evaluate(): QCPositionEval;
  sample(count: number): QCSample[];
}

export interface QCExplorerResult {
  explorer: QCExplorer;
  success: boolean;
  measured: boolean;
  measurementPassed?: boolean;
  measurementPassProbability?: number;
}

export interface QCPositionEval {
  score: number;
  materialBalance: number;
  isCheckmate: boolean;
  isStalemate: boolean;
}

export interface QCSample {
  pieces: string[];
  weight: number;
}

/** The interface every game participant implements -- human, AI, local, or remote. */
export interface QCPlayer {
  /** Display name (shown in UI, tournament brackets, game history). */
  readonly name: string;

  /** What kind of player this is. Determines UI behavior. */
  readonly control: PlayerControl;

  /** Optional: author or team name (relevant for AIs). */
  readonly author?: string;

  /** Optional: short description of the player/AI's strategy. */
  readonly description?: string;

  /** Whether this player is allowed to make quantum moves (splits/merges). Default true. */
  readonly quantumEnabled?: boolean;

  /** Called once before the first game. Use for loading weights, connecting, warming up, etc. */
  initialize?(): Promise<void>;

  /**
   * Called each turn when it's this player's move. Return the chosen move.
   *
   * For human players, this promise resolves when the player interacts with the board.
   * For AI players, this promise resolves when the algorithm produces a move.
   * For remote players, this promise resolves when the move arrives over the network.
   */
  chooseMove(
    view: QCEngineView,
    explorer: QCExplorer | null,
    clock: QCClock | null
  ): Promise<QCMoveChoice>;

  /**
   * Called when the opponent makes a move (optional).
   * Useful for AIs that want to ponder, or UIs that want to animate the opponent's move.
   */
  onOpponentMove?(move: QCMoveRecord, view: QCEngineView): void;

  /** Called when the game ends. */
  onGameOver?(result: QCGameResult): void;

  /** Called when the player is no longer needed. Clean up resources. */
  dispose?(): void;
}

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

/** Time information passed to the player. */
export interface QCClock {
  /** Milliseconds remaining for the current player. */
  remainingMs: number;

  /** Increment per move in milliseconds. */
  incrementMs: number;

  /** Milliseconds remaining for the opponent. */
  opponentRemainingMs: number;
}

// ---------------------------------------------------------------------------
// Game result
// ---------------------------------------------------------------------------

/** Quantum state health snapshot for diagnostics. */
export interface QCQuantumHealthSnapshot {
  /** Number of quantum properties (squareProps.size). */
  propertyCount: number;
  /** Number of ancilla handles in the pool. */
  ancillaCount: number;
  /** Sum of all existence probabilities (~16 at start, near 0 = post-selection collapse). */
  totalProbability: number;
  /** Number of squares in superposition (0 < p < 1). */
  superpositionSquares: number;
  /** Whether position is fully classical (no quantum properties). */
  isFullyClassical: boolean;
}

/** Structured diagnostics attached to a game result on failure. */
export interface QCGameDiagnostics {
  /** Which player caused the failure. */
  faultPlayer?: "white" | "black";
  /** Fine-grained failure classification. */
  failureClass?:
    | "player_exception"   // chooseMove threw (unknown cause)
    | "search_oom"         // chooseMove threw with OOM
    | "quantum_divergence" // player returned a move not in legal set
    | "execution_failure"  // engine.executeMove returned success=false
    | "execution_oom"      // engine.executeMove threw with OOM
    | "timeout";           // game timed out
  /** Error message from the thrown error. */
  errorMessage?: string;
  /** Stack trace (truncated). */
  errorStack?: string;
  /** The move that was attempted (JSON). */
  attemptedMove?: string;
  /** Quantum state at time of failure. */
  quantumState?: QCQuantumHealthSnapshot;
  /** Consecutive errors before this failure. */
  consecutiveErrors?: number;
}

/** Result of a completed game. */
export interface QCGameResult {
  winner: "white" | "black" | "draw";
  reason:
    | "checkmate"
    /** A measurement collapsed the losing king out of existence. */
    | "measurement"
    /** Mutual annihilation: one measurement removed both kings. Draw. */
    | "annihilation"
    | "resignation"
    | "timeout"
    | "stalemate"
    | "fifty_move"
    | "max_ply"
    | "agreement"
    | "disconnect"
    | "illegal_move"
    | "player_exception"
    | "oom"
    | "abort";
  totalPly: number;
  moveHistory: QCMoveRecord[];
  /** Structured diagnostics on failure. Absent on clean wins/draws. */
  diagnostics?: QCGameDiagnostics;
  /** Peak quantum state metrics across the game. */
  quantumPeaks?: {
    maxPropertyCount: number;
    maxAncillaCount: number;
    minTotalProbability: number;
    plyAtMaxProperties: number;
  };
}

// ---------------------------------------------------------------------------
// Match configuration
// ---------------------------------------------------------------------------

/** Result of applying a move through the engine. */
export interface QCMoveExecutionResult {
  success: boolean;
  gameData: QChessGameData;
  moveRecord: QCMoveRecord;
  measurementText: string;
  /** Present when the move was rejected due to an impossible forced measurement. */
  error?: string;
}

/** Hook for server-authoritative online games (ranked + unranked). */
export interface QCServerAuthority {
  /**
   * Called BEFORE the local engine executes a local player's chosen move.
   * Sends the move to the server, awaits the canonical result, and returns
   * the choice annotated with the server's forced measurement outcome
   * (or unchanged for non-measurement moves). The match runner then executes
   * the move with that forced outcome so the mover's quantum state matches
   * the server's.
   *
   * Returns null if the server rejected the move (wrong turn, ply mismatch,
   * unparseable, timeout, etc.); the match runner treats this as illegal
   * and re-prompts the player.
   */
  resolveServerOutcome(
    choice: QCMoveChoice,
    ply: number
  ): Promise<QCMoveChoice | null>;
}

export interface QCMatchConfig {
  white: QCPlayer;
  black: QCPlayer;
  rules: RulesConfig;
  timeControl?: TimeControlConfig;
  /**
   * Remaining time on each clock when the match starts, for a match that
   * resumes or rebuilds a game in progress (reconnect, resync, takeback).
   * Without it the runner starts both clocks from `timeControl`'s initial
   * time, and its next clock event hands both sides a full clock back.
   * Ignored without `timeControl`.
   */
  clocks?: { whiteMs: number; blackMs: number };
  /** Safety limit. Default 500. */
  maxPly?: number;
  /** Custom starting position. Default: classical start. */
  startingPosition?: QChessPosition;
  /** For online ranked games where server determines measurement outcomes. */
  serverAuthority?: QCServerAuthority;
  /** Sandbox options. */
  sandbox?: {
    ignoreTurnOrder?: boolean;
    forceMeasurement?: "random" | "m0" | "m1";
    respectWinCondition?: boolean;
  };
  /** Delay in ms between moves (for AI vs AI spectating). Default 0. */
  moveDelayMs?: number;
}

// ---------------------------------------------------------------------------
// Match events
// ---------------------------------------------------------------------------

export type QCMatchEvent =
  | QCMatchMoveEvent
  | QCMatchMeasurementEvent
  | QCMatchGameOverEvent
  | QCMatchErrorEvent
  | QCMatchClockEvent;

export interface QCMatchMoveEvent {
  type: "move";
  ply: number;
  color: "white" | "black";
  moveRecord: QCMoveRecord;
  gameData: QChessGameData;
  legalMoveCount?: { standard: number; splits: number; merges: number; total: number };
  /** Quantum state health after this move was applied. */
  quantumHealth?: QCQuantumHealthSnapshot;
}

export interface QCMatchMeasurementEvent {
  type: "measurement";
  ply: number;
  passed: boolean;
  square: number;
}

export interface QCMatchGameOverEvent {
  type: "game_over";
  result: QCGameResult;
}

export interface QCMatchErrorEvent {
  type: "error";
  ply: number;
  message: string;
}

export interface QCMatchClockEvent {
  type: "clock";
  whiteMs: number;
  blackMs: number;
}
