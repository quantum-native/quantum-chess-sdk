declare const BOARD_SQUARES = 64;
declare enum MoveType {
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
declare enum MoveVariant {
    Unspecified = 0,
    Basic = 1,
    Excluded = 2,
    Capture = 3
}
declare enum MoveCode {
    Fail = 0,
    Success = 1,
    WhiteWin = 2,
    BlackWin = 3,
    MutualWin = 4,
    Draw = 5
}
interface QChessMove {
    square1: number;
    square2: number;
    square3: number;
    type: MoveType;
    variant: MoveVariant;
    doesMeasurement: boolean;
    measurementOutcome: number;
    promotionPiece: number;
}
/**
 * The identity of a quantum chess position — the source of truth.
 * This is everything needed to reconstruct the full quantum state
 * by replaying the history through the quantum simulator.
 */
interface QChessPosition {
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
interface QChessBoardState {
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
interface QChessGameData {
    position: QChessPosition;
    board: QChessBoardState;
}

/** The standard classical starting position FEN. */
declare const CLASSICAL_START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
declare function createEmptyGameData(): QChessGameData;
declare function createClassicalStartGameData(): QChessGameData;
declare function cloneGameData(gameData: QChessGameData): QChessGameData;
/**
 * Convert a classical board state to a FEN string.
 * ONLY valid for positions where all pieces have probability 0 or 1 (no quantum state).
 * Use this for: sandbox editing phase, PGN starting position headers.
 */
declare function classicalBoardToFen(board: QChessBoardState): string;
/**
 * Build the full position string from game data.
 * Format: "position fen <startingFen> moves <m1> <m2> ..."
 */
declare function gameDataToPositionString(gameData: QChessGameData): string;
declare function fenToGameData(fen: string): QChessGameData | null;

type PieceColor = "white" | "black";
declare function indexToSquareName(index: number): string;
declare function squareNameToIndex(square: string): number;
declare function getFile(index: number): number;
declare function getRank(index: number): number;
declare function isOnBoard(index: number): boolean;
declare function isWhitePiece(piece: string): boolean;
declare function isBlackPiece(piece: string): boolean;
declare function getPieceColor(piece: string): PieceColor | null;
declare function isEnemyPiece(piece: string, color: PieceColor): boolean;

/**
 * Build a QChessMove directly from square indices, bypassing string/regex parsing.
 * For standard moves only (not splits/merges — those use parseMoveString).
 * ~100x faster than parseMoveString for the hot path in AI search.
 */
declare function buildStandardMoveFromSquares(source: number, target: number, gameData: QChessGameData): QChessMove;
declare function parseMoveString(moveString: string, gameData?: QChessGameData): QChessMove | null;
declare function formatMoveString(move: QChessMove): string;

interface LegalTargetOptions {
    ignoreTurnOrder?: boolean;
}
declare function getLegalTargets(gameData: QChessGameData, source: number, options?: LegalTargetOptions): number[];
declare function getSplitTargets(gameData: QChessGameData, source: number, options?: LegalTargetOptions): number[];
declare function getMergeTargets(gameData: QChessGameData, sourceA: number, sourceB: number, options?: LegalTargetOptions): number[];
declare function isLegalStandardMove(gameData: QChessGameData, move: QChessMove, options?: LegalTargetOptions): boolean;
declare function clearCastlingRightsForSquare(castleFlags: number, source: number): number;
declare function applyStandardMove(gameData: QChessGameData, moveInput: string | QChessMove): QChessGameData;

/**
 * execution.ts — Pure game logic for applying moves to board state.
 *
 * These functions operate on QChessGameData without any UI, quantum adapter,
 * or network dependencies, making them safe to share between client and server.
 */

/**
 * Minimum probability threshold for piece existence.
 * Matches the C++ engine's FLT_EPSILON used for amplitude pruning.
 */
declare const PROBABILITY_EPSILON = 1.1920929e-7;
/** Ply limit for the quantum 50-move rule (100 half-moves = 50 full moves). */
declare const FIFTY_MOVE_PLY_LIMIT = 100;
/**
 * Update the quantum fifty-move counter based on the change in total piece count
 * (sum of square probabilities). Resets when the piece count changes by >= 1.0.
 * This matches the C++ QuantumChessEngine implementation.
 */
declare function updateFiftyMoveCounter(gameData: QChessGameData): {
    fiftyCount: number;
    fiftyPieceCount: number;
};
/**
 * Check if the quantum fifty-move rule draw condition is met.
 */
declare function isFiftyMoveDraw(gameData: QChessGameData): boolean;
declare function clearCastlingRightsFromMove(castleFlags: number, squares: number[]): number;
declare function pieceForMoveSource(gameData: QChessGameData, move: QChessMove): string;
declare function promotedOrSourcePiece(sourcePiece: string, move: QChessMove): string;
declare function prunePiecesByProbabilities(gameData: QChessGameData): void;
declare function remapPieceSymbol(gameData: QChessGameData, piece: string, extraSquares: number[]): void;
declare function applyClassicalShadowMove(gameData: QChessGameData, move: QChessMove): QChessGameData;
declare function detectKingCapture(gameData: QChessGameData): "white_win" | "black_win" | null;
declare function clearSandboxBoard(): QChessGameData;
declare function placeSandboxPiece(gameData: QChessGameData, square: number, piece: string): QChessGameData;
declare function relocateSandboxPiece(gameData: QChessGameData, from: number, to: number): QChessGameData;
declare function isCurrentTurnPiece(piece: string, ply: number, probability: number): boolean;
declare function selectPiece(gameData: QChessGameData, square: number, ignoreTurnOrder?: boolean): {
    legalTargets: number[];
    splitTargets: number[];
} | null;
declare function computeMergeTargets(gameData: QChessGameData, sourceA: number, sourceB: number, ignoreTurnOrder?: boolean): number[];

type GameModeId = "sandbox" | "vs_ai" | "ai_vs_ai" | "online_ranked" | "online_unranked" | "puzzle" | "tutorial" | "spectate" | "analysis";
type PlayerSide = "white" | "black";
type PlayerControl = "human_local" | "human_remote" | "ai";
type MatchmakingType = "none" | "casual" | "ranked";
type ObjectiveType = "checkmate" | "puzzle";
type StartingPositionType = "classical" | "custom";
interface PlayerConfig {
    side: PlayerSide;
    control: PlayerControl;
}
interface TimeControlConfig {
    initialSeconds: number;
    incrementSeconds: number;
    maxSeconds: number;
}
interface RulesConfig {
    quantumEnabled: boolean;
    allowSplitMerge: boolean;
    allowMeasurementAnnotations: boolean;
    allowCastling: boolean;
    allowEnPassant: boolean;
    allowPromotion: boolean;
    objective: ObjectiveType;
}
interface VariantDefinition {
    id: string;
    name: string;
    description?: string;
    ruleOverrides?: Partial<RulesConfig>;
    startingPosition?: StartingPositionType;
}
interface GameModeConfig {
    modeId: GameModeId;
    label: string;
    players: [PlayerConfig, PlayerConfig];
    rules: RulesConfig;
    matchmaking: MatchmakingType;
    timeControl?: TimeControlConfig;
    puzzleId?: string;
    tutorialId?: string;
    variantId?: string;
    startingPosition: StartingPositionType;
}
interface GameModeConfigOverrides {
    puzzleId?: string;
    tutorialId?: string;
    timeControl?: TimeControlConfig;
    players?: Partial<Record<PlayerSide, PlayerControl>>;
    variant?: VariantDefinition;
}
declare function listGameModePresets(): GameModeConfig[];
declare function getGameModePreset(modeId: GameModeId): GameModeConfig;
declare function createGameModeConfig(modeId: GameModeId, overrides?: GameModeConfigOverrides): GameModeConfig;
declare function validateGameModeConfig(config: GameModeConfig): string[];
declare function assertValidGameModeConfig(config: GameModeConfig): void;

type ParityFeatureBucketId = "sandbox" | "vs_ai" | "local_multiplayer" | "online_multiplayer" | "time_controls" | "puzzles_tutorials" | "spectate" | "analysis" | "probability_ring" | "entanglement_phase_overlays" | "auth_tester_portal" | "variants_tournaments_extensibility";
interface ParityFeatureBucket {
    bucketId: ParityFeatureBucketId;
    label: string;
    requiredModes: readonly GameModeId[];
}
declare const PARITY_MATRIX: readonly ParityFeatureBucket[];

/**
 * pgn.ts — Quantum PGN (Portable Game Notation) serialization and parsing.
 *
 * Extends standard PGN format with quantum chess extensions:
 *   - Custom headers for quantum rule configuration
 *   - Split notation: source^target1target2 (e.g. b1^a3c3)
 *   - Merge notation: source1source2^target (e.g. a3c3^b5)
 *   - Measurement annotations: .m0 / .m1
 *   - Blocked-move comments: {blocked}
 */
type PgnResult = "1-0" | "0-1" | "1/2-1/2" | "*";
interface PgnHeaders {
    Event: string;
    Site: string;
    Date: string;
    Round: string;
    White: string;
    Black: string;
    Result: PgnResult;
    [key: string]: string;
}
interface PgnMoveEntry {
    moveString: string;
    notation: string;
    ply: number;
    comment?: string;
}
interface PgnGame {
    headers: PgnHeaders;
    moves: PgnMoveEntry[];
}
interface PgnExportOptions {
    headers?: Partial<PgnHeaders>;
    moves: PgnMoveEntry[];
    result?: PgnResult;
    /** Include quantum-specific headers. Defaults to true. */
    quantumHeaders?: boolean;
    /** Starting FEN (omitted if standard start position). */
    fen?: string;
}
declare function exportPgn(options: PgnExportOptions): string;
interface MoveRecordLike {
    moveString: string;
    notation: string;
    ply: number;
    wasBlocked?: boolean;
    wasMeasurement?: boolean;
}
declare function moveRecordsToPgnEntries(records: MoveRecordLike[]): PgnMoveEntry[];
declare function parsePgn(pgn: string): PgnGame | null;
/**
 * Parse a PGN string and extract just the move strings (useful for replay).
 */
declare function pgnToMoveStrings(pgn: string): string[];
/**
 * Build a PGN string from game state and move records.
 */
declare function buildPgn(options: {
    white?: string;
    black?: string;
    result?: PgnResult;
    moves: MoveRecordLike[];
    fen?: string;
    event?: string;
    site?: string;
    date?: string;
    round?: string;
    extraHeaders?: Record<string, string>;
}): string;

/**
 * Quantum Primitive Port — the driver interface between chess logic and
 * quantum simulation.
 *
 * Defines the quantum operations needed to play quantum chess without
 * specifying how they're implemented. Different backends can satisfy
 * this interface:
 *
 * - QuantumForge (default, proprietary WASM)
 * - Qiskit / Cirq (IBM/Google quantum frameworks)
 * - Pure math state vector simulator
 * - Real quantum hardware
 * - Mock port (deterministic outcomes for testing)
 *
 * The QuantumChessQuantumAdapter translates chess moves (jumps, slides,
 * splits, merges) into sequences of these primitive operations.
 */
/** Opaque handle to a quantum property (qudit). */
type QuantumHandle = unknown;
/** Opaque predicate for conditional quantum operations. */
type QuantumPredicate = unknown;
/** Probability distribution for a quantum property. */
interface QuantumProbability {
    probability: number;
    qudit_values: number[];
}
/** Entry in a reduced density matrix (for entanglement inspection). */
interface ReducedDensityMatrixEntry {
    row_values: number[];
    col_values: number[];
    value: {
        real: number;
        imag: number;
    };
}
/**
 * The primitive quantum operations needed to simulate quantum chess.
 *
 * All operations act on QuantumHandles (opaque references to qudits).
 * Operations are unitary (reversible) except for measurement, which
 * collapses quantum state irreversibly.
 */
interface QuantumPrimitivePort {
    /** Create a quantum property (qudit) with the given dimension. */
    createProperty(dimension: number): QuantumHandle;
    /** Create a predicate: true when the handle's value equals `value`. */
    predicateIs(handle: QuantumHandle, value: number): QuantumPredicate;
    /** Create a predicate: true when the handle's value does NOT equal `value`. */
    predicateIsNot(handle: QuantumHandle, value: number): QuantumPredicate;
    /**
     * Cycle (phase rotation) on a qudit.
     * Applies a phase shift proportional to `fraction` (1.0 = full cycle).
     * Part of split/merge move sequences.
     */
    cycle(handle: QuantumHandle, fraction?: number, predicates?: QuantumPredicate[]): void;
    /**
     * iSwap gate between two qudits.
     * Swaps amplitudes and applies a phase of i^fraction.
     * This is the fundamental operation for moving pieces between squares.
     * Conditional on predicates (used for slides that check path is clear).
     */
    iSwap(handle1: QuantumHandle, handle2: QuantumHandle, fraction: number, predicates?: QuantumPredicate[]): void;
    /**
     * Swap two qudits (no phase change).
     * Used for castling rook movement.
     */
    swap(handle1: QuantumHandle, handle2: QuantumHandle, predicates?: QuantumPredicate[]): void;
    /**
     * Clock (phase advance) on a qudit.
     * Applies phase rotation. clock(h, 0.5) applies a phase of i.
     * Used for accumulated deferred phase correction.
     */
    clock(handle: QuantumHandle, fraction: number, predicates?: QuantumPredicate[]): void;
    /**
     * Measure a predicate (collapse conditional state).
     * Returns 0 or 1. Irreversible.
     */
    measurePredicate(predicates: QuantumPredicate[]): number;
    /**
     * Measure multiple qudits, collapsing their quantum state.
     * Returns an array of measured values. Irreversible.
     */
    measure(handles: QuantumHandle[]): number[];
    /**
     * Force-measure qudits to specific values (for deterministic replays).
     * Used when replaying games with known measurement outcomes.
     */
    forcedMeasure(handles: QuantumHandle[], values: number[]): number[];
    /**
     * Get the probability distribution for each qudit WITHOUT collapsing state.
     * Used for displaying piece transparency and AI evaluation.
     */
    probabilities(handles: QuantumHandle[]): QuantumProbability[];
    /**
     * Get the reduced density matrix for a set of qudits (optional).
     * Used for advanced entanglement visualization.
     */
    reducedDensityMatrix?(handles: QuantumHandle[]): ReducedDensityMatrixEntry[];
    /**
     * Destroy a quantum property, removing its qudit from the state vector (optional).
     * Measures the property first (collapsing it out of superposition), then
     * factorizes it out of the global state vector, freeing the dimension.
     *
     * Without this, destroyed properties leave dead qudits in the state vector
     * that still contribute to exponential size growth.
     *
     * If not implemented, callers should fall back to measure + cycle to |0⟩.
     */
    destroyProperty?(handle: QuantumHandle): void;
    /**
     * Force-measure a predicate to a specific outcome (optional, QF >= 1.10.0).
     * Like measurePredicate but forces the outcome to `value` (0 or 1).
     * Returns the actual outcome (which equals `value` if possible, or the
     * natural outcome if the forced value was impossible).
     */
    forcedMeasurePredicate?(predicates: QuantumPredicate[], value: number): number;
    /**
     * Get the probability that a set of predicates holds (optional, QF >= 1.10.0).
     * Returns a number between 0.0 and 1.0 WITHOUT collapsing the state.
     * Used to check feasibility before calling forcedMeasurePredicate.
     */
    predicateProbability?(predicates: QuantumPredicate[]): number;
    /**
     * Factorize all separable sub-states in the simulation (optional, QF >= 1.10.0).
     * Splits any shared states that are tensor products into independent states.
     * Called before destroyProperty to ensure clean factorization.
     */
    factorizeAllSeparable?(): void;
}
/** Description of a quantum operation applied during a move (for logging/replay). */
interface OperationStep {
    op: "cycle" | "i_swap" | "swap" | "clock" | "measure";
    squares: number[];
    fraction?: number;
}
/** Result of applying a quantum chess move through the adapter. */
interface QuantumMoveResult {
    applied: boolean;
    measured: boolean;
    measurementPassed?: boolean;
}

/** Port backed by an isolated QuantumSimulation. Call dispose() when done. */
interface DisposablePort extends QuantumPrimitivePort {
    dispose(): void;
}
interface QuantumForgeLikeModule {
    QuantumForge: {
        createQuantumProperty: (dimension: number) => unknown;
        getMaxStateSize?: () => number;
    };
    QuantumSimulation?: new () => {
        createProperty: (dimension: number) => unknown;
        destroyProperty: (prop: unknown) => void;
        factorizeAllSeparable?: () => void;
        destroy: () => void;
        isDestroyed: () => boolean;
    };
    cycle: (prop: unknown, fraction?: number, predicates?: unknown[]) => void;
    i_swap: (prop1: unknown, prop2: unknown, fraction: number, predicates?: unknown[]) => void;
    swap: (prop1: unknown, prop2: unknown, predicates?: unknown[]) => void;
    clock: (prop: unknown, fraction: number, predicates?: unknown[]) => void;
    measure_predicate: (predicates: unknown[]) => number;
    forced_measure_predicate?: (predicates: unknown[], forcedValue: number) => number;
    predicate_probability?: (predicates: unknown[]) => number;
    measure_properties: (props: unknown[]) => number[];
    forced_measure_properties: (props: unknown[], forcedValues: number[]) => number[];
    probabilities: (props: unknown[]) => Array<{
        probability: number;
        qudit_values: number[];
    }>;
    reduced_density_matrix?: (props: unknown[]) => Array<{
        row_values: number[];
        col_values: number[];
        value: {
            real: number;
            imag: number;
        };
    }>;
    reset?: (prop: unknown, currentValue: number) => void;
    executeBatchTape?: (properties: unknown[], tape: Float64Array) => {
        opsExecuted: number;
        success: boolean;
        errorMessage: string;
    };
    OP?: Record<string, number>;
}
/**
 * Create an isolated port backed by its own QuantumSimulation.
 * Each port has a completely independent state vector.
 * Call dispose() when done — destroys the simulation and frees all memory.
 *
 * Do NOT call adapter.clear() before dispose() — clear() destroys individual
 * properties, leaving the simulation in a partial state that crashes on destroy().
 * Just call dispose() directly; it handles all cleanup internally.
 */
declare function createIsolatedPort(module: QuantumForgeLikeModule): DisposablePort;
/** Create a QuantumForge port using the global shared state. */
declare function createQuantumForgePort(module: QuantumForgeLikeModule): QuantumPrimitivePort;

interface ProbabilityRingVisual {
    value: number;
    visible: boolean;
    color: string;
    thickness: number;
    opacity: number;
}
interface SquareVisualTelemetry {
    square: number;
    piece: string;
    probability: number;
    ring: ProbabilityRingVisual;
}
interface EntanglementVisualLink {
    fromSquare: number;
    toSquare: number;
    strength: number;
    /** Positive = correlated (coexist), negative = anti-correlated (one or the other). */
    correlation?: number;
}
interface RelativePhaseVisualLink {
    fromSquare: number;
    toSquare: number;
    radians: number;
    confidence: number;
}
interface MeasurementImpactVisual {
    square: number;
    /** Change in probability if hovered square measures IN (occupied). */
    deltaIfIn: number;
    /** Change in probability if hovered square measures OUT (empty). */
    deltaIfOut: number;
}
interface QuantumVisualCapabilities {
    probabilityRings: true;
    entanglement: boolean;
    relativePhase: boolean;
}
interface QuantumVisualSnapshot {
    revision: number;
    squares: SquareVisualTelemetry[];
    entanglement: EntanglementVisualLink[];
    relativePhase: RelativePhaseVisualLink[];
    capabilities: QuantumVisualCapabilities;
    warnings: string[];
}
interface QuantumVisualAdapter {
    getExistenceProbability(square: number): number;
    hasSquareProperty(square: number): boolean;
}
interface QuantumRelationshipProvider {
    getEntanglement?(gameData: QChessGameData): EntanglementVisualLink[];
    getRelativePhase?(gameData: QChessGameData): RelativePhaseVisualLink[];
}
interface QuantumVisualSnapshotOptions {
    revision?: number;
    probabilityEpsilon?: number;
    ringColor?: string;
    ringThickness?: number;
    relationshipProvider?: QuantumRelationshipProvider;
}
declare function createQuantumVisualSnapshot(gameData: QChessGameData, adapter: QuantumVisualAdapter, options?: QuantumVisualSnapshotOptions): QuantumVisualSnapshot;

declare function buildOperationPlan(move: QChessMove): OperationStep[];
/** Recorded quantum operation for undo. */
interface RecordedOp {
    type: "iSwap" | "cycle" | "swap" | "clock";
    handles: QuantumHandle[];
    fraction?: number;
    predicates?: QuantumPredicate[];
}
declare class QuantumChessQuantumAdapter {
    private readonly squareProps;
    /** Tracks which squares are classically occupied. Used for lazy property creation. */
    private readonly classicalOccupied;
    private readonly dimension;
    private readonly port;
    private ancillaPool;
    /** Operation recording for undo. When enabled, all gate ops are logged. */
    private _recording;
    private _recordedOps;
    /** All handles ever created by this adapter (for orphan detection during undo). */
    private readonly _allHandles;
    /** Property allocation tracking for diagnostics. */
    private readonly _stats;
    /**
     * Deferred iSwap phase counts per quantum handle.
     * When a superposed piece makes a standard move to an empty square with
     * no predicates, the iSwap is deferred: instead of calling port.iSwap(),
     * we move the handle in squareProps and increment the phase count.
     * Each deferred iSwap accumulates a phase of i (= clock(0.5)).
     * Flushed before any real quantum interaction with the handle.
     */
    private readonly pendingPhases;
    private _iSwap;
    private _cycle;
    private _swap;
    private _clock;
    private _trackCreate;
    private _trackDestroy;
    /** Get property allocation stats for diagnostics. */
    getPropertyStats(): typeof this._stats;
    /** Check if the quantum state is near the OOM limit.
     *  Returns true if state_vector_size on any tracked property exceeds the threshold.
     *  Call before search moves to abort early instead of crashing WASM. */
    isNearOOM(threshold?: number): boolean;
    /** Start recording quantum operations. Call before executeMove. */
    startRecording(): void;
    /** Stop recording and return the recorded operations. */
    stopRecording(): RecordedOp[];
    /**
     * Undo recorded operations by applying their inverses in reverse order.
     * iSwap(a,b,f) → iSwap(a,b,-f). cycle(h,f) → cycle(h,-f). swap is self-inverse.
     */
    undoRecordedOps(ops: RecordedOp[]): void;
    /** Snapshot of adapter bookkeeping state for undo. */
    /** True if there are no quantum properties — position is fully classical. */
    isFullyClassical(): boolean;
    captureBookkeeping(): {
        squareProps: Map<number, QuantumHandle>;
        classicalOccupied: Set<number>;
        pendingPhases: Map<QuantumHandle, number>;
        ancillaPool: QuantumHandle[];
        handleCount: number;
    };
    /** Restore adapter bookkeeping state from a snapshot.
     *  Destroys any quantum handles created since the snapshot (transient search
     *  properties) to prevent state vector growth during do/undo search. */
    restoreBookkeeping(snapshot: ReturnType<QuantumChessQuantumAdapter["captureBookkeeping"]>): void;
    constructor(port: QuantumPrimitivePort, options?: {
        dimension?: number;
    });
    clear(): void;
    hasSquareProperty(square: number): boolean;
    /**
     * Initialize the quantum simulator from a classical piece layout.
     * Lazily tracks occupied squares without creating quantum properties.
     * Properties are created on demand when a square participates in a quantum operation.
     *
     * Only accepts a pieces array -- no game data, no probabilities, no history.
     * This ensures the caller cannot accidentally pass a quantum snapshot.
     * To reconstruct a position with quantum state, replay moves via QCEngine.
     */
    initializeClassical(pieces: string[]): void;
    /**
     * Ensure a quantum property exists for the given square.
     * If none exists, creates one and initializes it to |1> for occupied or |0> for empty.
     */
    ensureSquareProp(square: number): QuantumHandle;
    /**
     * Check if a move is entirely classical — source, destination, and path
     * are all classical (no quantum properties). Basic variant only (no
     * measurement needed). For these moves, we can skip QuantumForge
     * entirely and just update classical tracking.
     */
    private isClassicalMove;
    /**
     * Apply a fully classical move without any QuantumForge calls.
     * Updates only the classicalOccupied tracking.
     */
    private applyClassicalMoveDirectly;
    applyMove(move: QChessMove): QuantumMoveResult;
    /**
     * Scan all quantum-tracked squares and collapse any that are now
     * deterministic (probability > 0.999 or < 0.001) back to classical.
     * The freed quantum property handle goes to the ancilla pool for reuse.
     */
    private collapseDeterministicSquares;
    getExistenceProbability(square: number): number;
    /** Sum of all square existence probabilities. A valid state has ~16 at game start. Near-zero means post-selection collapsed the state. */
    getTotalProbability(): number;
    /** Lightweight health snapshot for diagnostics. */
    getHealthSnapshot(): {
        propertyCount: number;
        ancillaCount: number;
        totalProbability: number;
        superpositionSquares: number;
        isFullyClassical: boolean;
        stateVectorSize?: number;
        activeQudits?: number;
        liveHandles: number;
        peakLiveHandles: number;
        createdByType: {
            square: number;
            captureAncilla: number;
            conditionFlag: number;
            measureAncilla: number;
        };
        destroyed: number;
    };
    measureSquare(square: number): number;
    private applyJump;
    private applySlide;
    private applySplitJump;
    private applySplitSlide;
    private applyMergeJump;
    private applyMergeSlide;
    private applyPawnCapture;
    private applyEnPassant;
    private applyKingSideCastle;
    private applyQueenSideCastle;
    /**
     * Flush any pending deferred phases for a quantum handle.
     * Applies clock(handle, 0.5 * count) to account for accumulated iSwap phases.
     * Must be called before any real quantum interaction with the handle.
     */
    private flushPendingPhase;
    /**
     * Flush pending phases for all handles involved in a set of squares.
     */
    private flushPendingPhasesForSquares;
    private swapSquares;
    private doCapture;
    private applyBasicEnPassant;
    private applyCaptureEnPassant;
    private getPathEmptyPredicates;
    private getSquareFullPredicate;
    private getSquareEmptyPredicate;
    private createAncilla;
    private recycleAncilla;
    private createConditionFlag;
    private applyControlledCycles;
    private applySplitJumpSequence;
    private applyMergeJumpSequence;
    private resolveMeasuredCondition;
    private getPathSquaresExclusive;
    /** Get squares that are in superposition (0 < P < 1). */
    getSuperpositionSquares(gameData: QChessGameData, epsilon?: number): number[];
    /**
     * Compute pairwise correlation between two squares using joint probabilities.
     * Returns { strength, correlation } where:
     *   strength = mutual information (0 = independent, higher = more entangled)
     *   correlation = P(A=1,B=1) - P(A=1)*P(B=1), positive = correlated, negative = anti-correlated
     */
    computeCorrelation(squareA: number, squareB: number): {
        strength: number;
        correlation: number;
    };
    /**
     * Compute entanglement links for all superposition squares.
     * Returns links sorted by strength, filtered above a threshold.
     */
    computeEntanglementLinks(gameData: QChessGameData, threshold?: number): EntanglementVisualLink[];
    /**
     * Compute how measuring a square would affect other squares' probabilities.
     * Returns delta = P(other | measured=1) - P(other) for each other superposition square.
     */
    computeMeasurementImpact(square: number, gameData: QChessGameData, epsilon?: number): Array<{
        square: number;
        deltaIfIn: number;
        deltaIfOut: number;
    }>;
    /**
     * Compute relative phase between two squares using the reduced density matrix.
     */
    computeRelativePhase(squareA: number, squareB: number): {
        radians: number;
        magnitude: number;
    } | null;
    /**
     * Compute relative phase links for same-type same-color piece pairs.
     */
    computeRelativePhaseLinks(gameData: QChessGameData, epsilon?: number): RelativePhaseVisualLink[];
}

/** Read-only game state snapshot provided to players each turn. */
interface QCEngineView {
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
/** Legal moves organized by category. */
interface QCLegalMoveSet {
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
interface QCMoveOption {
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
interface QCSplitOption {
    from: number;
    targetA: number;
    targetB: number;
    type: MoveType.SplitJump | MoveType.SplitSlide;
    piece: string;
    notation: string;
}
/** A legal merge (recombination) move. */
interface QCMergeOption {
    sourceA: number;
    sourceB: number;
    to: number;
    type: MoveType.MergeJump | MoveType.MergeSlide;
    piece: string;
    notation: string;
}
/** Record of a completed move. */
interface QCMoveRecord {
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
    /** Piece probabilities after this move (64 floats). */
    probabilitiesAfter?: number[];
}
/** A player's move choice. One of three shapes depending on move type. */
type QCMoveChoice = {
    type: "standard";
    from: number;
    to: number;
    promotion?: string;
    _forceMeasurement?: "m0" | "m1";
} | {
    type: "split";
    from: number;
    targetA: number;
    targetB: number;
    _forceMeasurement?: "m0" | "m1";
} | {
    type: "merge";
    sourceA: number;
    sourceB: number;
    to: number;
    _forceMeasurement?: "m0" | "m1";
};
/**
 * Search explorer for AI lookahead.
 *
 * Use apply() to try a move, examine the resulting position via view/evaluate,
 * then call undo() to restore and try the next move.
 */
interface QCExplorer {
    apply(choice: QCMoveChoice, options?: {
        forceMeasurement?: "pass" | "fail";
    }): QCExplorerResult;
    undo(): void;
    fork(count?: number): QCExplorer[];
    readonly view: QCEngineView;
    readonly depth: number;
    evaluate(): QCPositionEval;
    sample(count: number): QCSample[];
}
interface QCExplorerResult {
    explorer: QCExplorer;
    success: boolean;
    measured: boolean;
    measurementPassed?: boolean;
    measurementPassProbability?: number;
}
interface QCPositionEval {
    score: number;
    materialBalance: number;
    isCheckmate: boolean;
    isStalemate: boolean;
}
interface QCSample {
    pieces: string[];
    weight: number;
}
/** The interface every game participant implements -- human, AI, local, or remote. */
interface QCPlayer {
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
    chooseMove(view: QCEngineView, explorer: QCExplorer | null, clock: QCClock | null): Promise<QCMoveChoice>;
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
/** Time information passed to the player. */
interface QCClock {
    /** Milliseconds remaining for the current player. */
    remainingMs: number;
    /** Increment per move in milliseconds. */
    incrementMs: number;
    /** Milliseconds remaining for the opponent. */
    opponentRemainingMs: number;
}
/** Quantum state health snapshot for diagnostics. */
interface QCQuantumHealthSnapshot {
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
interface QCGameDiagnostics {
    /** Which player caused the failure. */
    faultPlayer?: "white" | "black";
    /** Fine-grained failure classification. */
    failureClass?: "player_exception" | "search_oom" | "quantum_divergence" | "execution_failure" | "execution_oom" | "timeout";
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
interface QCGameResult {
    winner: "white" | "black" | "draw";
    reason: "checkmate" | "resignation" | "timeout" | "stalemate" | "fifty_move" | "max_ply" | "agreement" | "disconnect" | "illegal_move" | "player_exception" | "oom" | "abort";
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
/** Result of applying a move through the engine. */
interface QCMoveExecutionResult {
    success: boolean;
    gameData: QChessGameData;
    moveRecord: QCMoveRecord;
    measurementText: string;
    /** Present when the move was rejected due to an impossible forced measurement. */
    error?: string;
}
/** Override from server-authoritative mode. */
interface QCMoveOverride {
    /** Force this measurement outcome instead of the local result. */
    forceMeasurement: boolean;
    measurementOutcome: boolean;
}
/** Hook for server-authoritative games (online ranked). */
interface QCServerAuthority {
    /**
     * Called after a local player's move is executed locally.
     * Send the move to the server, receive canonical result.
     * Return null to accept local result, or a MoveOverride to re-execute.
     */
    onMoveExecuted(moveString: string, ply: number, localResult: QCMoveExecutionResult): Promise<QCMoveOverride | null>;
}
interface QCMatchConfig {
    white: QCPlayer;
    black: QCPlayer;
    rules: RulesConfig;
    timeControl?: TimeControlConfig;
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
type QCMatchEvent = QCMatchMoveEvent | QCMatchMeasurementEvent | QCMatchGameOverEvent | QCMatchErrorEvent | QCMatchClockEvent;
interface QCMatchMoveEvent {
    type: "move";
    ply: number;
    color: "white" | "black";
    moveRecord: QCMoveRecord;
    gameData: QChessGameData;
    legalMoveCount?: {
        standard: number;
        splits: number;
        merges: number;
        total: number;
    };
    /** Quantum state health after this move was applied. */
    quantumHealth?: QCQuantumHealthSnapshot;
}
interface QCMatchMeasurementEvent {
    type: "measurement";
    ply: number;
    passed: boolean;
    square: number;
}
interface QCMatchGameOverEvent {
    type: "game_over";
    result: QCGameResult;
}
interface QCMatchErrorEvent {
    type: "error";
    ply: number;
    message: string;
}
interface QCMatchClockEvent {
    type: "clock";
    whiteMs: number;
    blackMs: number;
}

type MeasurementForceMode = "random" | "m0" | "m1";
declare class QCEngine {
    private gameData;
    private readonly quantum;
    private readonly rules;
    private readonly moveHistory;
    private forceMeasurement;
    private _ignoreTurnOrder;
    /** Undo stack. Each executeMove pushes an entry. */
    private undoStack;
    /** The position used to initialize this engine (for replay-based undo). */
    private initPosition;
    constructor(quantum: QuantumChessQuantumAdapter, rules: RulesConfig);
    /**
     * Initialize from game data. If the game data has a move history,
     * replays from the classical starting position to correctly reconstruct
     * quantum state. Otherwise initializes classically from the snapshot.
     */
    /**
     * Initialize from a position. This is the single entry point for all initialization.
     *
     * Two-phase replay:
     * 1. Setup moves (position.setupMoves) — build quantum state. After replay,
     *    ply resets to the FEN's value, en passant clears, fifty-move counter resets.
     *    Castling rights from setup are preserved.
     * 2. Game moves (position.history) — normal gameplay replay with ply tracking.
     *
     * The FEN's active color determines whose turn it is at game start,
     * regardless of how many setup moves there are.
     */
    initializeFromPosition(position: QChessPosition): void;
    /**
     * Replay a single move on the current game data and quantum adapter.
     * Updates classical shadow state, probabilities, and optionally the move history.
     * @param trackHistory If true, adds to position.history and moveHistory (game moves).
     *                     If false, skips history tracking (setup moves).
     */
    private replayOneMove;
    /** Build a read-only view of the current game state with all legal moves. */
    getView(ignoreTurnOrder?: boolean): QCEngineView;
    /** Get current game data (mutable -- use with care). */
    getGameData(): QChessGameData;
    /** Get a clone of the current game data. */
    cloneGameData(): QChessGameData;
    /** Get the quantum adapter. */
    getQuantum(): QuantumChessQuantumAdapter;
    /** Get the move history. */
    getMoveHistory(): readonly QCMoveRecord[];
    /** Get move history as raw move strings (for replay). */
    getMoveStrings(): string[];
    /** Check for king capture. */
    checkWinCondition(): "white_win" | "black_win" | null;
    /** Check for stalemate (no legal moves). */
    checkStalemate(): boolean;
    /** Check fifty-move rule. */
    checkFiftyMoveRule(): boolean;
    /** Set sandbox measurement forcing mode. */
    setForceMeasurement(mode: MeasurementForceMode): void;
    setIgnoreTurnOrder(ignore: boolean): void;
    /**
     * Apply a move through the quantum adapter, with forced-measurement
     * post-selection validation. If forcing produced an impossible outcome
     * (zero-norm state), rebuilds quantum state from position and returns null.
     */
    private applyQuantumMove;
    /**
     * Execute a move choice against the current game state.
     * This is the primary move execution method used by QCMatchRunner.
     */
    executeMove(choice: QCMoveChoice): QCMoveExecutionResult;
    /**
     * Undo the last move. For classical positions, restores directly.
     * For quantum positions, replays from the initial position.
     * Returns true if undo succeeded, false if nothing to undo.
     */
    undoMove(): boolean;
    /** Number of moves that can be undone. */
    get undoDepth(): number;
    /** Clear the undo stack (e.g., after committing a position). */
    clearUndoStack(): void;
    private executeStandardMove;
    private executeSplitMove;
    private executeMergeMove;
}

/**
 * Build the complete set of legal moves for the current side to move.
 * Wraps qc-core's getLegalTargets/getSplitTargets/getMergeTargets.
 */
declare function buildLegalMoveSet(gameData: QChessGameData, options?: LegalTargetOptions): QCLegalMoveSet;

/** Factory that creates a fresh QuantumChessQuantumAdapter instance. */
type QuantumAdapterFactory$1 = () => QuantumChessQuantumAdapter;

type QCMatchEventHandler = (event: QCMatchEvent) => void | Promise<void>;
/**
 * Drives a game between two QCPlayers. Manages turn order, time control,
 * win detection, and event streaming. Works for all game modes --
 * sandbox, vs_ai, online, correspondence, AI vs AI, spectate.
 */
declare class QCMatchRunner {
    private readonly config;
    private engine;
    private startingData;
    private running;
    private aborted;
    private whiteMs;
    private blackMs;
    private turnStartedAt;
    constructor(config: QCMatchConfig);
    /**
     * Run the match to completion. Initializes and runs the game loop.
     */
    run(quantum: QuantumChessQuantumAdapter, onEvent?: QCMatchEventHandler, adapterFactory?: QuantumAdapterFactory$1): Promise<QCGameResult>;
    /**
     * Initialize the engine and position. Synchronous.
     * Called by MatchBridge before the game loop so the initial board state is
     * available immediately (no await needed for display updates).
     */
    initialize(quantum: QuantumChessQuantumAdapter, config: QCMatchConfig): void;
    /** Run the game loop after initialize(). */
    runLoop(onEvent?: QCMatchEventHandler, adapterFactory?: QuantumAdapterFactory$1): Promise<QCGameResult>;
    /** Abort a running match. */
    abort(): void;
    /** Get the current engine view (for spectating). */
    getCurrentView(): QCEngineView | null;
    /** Get the current engine (for advanced integrations). */
    getEngine(): QCEngine | null;
    private buildClock;
    private endGame;
}

/**
 * StackExplorer v3: Isolated-simulation do/undo explorer for AI search.
 *
 * Each search gets its OWN engine + adapter + QuantumSimulation.
 * No shared state with the main game or other players.
 *
 * - Classical moves on classical positions: direct board update (O(1))
 * - All quantum moves (including measurements): engine.executeMove + undoMove
 *   with recorded-ops reversal. Measurements use setForceMeasurement for
 *   correct post-measurement quantum state (entanglement propagation).
 * - Dispose the simulation when the search is done.
 */

type QuantumAdapterFactory = () => QuantumChessQuantumAdapter;
declare class StackExplorer implements QCExplorer {
    private readonly engine;
    private readonly rules;
    /** Dispose callback to destroy the isolated simulation when done. */
    private readonly _dispose;
    readonly depth: number;
    private undoStack;
    private _cachedLegalMoves;
    constructor(engine: QCEngine, rules: RulesConfig, depth?: number, dispose?: () => void);
    /** Destroy the search simulation. Call after chooseMove returns. */
    dispose(): void;
    get view(): QCEngineView;
    evaluate(): QCPositionEval;
    /**
     * Collapse the current quantum state into N classical board snapshots.
     * Uses the joint probability distribution from QuantumForge to preserve
     * entanglement correlations (e.g., a split piece appears on exactly one
     * of its two squares, never both).
     */
    sample(count: number): QCSample[];
    fork(count?: number): QCExplorer[];
    /**
     * Apply a move in-place. Caller MUST call undo() after each apply().
     *
     * - Classical standard moves on classical positions: direct board update
     * - Everything else (quantum, measurement, splits, merges): engine.executeMove
     *   with recorded-ops undo. Measurements use setForceMeasurement for correct
     *   post-measurement entanglement propagation.
     */
    apply(choice: QCMoveChoice, options?: {
        forceMeasurement?: "pass" | "fail";
    }): QCExplorerResult;
    undo(): void;
    private isClassicalPosition;
    private isMeasurementMove;
    private applyClassicalMove;
}
/**
 * Create a StackExplorer with its own isolated QuantumSimulation.
 * The search engine replays the game history into the isolated sim,
 * then searches via do/undo. No shared state with the game engine.
 *
 * The returned explorer has a dispose() method — call it after
 * chooseMove returns to destroy the simulation.
 */
declare function createStackExplorer(engine: QCEngine, _startingData: QChessGameData, adapterFactory: QuantumAdapterFactory): QCExplorer;

/**
 * High-level game runner for community AI development.
 *
 * Wraps QuantumForge initialization, adapter creation, pooling, and
 * match setup into a simple API. Users never touch QuantumForge directly.
 *
 * Usage:
 *   const runner = await createGameRunner();
 *   const result = await runner.playMatch(myAI, opponentAI);
 *   console.log(result.winner);
 */

interface PlayMatchOptions {
    /** Game rules. Defaults to quantum chess (splits, merges, measurements enabled). */
    rules?: Partial<RulesConfig>;
    /** Classical only — no quantum moves. Shorthand for disabling quantum rules. */
    classicalOnly?: boolean;
    /** Starting FEN. Defaults to standard chess starting position. */
    startingFen?: string;
    /** Move history to replay before starting (for resuming games). */
    history?: string[];
    /** Maximum ply before declaring a draw. Default 500. */
    maxPly?: number;
    /** Time control (optional). */
    timeControl?: {
        initialSeconds: number;
        incrementSeconds: number;
        maxSeconds: number;
    };
    /** Delay between moves in ms (for watching AI vs AI). Default 0. */
    moveDelayMs?: number;
    /** Called for each game event (moves, clock updates, game over). */
    onEvent?: (event: QCMatchEvent) => void | Promise<void>;
}
interface GameRunner {
    /**
     * Play a match between two players. Returns the result when the game ends.
     *
     * @example
     * ```typescript
     * import { createGameRunner, PureSDKAdapter, RandomPlayer } from "@quantum-native/quantum-chess-sdk";
     *
     * const runner = await createGameRunner();
     * const result = await runner.playMatch(
     *   new RandomPlayer("my-bot"),
     *   new PureSDKAdapter("opponent", { maxDepth: 3 }),
     *   { onEvent: (e) => { if (e.type === "move") console.log(e.moveRecord.moveString); } }
     * );
     * console.log(`Winner: ${result.winner} (${result.reason})`);
     * ```
     */
    playMatch(white: QCPlayer, black: QCPlayer, options?: PlayMatchOptions): Promise<QCGameResult>;
    /** Clean up resources. Call when done with the runner. */
    dispose(): void;
}
/**
 * Create a game runner. Initializes the quantum simulation engine.
 * Call once, reuse for multiple games.
 *
 * @example
 * ```typescript
 * const runner = await createGameRunner();
 * ```
 */
declare function createGameRunner(): Promise<GameRunner>;

interface PureSDKAIOptions {
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
declare class PureSDKAdapter implements QCPlayer {
    readonly name: string;
    readonly control: "ai";
    readonly author = "Quantum Chess";
    readonly description: string;
    private readonly opts;
    private readonly tt;
    private searchDeadline;
    private nodesSearched;
    private killerMoves;
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
    } | null;
    private _branchingNodes;
    private _branchingMoves;
    constructor(name?: string, options?: PureSDKAIOptions & {
        classicalOnly?: boolean;
        quantumSearchPly?: number;
    });
    chooseMove(view: QCEngineView, explorer: QCExplorer | null, clock: QCClock | null): Promise<QCMoveChoice>;
    onGameOver(_result: QCGameResult): void;
    dispose(): void;
    /**
     * Evaluate a single root move by applying it and searching deeper.
     * Returns score from the active player's perspective (higher = better for us).
     */
    private evaluateMove;
    /**
     * Negamax with alpha-beta pruning.
     * Returns score from white's perspective.
     * `ply` is distance from root (0 = root's children, 1 = grandchildren, etc.)
     */
    private negamax;
    /**
     * Search only captures until the position is quiet (no more captures) or
     * maxQDepth is reached. Prevents the horizon effect where the engine stops
     * searching right before a piece is captured. Uses stand-pat: if the static
     * eval is already good enough, we can choose not to capture (standing pat).
     */
    private quiesce;
    /**
     * Static evaluation of a position. Returns centipawns from white's perspective.
     * Probability-weighted: a queen at 50% is worth ~450cp, not 900cp.
     */
    private staticEval;
    /** Key for identifying a move choice (for killer moves, best-move tracking). */
    /** Integer key for fast killer move matching. Encodes move type + squares into a single number. */
    private choiceKey;
    /** Order moves for root search (more info available from view). */
    private orderMoves;
    /** Move ordering for internal search nodes with probability weighting. */
    private orderMovesForSearch;
    /** Check if all probabilities are 0 or 1 (no quantum superposition). */
    private isClassicalPosition;
    private isTimeUp;
    private fallbackMove;
}

/**
 * AI that picks a uniformly random legal move each turn.
 * Useful as a baseline opponent for stress testing and benchmarking.
 */
declare class RandomPlayer implements QCPlayer {
    readonly name: string;
    readonly control: "ai";
    readonly author = "Quantum Chess";
    readonly description = "Picks a random legal move each turn.";
    readonly quantumEnabled: boolean;
    constructor(name?: string, options?: {
        quantumEnabled?: boolean;
    });
    chooseMove(view: QCEngineView): Promise<QCMoveChoice>;
    onGameOver(_result: QCGameResult): void;
    dispose(): void;
}

/**
 * AI player that communicates via HTTP POST.
 *
 * Each turn, POSTs { view, clock } to the endpoint and expects
 * a QCMoveChoice response. The AI server can be written in any language.
 *
 * HTTP API contract:
 *   POST /move
 *   Body: { view: QCEngineView, clock: QCClock | null }
 *   Response: QCMoveChoice
 */
declare class HttpPlayerAdapter implements QCPlayer {
    readonly name: string;
    readonly control: "ai";
    readonly author?: string;
    readonly description?: string;
    private readonly endpoint;
    private readonly authToken?;
    private readonly timeoutMs;
    private abortController;
    constructor(options: {
        endpoint: string;
        name: string;
        author?: string;
        description?: string;
        authToken?: string;
        timeoutMs?: number;
    });
    chooseMove(view: QCEngineView, _explorer: QCExplorer | null, clock: QCClock | null): Promise<QCMoveChoice>;
    dispose(): void;
}

/**
 * Loads a QCPlayer module inside a dedicated browser worker.
 *
 * This is the default browser execution model for custom module AIs: the AI's
 * search runs off the UI thread and receives a worker-local QCExplorer backed
 * by its own QuantumForge port.
 */
declare class ModuleWorkerPlayer implements QCPlayer {
    private readonly url;
    readonly control: "ai";
    name: string;
    author?: string;
    description?: string;
    quantumEnabled?: boolean;
    private worker;
    private initialized;
    constructor(url: string, fallbackName?: string);
    initialize(): Promise<void>;
    chooseMove(view: QCEngineView, _explorer: QCExplorer | null, clock: QCClock | null): Promise<QCMoveChoice>;
    onOpponentMove(move: QCMoveRecord, view: QCEngineView): void;
    onGameOver(result: QCGameResult): void;
    dispose(): void;
    private request;
}

/**
 * AI player that runs in a Web Worker.
 *
 * The worker must listen for messages of the form:
 *   { type: "chooseMove", view: QCEngineView, clock: QCClock | null }
 *
 * And respond with:
 *   QCMoveChoice
 */
declare class WorkerPlayerAdapter implements QCPlayer {
    readonly name: string;
    readonly control: "ai";
    readonly author?: string;
    readonly description?: string;
    private worker;
    private readonly workerUrl;
    constructor(options: {
        workerUrl: string | URL;
        name: string;
        author?: string;
        description?: string;
    });
    initialize(): Promise<void>;
    chooseMove(view: QCEngineView, _explorer: QCExplorer | null, clock: QCClock | null): Promise<QCMoveChoice>;
    onGameOver(result: QCGameResult): void;
    dispose(): void;
}

/**
 * AI player with a persistent WebSocket connection.
 * Lower latency than HTTP for repeated interactions.
 * Supports pondering (server can pre-compute during opponent's turn).
 *
 * Protocol:
 *   Client → Server: { type: "chooseMove", requestId: number, view, clock }
 *   Server → Client: { requestId: number, choice: QCMoveChoice }
 *
 *   Client → Server: { type: "opponentMove", move, view }
 *   Client → Server: { type: "gameOver", result }
 */
declare class WebSocketPlayerAdapter implements QCPlayer {
    readonly name: string;
    readonly control: "ai";
    readonly author?: string;
    readonly description?: string;
    private ws;
    private readonly url;
    private pending;
    private requestId;
    constructor(options: {
        url: string;
        name: string;
        author?: string;
        description?: string;
    });
    initialize(): Promise<void>;
    chooseMove(view: QCEngineView, _explorer: QCExplorer | null, clock: QCClock | null): Promise<QCMoveChoice>;
    onOpponentMove(move: QCMoveRecord, view: QCEngineView): void;
    onGameOver(result: QCGameResult): void;
    dispose(): void;
}

/**
 * Callback interface for the board UI to receive move-related events.
 */
interface LocalHumanBoardUI {
    /** Called when it's this player's turn. Show legal moves and enable interaction. */
    onTurnStart(legalMoves: QCLegalMoveSet): void;
    /** Called when the player's turn ends (move submitted or game over). */
    onTurnEnd(): void;
    /** Called when a queued premove was invalid in the resulting position. */
    onPremoveInvalid?(): void;
}
/**
 * A local human player. Bridges board UI interactions to the QCPlayer interface.
 *
 * When chooseMove() is called (it's the player's turn), the board UI is notified
 * and the promise waits until submitMove() is called from a board click handler.
 */
declare class LocalHumanPlayer implements QCPlayer {
    readonly name: string;
    readonly control: "human_local";
    private pendingResolve;
    private boardUI;
    /** Queued premove to auto-submit when chooseMove is called. */
    private queuedPremove;
    constructor(name: string);
    /** Connect a board UI to receive turn notifications. */
    setBoardUI(boardUI: LocalHumanBoardUI): void;
    chooseMove(view: QCEngineView, _explorer: QCExplorer | null, _clock: QCClock | null): Promise<QCMoveChoice>;
    /**
     * Called by the board UI when the human completes a move gesture.
     * Resolves the pending chooseMove() promise.
     */
    submitMove(choice: QCMoveChoice): void;
    /** Whether a move is currently expected (it's this player's turn). */
    isAwaitingMove(): boolean;
    /** Queue a premove to auto-submit when it becomes this player's turn. */
    queuePremove(choice: QCMoveChoice): void;
    /** Clear any queued premove. */
    clearPremove(): void;
    /** Whether a premove is currently queued. */
    hasPremove(): boolean;
    /** Check if a premove choice matches any legal move in the current position. */
    private isPremoveLegal;
    /** Cancel any pending move (e.g. game aborted). */
    cancelPendingMove(): void;
    onOpponentMove(move: QCMoveRecord, view: QCEngineView): void;
    onGameOver(result: QCGameResult): void;
    dispose(): void;
}

/**
 * Abstraction over the network transport for remote game connections.
 * Implemented by OnlineGameSession (WebSocket) and CorrespondenceGameSession (Convex).
 */
interface GameConnection {
    /** Wait for the next move from the remote player. */
    waitForMove(): Promise<QCMoveChoice>;
    /** Send a game result to the remote. */
    sendGameResult?(result: QCGameResult): void;
    /** Cancel any pending wait. */
    cancel?(): void;
}
/**
 * A remote human player. The chooseMove() promise resolves when the
 * opponent's move arrives over the network.
 */
declare class RemoteHumanPlayer implements QCPlayer {
    readonly name: string;
    readonly control: "human_remote";
    private readonly connection;
    constructor(name: string, connection: GameConnection);
    chooseMove(_view: QCEngineView, _explorer: QCExplorer | null, _clock: QCClock | null): Promise<QCMoveChoice>;
    onGameOver(result: QCGameResult): void;
    dispose(): void;
}

/**
 * Callbacks from the match runner back to the host UI.
 * This is the bridge between the SDK's game loop and the existing
 * AppEngine state management + UI rendering.
 */
interface MatchBridgeCallbacks {
    /** Called on every move. Update AppEngine state, play sounds, etc. */
    onMove(event: QCMatchMoveEvent): void | Promise<void>;
    /** Called when the game ends. Dispatch END_GAME, navigate to game over screen. */
    onGameOver(result: QCGameResult): void;
    /** Called on clock update. Update timer display. */
    onClockUpdate(whiteMs: number, blackMs: number): void;
    /** Called on error. Show toast or status text. */
    onError(message: string): void;
}
/**
 * Manages the lifecycle of a QCMatchRunner within a GamePlayScreen.
 * Handles starting, event bridging, and cleanup.
 *
 * Usage in GamePlayScreen.mount():
 *   this.matchBridge = new MatchBridge(config, callbacks);
 *   this.matchBridge.start(quantum);
 *
 * Usage in GamePlayScreen.dispose():
 *   this.matchBridge?.stop();
 */
declare class MatchBridge {
    private readonly config;
    private readonly callbacks;
    private runner;
    private runPromise;
    constructor(config: QCMatchConfig, callbacks: MatchBridgeCallbacks);
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
    start(quantum: QuantumChessQuantumAdapter, adapterFactory?: QuantumAdapterFactory$1): QChessGameData | null;
    /** Abort the match. */
    stop(): void;
    /** Get the underlying runner (for spectating, getting current view). */
    getRunner(): QCMatchRunner | null;
    /** Whether the match is currently running. */
    get isRunning(): boolean;
}

/**
 * Description of an AI source to load.
 */
type AISource = {
    type: "module";
    url: string;
    name?: string;
    runInWorker?: boolean;
} | {
    type: "http";
    url: string;
    name: string;
    authToken?: string;
    timeoutMs?: number;
} | {
    type: "websocket";
    url: string;
    name: string;
} | {
    type: "worker";
    url: string;
    name: string;
};
/**
 * Load a custom AI player from the specified source.
 *
 * - `module`: Loads an ES module that default-exports a QCPlayer. In browsers,
 *   this runs in a dedicated Web Worker by default so AI search does not block
 *   timers or UI interaction.
 * - `http`: Creates an HttpPlayerAdapter that POSTs to the given URL.
 * - `websocket`: Creates a WebSocketPlayerAdapter with persistent connection.
 * - `worker`: Creates a WorkerPlayerAdapter running in a Web Worker.
 */
declare function loadCustomAI(source: AISource): Promise<QCPlayer>;

/**
 * Validate that an object has the required QCPlayer shape.
 * Returns an error message if invalid, null if valid.
 */
declare function validatePlayerShape(player: unknown): string | null;

/**
 * Reusable QuantumForge port that tracks all created properties so they
 * can be reset between games. Without this, every game creates 64 new
 * quantum properties (plus ancillas) and the WASM heap fills up.
 */

interface PoolingPort extends QuantumPrimitivePort {
    /** Reset all tracked properties to value 0 (ready for new game). */
    resetAll(): void;
    /** Release specific handles — mark them as not in use for reuse. */
    releaseHandles(handles: unknown[]): void;
    /** Number of properties currently tracked. */
    count(): number;
}
/**
 * Wraps a real QuantumForge port and tracks all createProperty calls.
 * On resetAll(), measures each property (collapses superposition) and
 * cycles back to 0. Subsequent createProperty calls REUSE reset
 * properties instead of allocating new ones, keeping the total qubit
 * count bounded across games.
 *
 * Without reuse, each game creates ~10-20 new qubits. After 500 games
 * QuantumForge has 5000+ qubits in its state vector and OOMs.
 */
declare function createPoolingPort(realPort: QuantumPrimitivePort): PoolingPort;

interface QCTournamentConfig {
    players: QCPlayer[];
    format: "round_robin" | "swiss" | "single_elimination" | "double_elimination";
    rules: RulesConfig;
    timeControl: TimeControlConfig;
    /** Games per match (default 2: one as white, one as black). */
    gamesPerMatch?: number;
    /** Max concurrent matches (default 1). */
    concurrentMatches?: number;
    /** Max ply per game (default 500). */
    maxPly?: number;
}
interface QCTournamentMatchResult {
    white: string;
    black: string;
    result: QCGameResult;
}
interface QCStanding {
    player: string;
    wins: number;
    losses: number;
    draws: number;
    score: number;
    tiebreak: number;
}
interface QCTournamentResult {
    standings: QCStanding[];
    matches: QCTournamentMatchResult[];
    format: string;
    rounds: number;
}
type QCTournamentEvent = {
    type: "round_start";
    round: number;
    totalRounds: number;
} | {
    type: "match_start";
    round: number;
    white: string;
    black: string;
} | {
    type: "match_end";
    round: number;
    result: QCTournamentMatchResult;
} | {
    type: "round_end";
    round: number;
    standings: QCStanding[];
} | {
    type: "tournament_end";
    result: QCTournamentResult;
};

type QCTournamentEventHandler = (event: QCTournamentEvent) => void;
/**
 * Runs a tournament between multiple QCPlayers.
 * Supports round-robin and Swiss formats.
 */
declare class QCTournamentRunner {
    private readonly config;
    private aborted;
    constructor(config: QCTournamentConfig);
    /**
     * Run the tournament to completion.
     * @param adapterFactory - Creates fresh quantum adapters for each match.
     * @param onEvent - Optional event handler.
     */
    run(adapterFactory: QuantumAdapterFactory$1, onEvent?: QCTournamentEventHandler): Promise<QCTournamentResult>;
    abort(): void;
    private runRoundRobin;
    private runSwiss;
    /**
     * Play a match between two players (one or more games with color alternation).
     */
    private playMatch;
}

/**
 * Compute standings from match results.
 * Score: W=1, D=0.5, L=0
 * Tiebreak: Buchholz (sum of opponents' scores)
 */
declare function computeStandings(playerNames: string[], matches: QCTournamentMatchResult[]): QCStanding[];

/**
 * Generate round-robin pairings for N players.
 * Each pair plays once (or twice if gamesPerMatch > 1 with reversed colors).
 * Returns an array of rounds, each round being an array of [whiteIdx, blackIdx] pairs.
 */
declare function roundRobinPairings(playerCount: number): [number, number][][];
/**
 * Generate Swiss pairings for one round based on current standings.
 * Sort by score, pair top half with bottom half within each score group.
 * Returns [whiteIdx, blackIdx] pairs.
 */
declare function swissPairing(standings: QCStanding[], playerNames: string[], previousPairings: Set<string>): [number, number][];
/** Number of rounds for Swiss format given player count. */
declare function swissRoundCount(playerCount: number): number;

export { type AISource, BOARD_SQUARES, CLASSICAL_START_FEN, type DisposablePort, type EntanglementVisualLink, FIFTY_MOVE_PLY_LIMIT, type GameConnection, type GameModeConfig, type GameModeConfigOverrides, type GameModeId, type GameRunner, HttpPlayerAdapter, type LegalTargetOptions, type LocalHumanBoardUI, LocalHumanPlayer, MatchBridge, type MatchBridgeCallbacks, type MatchmakingType, type MeasurementImpactVisual, ModuleWorkerPlayer, MoveCode, type MoveRecordLike, MoveType, MoveVariant, type ObjectiveType, type OperationStep, PARITY_MATRIX, PROBABILITY_EPSILON, type ParityFeatureBucket, type ParityFeatureBucketId, type PgnExportOptions, type PgnGame, type PgnHeaders, type PgnMoveEntry, type PgnResult, type PieceColor, type PlayMatchOptions, type PlayerConfig, type PlayerControl, type PlayerSide, type PoolingPort, type ProbabilityRingVisual, type PureSDKAIOptions, PureSDKAdapter, type QCClock, QCEngine, type QCEngineView, type QCExplorer, type QCExplorerResult, type QCGameResult, type QCLegalMoveSet, type QCMatchClockEvent, type QCMatchConfig, type QCMatchErrorEvent, type QCMatchEvent, type QCMatchGameOverEvent, type QCMatchMeasurementEvent, type QCMatchMoveEvent, QCMatchRunner, type QCMergeOption, type QCMoveChoice, type QCMoveExecutionResult, type QCMoveOption, type QCMoveOverride, type QCMoveRecord, type QCPlayer, type QCPositionEval, type QCSample, type QCServerAuthority, type QCSplitOption, type QCStanding, type QCTournamentConfig, type QCTournamentEvent, type QCTournamentMatchResult, type QCTournamentResult, QCTournamentRunner, type QChessBoardState, type QChessGameData, type QChessMove, type QChessPosition, type QuantumAdapterFactory, QuantumChessQuantumAdapter, type QuantumForgeLikeModule, type QuantumHandle, type QuantumMoveResult, type QuantumPredicate, type QuantumPrimitivePort, type QuantumProbability, type QuantumRelationshipProvider, type QuantumVisualAdapter, type QuantumVisualCapabilities, type QuantumVisualSnapshot, type QuantumVisualSnapshotOptions, RandomPlayer, type RecordedOp, type ReducedDensityMatrixEntry, type RelativePhaseVisualLink, RemoteHumanPlayer, type RulesConfig, type SquareVisualTelemetry, StackExplorer, type StartingPositionType, type TimeControlConfig, type VariantDefinition, WebSocketPlayerAdapter, WorkerPlayerAdapter, applyClassicalShadowMove, applyStandardMove, assertValidGameModeConfig, buildLegalMoveSet, buildOperationPlan, buildPgn, buildStandardMoveFromSquares, classicalBoardToFen, clearCastlingRightsForSquare, clearCastlingRightsFromMove, clearSandboxBoard, cloneGameData, computeMergeTargets, computeStandings, createClassicalStartGameData, createEmptyGameData, createGameModeConfig, createGameRunner, createIsolatedPort, createPoolingPort, createQuantumForgePort, createQuantumVisualSnapshot, createStackExplorer, detectKingCapture, exportPgn, fenToGameData, formatMoveString, gameDataToPositionString, getFile, getGameModePreset, getLegalTargets, getMergeTargets, getPieceColor, getRank, getSplitTargets, indexToSquareName, isBlackPiece, isCurrentTurnPiece, isEnemyPiece, isFiftyMoveDraw, isLegalStandardMove, isOnBoard, isWhitePiece, listGameModePresets, loadCustomAI, moveRecordsToPgnEntries, parseMoveString, parsePgn, pgnToMoveStrings, pieceForMoveSource, placeSandboxPiece, promotedOrSourcePiece, prunePiecesByProbabilities, relocateSandboxPiece, remapPieceSymbol, roundRobinPairings, selectPiece, squareNameToIndex, swissPairing, swissRoundCount, updateFiftyMoveCounter, validateGameModeConfig, validatePlayerShape };
