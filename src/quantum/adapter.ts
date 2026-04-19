import { getFile, getRank, isBlackPiece, MoveType, MoveVariant, type QChessGameData, type QChessMove } from "../core";
import type { OperationStep, QuantumHandle, QuantumMoveResult, QuantumPredicate, QuantumPrimitivePort, ReducedDensityMatrixEntry } from "../core";
import type { EntanglementVisualLink, RelativePhaseVisualLink } from "./visualTelemetry";

export function buildOperationPlan(move: QChessMove): OperationStep[] {
  switch (move.type) {
    case MoveType.SplitJump:
    case MoveType.SplitSlide:
      return [
        { op: "i_swap", squares: [move.square1, move.square2], fraction: 0.5 },
        { op: "i_swap", squares: [move.square1, move.square3], fraction: 1.0 }
      ];

    case MoveType.MergeJump:
    case MoveType.MergeSlide:
      return [
        { op: "i_swap", squares: [move.square3, move.square2], fraction: -1.0 },
        { op: "i_swap", squares: [move.square3, move.square1], fraction: -0.5 }
      ];

    case MoveType.Jump:
    case MoveType.Slide:
      return move.variant === MoveVariant.Basic
        ? [{ op: "i_swap", squares: [move.square1, move.square2], fraction: 1.0 }]
        : [
            { op: "measure", squares: [move.square1] },
            { op: "measure", squares: [move.square2] }
          ];

    case MoveType.PawnCapture:
    case MoveType.PawnEnPassant:
      return [{ op: "measure", squares: [move.square1] }];

    default:
      return [{ op: "i_swap", squares: [move.square1, move.square2], fraction: 1.0 }];
  }
}

/** Recorded quantum operation for undo. */
export interface RecordedOp {
  type: "iSwap" | "cycle" | "swap" | "clock";
  handles: QuantumHandle[];
  fraction?: number;
  predicates?: QuantumPredicate[];
}

export class QuantumChessQuantumAdapter {
  private readonly squareProps = new Map<number, QuantumHandle>();
  /** Tracks which squares are classically occupied. Used for lazy property creation. */
  private readonly classicalOccupied = new Set<number>();
  private readonly dimension: number;
  private readonly port: QuantumPrimitivePort;
  private ancillaPool: QuantumHandle[] = [];

  /** Operation recording for undo. When enabled, all gate ops are logged. */
  private _recording = false;
  private _recordedOps: RecordedOp[] = [];

  /** All handles ever created by this adapter (for orphan detection during undo). */
  private readonly _allHandles = new Set<QuantumHandle>();

  /** Property allocation tracking for diagnostics. */
  private readonly _stats = {
    /** Total properties created (lifetime). */
    created: 0,
    /** Total properties destroyed via destroyProperty (lifetime). */
    destroyed: 0,
    /** Current live property count (created - destroyed). */
    get live() { return this.created - this.destroyed; },
    /** Peak concurrent live properties. */
    peakLive: 0,
    /** Breakdown of created handles by purpose. */
    createdByType: { square: 0, captureAncilla: 0, conditionFlag: 0, measureAncilla: 0 },
  };

  /**
   * Deferred iSwap phase counts per quantum handle.
   * When a superposed piece makes a standard move to an empty square with
   * no predicates, the iSwap is deferred: instead of calling port.iSwap(),
   * we move the handle in squareProps and increment the phase count.
   * Each deferred iSwap accumulates a phase of i (= clock(0.5)).
   * Flushed before any real quantum interaction with the handle.
   */
  private readonly pendingPhases = new Map<QuantumHandle, number>();

  // --- Recording-aware gate wrappers ---
  // These record operations when _recording is true, for later undo.
  private _iSwap(h1: QuantumHandle, h2: QuantumHandle, fraction: number, predicates?: QuantumPredicate[]): void {
    if (this._recording) this._recordedOps.push({ type: "iSwap", handles: [h1, h2], fraction, predicates });
    this.port.iSwap(h1, h2, fraction, predicates);
  }
  private _cycle(h: QuantumHandle, fraction?: number, predicates?: QuantumPredicate[]): void {
    if (this._recording) this._recordedOps.push({ type: "cycle", handles: [h], fraction, predicates });
    this.port.cycle(h, fraction, predicates);
  }
  private _swap(h1: QuantumHandle, h2: QuantumHandle, predicates?: QuantumPredicate[]): void {
    if (this._recording) this._recordedOps.push({ type: "swap", handles: [h1, h2], predicates });
    this.port.swap(h1, h2, predicates);
  }
  private _clock(h: QuantumHandle, fraction: number, predicates?: QuantumPredicate[]): void {
    if (this._recording) this._recordedOps.push({ type: "clock", handles: [h], fraction, predicates });
    this.port.clock(h, fraction, predicates);
  }

  private _trackCreate(type: keyof typeof this._stats.createdByType): void {
    this._stats.created++;
    this._stats.createdByType[type]++;
    if (this._stats.live > this._stats.peakLive) this._stats.peakLive = this._stats.live;
  }

  private _trackDestroy(): void {
    this._stats.destroyed++;
  }

  /** Get property allocation stats for diagnostics. */
  getPropertyStats(): typeof this._stats {
    return this._stats;
  }

  /** Check if the quantum state is near the OOM limit.
   *  Returns true if state_vector_size on any tracked property exceeds the threshold.
   *  Call before search moves to abort early instead of crashing WASM. */
  isNearOOM(threshold: number = 50000): boolean {
    for (const prop of this.squareProps.values()) {
      const h = prop as any;
      if (typeof h.state_vector_size === "function") {
        try { if (h.state_vector_size() > threshold) return true; } catch { return true; }
      }
      break; // only need to check one — all in same shared state
    }
    return false;
  }

  /** Start recording quantum operations. Call before executeMove. */
  startRecording(): void { this._recording = true; this._recordedOps = []; }

  /** Stop recording and return the recorded operations. */
  stopRecording(): RecordedOp[] { this._recording = false; const ops = this._recordedOps; this._recordedOps = []; return ops; }

  /**
   * Undo recorded operations by applying their inverses in reverse order.
   * iSwap(a,b,f) → iSwap(a,b,-f). cycle(h,f) → cycle(h,-f). swap is self-inverse.
   */
  undoRecordedOps(ops: RecordedOp[]): void {
    for (let i = ops.length - 1; i >= 0; i--) {
      const op = ops[i];
      try {
        switch (op.type) {
          case "iSwap":
            this.port.iSwap(op.handles[0], op.handles[1], -(op.fraction ?? 1.0), op.predicates);
            break;
          case "cycle":
            this.port.cycle(op.handles[0], -(op.fraction ?? 1.0), op.predicates);
            break;
          case "swap":
            this.port.swap(op.handles[0], op.handles[1], op.predicates);
            break;
          case "clock":
            this.port.clock(op.handles[0], -(op.fraction ?? 1.0), op.predicates);
            break;
        }
      } catch {
        // If an inverse op fails (e.g., property was destroyed), continue
        // undoing the remaining ops to restore as much state as possible.
      }
    }
  }

  /** Snapshot of adapter bookkeeping state for undo. */
  /** True if there are no quantum properties — position is fully classical. */
  isFullyClassical(): boolean {
    return this.squareProps.size === 0;
  }

  captureBookkeeping(): {
    squareProps: Map<number, QuantumHandle>;
    classicalOccupied: Set<number>;
    pendingPhases: Map<QuantumHandle, number>;
    ancillaPool: QuantumHandle[];
    handleCount: number;
  } {
    return {
      squareProps: new Map(this.squareProps),
      classicalOccupied: new Set(this.classicalOccupied),
      pendingPhases: new Map(this.pendingPhases),
      ancillaPool: [...this.ancillaPool],
      handleCount: this._allHandles.size,
    };
  }

  /** Restore adapter bookkeeping state from a snapshot.
   *  Destroys any quantum handles created since the snapshot (transient search
   *  properties) to prevent state vector growth during do/undo search. */
  restoreBookkeeping(snapshot: ReturnType<QuantumChessQuantumAdapter["captureBookkeeping"]>): void {
    // Restore bookkeeping maps
    this.squareProps.clear();
    for (const [k, v] of snapshot.squareProps) this.squareProps.set(k, v);
    this.classicalOccupied.clear();
    for (const v of snapshot.classicalOccupied) this.classicalOccupied.add(v);
    this.pendingPhases.clear();
    for (const [k, v] of snapshot.pendingPhases) this.pendingPhases.set(k, v);
    this.ancillaPool = [...snapshot.ancillaPool];

    // Destroy handles created since the snapshot to free state vector memory.
    // _allHandles is append-only, so handles added after snapshot.handleCount are transient.
    if (this._allHandles.size > snapshot.handleCount && this.port.destroyProperty) {
      // Factorize separable sub-states first — after gate reversal, undone handles
      // are mathematically separable but may still be in a SharedState. Factorizing
      // makes destroyProperty a clean removal (no measurement/collapse needed).
      const fas = (this.port as any).factorizeAllSeparable;
      if (typeof fas === "function") { try { fas(); } catch { /* QF internal error */ } }

      const handles = [...this._allHandles];
      for (let i = snapshot.handleCount; i < handles.length; i++) {
        const h = handles[i] as any;
        if (typeof h.is_valid === "function" && !h.is_valid()) continue;
        try { this.port.destroyProperty!(handles[i]); this._trackDestroy(); } catch { /* already invalid */ }
      }
      const keep = handles.slice(0, snapshot.handleCount);
      this._allHandles.clear();
      for (const h of keep) this._allHandles.add(h);
    }
  }

  constructor(port: QuantumPrimitivePort, options: { dimension?: number } = {}) {
    this.port = port;
    this.dimension = options.dimension ?? 2;
  }

  clear(): void {
    // Destroy individual properties to factorize qudits from the state vector.
    if (typeof this.port.destroyProperty === "function") {
      // Destroy individual properties, factorizing qudits from state vector.
      for (const [_sq, prop] of this.squareProps) {
        this.port.destroyProperty!(prop);
      }
      for (const prop of this.ancillaPool) {
        this.port.destroyProperty!(prop);
      }
    }
    // Without destroyProperty, properties are simply abandoned (memory leak).

    this.squareProps.clear();
    this.classicalOccupied.clear();
    this.ancillaPool = [];
    this.pendingPhases.clear();
  }

  hasSquareProperty(square: number): boolean {
    return this.getExistenceProbability(square) > 1e-6;
  }

  /**
   * Initialize the quantum simulator from a classical piece layout.
   * Lazily tracks occupied squares without creating quantum properties.
   * Properties are created on demand when a square participates in a quantum operation.
   *
   * Only accepts a pieces array -- no game data, no probabilities, no history.
   * This ensures the caller cannot accidentally pass a quantum snapshot.
   * To reconstruct a position with quantum state, replay moves via QCEngine.
   */
  initializeClassical(pieces: string[]): void {
    this.clear();
    for (let square = 0; square < 64; square += 1) {
      if (pieces[square] !== ".") {
        this.classicalOccupied.add(square);
      }
    }
  }

  /**
   * Ensure a quantum property exists for the given square.
   * If none exists, creates one and initializes it to |1> for occupied or |0> for empty.
   */
  ensureSquareProp(square: number): QuantumHandle {
    const existing = this.squareProps.get(square);
    if (existing) {
      // Flush any deferred phases before returning — the caller is about
      // to do a real quantum operation with this handle.
      this.flushPendingPhase(existing);
      return existing;
    }
    // Reuse from ancilla pool if available (these are measured + cycled to |0⟩).
    // With destroyProperty support, the pool will be empty (destroyed on clear),
    // so this only helps for within-game ancilla recycling.
    // Reuse from ancilla pool, but verify the handle is still valid
    let prop: QuantumHandle | undefined;
    while (this.ancillaPool.length > 0) {
      const candidate = this.ancillaPool.pop()!;
      // Check validity — destroyed properties from previous simulations must be skipped
      const isValid = candidate && typeof (candidate as any).is_valid === "function"
        ? (candidate as any).is_valid()
        : candidate != null;
      if (isValid) { prop = candidate; break; }
    }
    if (!prop) {
      prop = this.port.createProperty(this.dimension);
      this._allHandles.add(prop);
      this._trackCreate("square");
    }
    this.squareProps.set(square, prop);
    if (this.classicalOccupied.has(square)) {
      this._cycle(prop);
    }
    return prop;
  }

  /**
   * Check if a move is entirely classical — source, destination, and path
   * are all classical (no quantum properties). Basic variant only (no
   * measurement needed). For these moves, we can skip QuantumForge
   * entirely and just update classical tracking.
   */
  private isClassicalMove(move: QChessMove): boolean {
    // Only Basic variant is measurement-free
    if (move.variant !== MoveVariant.Basic) return false;

    // Splits and merges always create/destroy quantum state
    if (move.type === MoveType.SplitJump || move.type === MoveType.SplitSlide ||
        move.type === MoveType.MergeJump || move.type === MoveType.MergeSlide) return false;

    // Source must be classical
    if (this.squareProps.has(move.square1)) return false;
    if (!this.classicalOccupied.has(move.square1)) return false;

    // Destination must be classical (empty or occupied)
    if (this.squareProps.has(move.square2)) return false;

    // For slides: all path squares must be classical AND empty
    // (a classically occupied path square blocks the slide)
    if (move.type === MoveType.Slide) {
      const pathSquares = this.getPathSquaresExclusive(move.square1, move.square2);
      for (const sq of pathSquares) {
        if (this.squareProps.has(sq)) return false;
        if (this.classicalOccupied.has(sq)) return false; // blocked
      }
    }

    // For castling: rook, path must be classical AND empty (path blocks castle)
    if (move.type === MoveType.KingSideCastle) {
      const rookSq = move.square1 + 3;
      const f1 = move.square1 + 1;
      const g1 = move.square1 + 2;
      if (this.squareProps.has(rookSq) || this.squareProps.has(f1) || this.squareProps.has(g1)) return false;
      if (this.classicalOccupied.has(f1) || this.classicalOccupied.has(g1)) return false;
    }
    if (move.type === MoveType.QueenSideCastle) {
      const rookSq = move.square1 - 4;
      const d1 = move.square1 - 1;
      const c1 = move.square1 - 2;
      const b1 = move.square1 - 3;
      if (this.squareProps.has(rookSq) || this.squareProps.has(d1) ||
          this.squareProps.has(c1) || this.squareProps.has(b1)) return false;
      // b-file must be empty (queen-side castle is controlled by this)
      if (this.classicalOccupied.has(b1)) return false;
      // Path (d1, c1) must be empty
      if (this.classicalOccupied.has(d1) || this.classicalOccupied.has(c1)) return false;
    }

    // For en passant: captured pawn must be classical and present
    if (move.type === MoveType.PawnEnPassant && move.square3 >= 0) {
      if (this.squareProps.has(move.square3)) return false;
      if (!this.classicalOccupied.has(move.square3)) return false;
    }

    return true;
  }

  /**
   * Apply a fully classical move without any QuantumForge calls.
   * Updates only the classicalOccupied tracking.
   */
  private applyClassicalMoveDirectly(move: QChessMove): QuantumMoveResult {
    switch (move.type) {
      case MoveType.Jump:
      case MoveType.Slide:
      case MoveType.PawnCapture:
        // Source moves to destination. Destination is captured (removed).
        this.classicalOccupied.delete(move.square1);
        this.classicalOccupied.delete(move.square2); // clear captured piece if any
        this.classicalOccupied.add(move.square2);    // piece arrives
        return { applied: true, measured: false };

      case MoveType.PawnEnPassant:
        this.classicalOccupied.delete(move.square1);
        this.classicalOccupied.add(move.square2);
        if (move.square3 >= 0) this.classicalOccupied.delete(move.square3); // captured pawn
        return { applied: true, measured: false };

      case MoveType.KingSideCastle:
        // King: square1 → square1+2, Rook: square1+3 → square1+1
        this.classicalOccupied.delete(move.square1);
        this.classicalOccupied.add(move.square1 + 2);
        this.classicalOccupied.delete(move.square1 + 3);
        this.classicalOccupied.add(move.square1 + 1);
        return { applied: true, measured: false };

      case MoveType.QueenSideCastle:
        // King: square1 → square1-2, Rook: square1-4 → square1-1
        this.classicalOccupied.delete(move.square1);
        this.classicalOccupied.add(move.square1 - 2);
        this.classicalOccupied.delete(move.square1 - 4);
        this.classicalOccupied.add(move.square1 - 1);
        return { applied: true, measured: false };

      default:
        // Fallback: treat as simple swap
        this.classicalOccupied.delete(move.square1);
        this.classicalOccupied.add(move.square2);
        return { applied: true, measured: false };
    }
  }

  applyMove(move: QChessMove): QuantumMoveResult {
    // Fast path: purely classical moves skip QuantumForge entirely.
    // No qubit allocation, no iSwap, no measurement. Just update tracking.
    if (this.isClassicalMove(move)) {
      return this.applyClassicalMoveDirectly(move);
    }

    let result: QuantumMoveResult;
    switch (move.type) {
      case MoveType.Jump:
        result = this.applyJump(move); break;
      case MoveType.Slide:
        result = this.applySlide(move); break;
      case MoveType.SplitJump:
        result = this.applySplitJump(move); break;
      case MoveType.SplitSlide:
        result = this.applySplitSlide(move); break;
      case MoveType.MergeJump:
        result = this.applyMergeJump(move); break;
      case MoveType.MergeSlide:
        result = this.applyMergeSlide(move); break;
      case MoveType.PawnCapture:
        result = this.applyPawnCapture(move); break;
      case MoveType.PawnEnPassant:
        result = this.applyEnPassant(move); break;
      case MoveType.KingSideCastle:
        result = this.applyKingSideCastle(move); break;
      case MoveType.QueenSideCastle:
        result = this.applyQueenSideCastle(move); break;
      default:
        this.swapSquares(move.square1, move.square2);
        result = { applied: true, measured: false };
    }
    // After measurement events, check all quantum squares for collapse.
    // A measurement can disentangle distant squares, making them
    // deterministic (probability ~0 or ~1). Collapsing these frees
    // qubits back to the ancilla pool, preventing OOM in long games.
    if (result.measured) {
      this.collapseDeterministicSquares();
    }
    return result;
  }

  /**
   * Scan all quantum-tracked squares and collapse any that are now
   * deterministic (probability > 0.999 or < 0.001) back to classical.
   * The freed quantum property handle goes to the ancilla pool for reuse.
   */
  private collapseDeterministicSquares(): void {
    const toCollapse: number[] = [];
    for (const [square, prop] of this.squareProps) {
      const result = this.port.probabilities([prop]);
      const p1 = result.find((e) => e.qudit_values[0] === 1)?.probability ?? 0;
      if (p1 > 0.999 || p1 < 0.001) {
        toCollapse.push(square);
      }
    }
    for (const square of toCollapse) {
      const prop = this.squareProps.get(square)!;
      // Flush any deferred phases before measuring
      this.flushPendingPhase(prop);
      const [value] = this.port.measure([prop]);
      this.pendingPhases.delete(prop);
      this.squareProps.delete(square);
      // Pool for reuse, don't destroy — handle may be restored by undo.
      if (value !== 0) this._cycle(prop);
      this.ancillaPool.push(prop);
      // Track as classical
      if (value === 1) {
        this.classicalOccupied.add(square);
      } else {
        this.classicalOccupied.delete(square);
      }
    }
  }

  getExistenceProbability(square: number): number {
    const prop = this.squareProps.get(square);
    if (!prop) {
      // No quantum property -- square is still in its classical state
      return this.classicalOccupied.has(square) ? 1.0 : 0.0;
    }
    const result = this.port.probabilities([prop]);
    const oneState = result.find((entry) => entry.qudit_values[0] === 1);
    return oneState?.probability ?? 0;
  }

  /** Sum of all square existence probabilities. A valid state has ~16 at game start. Near-zero means post-selection collapsed the state. */
  getTotalProbability(): number {
    let total = 0;
    // Count classical occupied squares that have no quantum property
    for (const square of this.classicalOccupied) {
      if (!this.squareProps.has(square)) {
        total += 1;
      }
    }
    // Add quantum property probabilities
    for (const square of this.squareProps.keys()) {
      total += this.getExistenceProbability(square);
    }
    return total;
  }

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
    createdByType: { square: number; captureAncilla: number; conditionFlag: number; measureAncilla: number };
    destroyed: number;
  } {
    let superpositionSquares = 0;
    for (const square of this.squareProps.keys()) {
      const p = this.getExistenceProbability(square);
      if (p > 0.001 && p < 0.999) superpositionSquares++;
    }
    // QuantumForge >= 1.6.0: get state vector size from first tracked property
    let stateVectorSize: number | undefined;
    let activeQudits: number | undefined;
    const firstProp = this.squareProps.values().next().value as any;
    if (firstProp?.state_vector_size) {
      try {
        stateVectorSize = firstProp.state_vector_size();
        activeQudits = firstProp.num_active_qudits();
      } catch { /* pre-1.6.0 */ }
    }
    return {
      propertyCount: this.squareProps.size,
      ancillaCount: this.ancillaPool.length,
      totalProbability: this.getTotalProbability(),
      superpositionSquares,
      isFullyClassical: this.squareProps.size === 0,
      ...(stateVectorSize !== undefined ? { stateVectorSize } : {}),
      ...(activeQudits !== undefined ? { activeQudits } : {}),
      liveHandles: this._stats.live,
      peakLiveHandles: this._stats.peakLive,
      createdByType: { ...this._stats.createdByType },
      destroyed: this._stats.destroyed,
    };
  }

  measureSquare(square: number): number {
    const prop = this.ensureSquareProp(square);
    const [value] = this.port.measure([prop]);
    // Measurement may have disentangled other squares
    this.collapseDeterministicSquares();
    return value;
  }

  private applyJump(move: QChessMove): QuantumMoveResult {
    if (move.variant === MoveVariant.Basic) {
      this.swapSquares(move.square1, move.square2);
      return { applied: true, measured: false };
    }

    if (move.variant === MoveVariant.Excluded) {
      const canMove = this.resolveMeasuredCondition(move, [this.getSquareEmptyPredicate(move.square2)]);
      if (canMove) {
        this.swapSquares(move.square1, move.square2);
      }
      return { applied: canMove, measured: true, measurementPassed: canMove };
    }

    const canMove = this.resolveMeasuredCondition(move, [this.getSquareFullPredicate(move.square1)]);
    if (!canMove) {
      return { applied: false, measured: true, measurementPassed: false };
    }
    this.doCapture(move.square1, move.square2);
    return { applied: true, measured: true, measurementPassed: true };
  }

  private applySlide(move: QChessMove): QuantumMoveResult {
    const pathPredicates = this.getPathEmptyPredicates(move.square1, move.square2);

    // BASIC: controlled iSwap with path predicates (entanglement, not measurement)
    if (move.variant === MoveVariant.Basic) {
      this.swapSquares(move.square1, move.square2, pathPredicates);
      return { applied: true, measured: false };
    }

    // EXCLUDED: measure target empty, then controlled iSwap with path
    if (move.variant === MoveVariant.Excluded) {
      const canMove = this.resolveMeasuredCondition(move, [this.getSquareEmptyPredicate(move.square2)]);
      if (canMove) {
        this.swapSquares(move.square1, move.square2, pathPredicates);
      }
      return { applied: canMove, measured: true, measurementPassed: canMove };
    }

    // CAPTURE: measure source full + path empty, then doCapture
    const canMove = this.resolveMeasuredCondition(move, [this.getSquareFullPredicate(move.square1), ...pathPredicates]);
    if (!canMove) {
      return { applied: false, measured: true, measurementPassed: false };
    }
    this.doCapture(move.square1, move.square2);
    return { applied: true, measured: true, measurementPassed: true };
  }

  private applySplitJump(move: QChessMove): QuantumMoveResult {
    if (move.square3 < 0) {
      return { applied: false, measured: false };
    }
    this.applySplitJumpSequence(move.square1, move.square2, move.square3);
    return { applied: true, measured: false };
  }

  private applySplitSlide(move: QChessMove): QuantumMoveResult {
    if (move.square3 < 0) {
      return { applied: false, measured: false };
    }

    const excluded = new Set([move.square1, move.square2, move.square3]);
    const c12Flag = this.createConditionFlag(this.getPathEmptyPredicates(move.square1, move.square2, excluded));
    const c13Flag = this.createConditionFlag(this.getPathEmptyPredicates(move.square1, move.square3, excluded));
    const c12 = this.port.predicateIs(c12Flag, 1);
    const c12Not = this.port.predicateIs(c12Flag, 0);
    const c13 = this.port.predicateIs(c13Flag, 1);
    const c13Not = this.port.predicateIs(c13Flag, 0);

    this.applySplitJumpSequence(move.square1, move.square2, move.square3, [c12, c13]);
    this._iSwap(this.ensureSquareProp(move.square1), this.ensureSquareProp(move.square2), 1.0, [c12, c13Not]);
    this._iSwap(this.ensureSquareProp(move.square1), this.ensureSquareProp(move.square3), 1.0, [c12Not, c13]);
    // Condition flags are entangled with piece positions after the conditional
    // iSwaps — cannot recycle without collapsing the path condition.
    return { applied: true, measured: false };
  }

  private applyMergeJump(move: QChessMove): QuantumMoveResult {
    if (move.square3 < 0) {
      return { applied: false, measured: false };
    }
    this.applyMergeJumpSequence(move.square1, move.square2, move.square3);
    return { applied: true, measured: false };
  }

  private applyMergeSlide(move: QChessMove): QuantumMoveResult {
    if (move.square3 < 0) {
      return { applied: false, measured: false };
    }
    // Paths run from the merge target (square3) to each source (square1, square2)
    const excluded = new Set([move.square1, move.square2, move.square3]);
    const c31Flag = this.createConditionFlag(this.getPathEmptyPredicates(move.square3, move.square1, excluded));
    const c32Flag = this.createConditionFlag(this.getPathEmptyPredicates(move.square3, move.square2, excluded));
    const c31 = this.port.predicateIs(c31Flag, 1);
    const c31Not = this.port.predicateIs(c31Flag, 0);
    const c32 = this.port.predicateIs(c32Flag, 1);
    const c32Not = this.port.predicateIs(c32Flag, 0);

    this.applyMergeJumpSequence(move.square1, move.square2, move.square3, [c31, c32]);
    this._iSwap(this.ensureSquareProp(move.square3), this.ensureSquareProp(move.square1), -1.0, [c31, c32Not]);
    this._iSwap(this.ensureSquareProp(move.square3), this.ensureSquareProp(move.square2), -1.0, [c31Not, c32]);
    // Condition flags are entangled with piece positions after the conditional
    // iSwaps — cannot recycle without collapsing the path condition.
    return { applied: true, measured: false };
  }

  private applyPawnCapture(move: QChessMove): QuantumMoveResult {
    // Faithful C++ engine implementation:
    // 1. Measure source full (via resolveMeasuredCondition)
    // 2. Controlled-cycle on source, predicated on target being full
    const canCapture = this.resolveMeasuredCondition(move, [this.getSquareFullPredicate(move.square1)]);
    if (!canCapture) {
      return { applied: false, measured: true, measurementPassed: false };
    }
    this._cycle(this.ensureSquareProp(move.square1), undefined, [this.getSquareFullPredicate(move.square2)]);
    return { applied: true, measured: true, measurementPassed: true };
  }

  private applyEnPassant(move: QChessMove): QuantumMoveResult {
    if (move.square3 < 0) {
      return { applied: false, measured: false };
    }

    if (move.variant === MoveVariant.Basic) {
      this.applyBasicEnPassant(move.square1, move.square2, move.square3);
      return { applied: true, measured: false };
    }

    if (move.variant === MoveVariant.Excluded) {
      const canMove = this.resolveMeasuredCondition(move, [this.getSquareEmptyPredicate(move.square2)]);
      if (canMove) {
        this.applyBasicEnPassant(move.square1, move.square2, move.square3);
      }
      return { applied: canMove, measured: true, measurementPassed: canMove };
    }

    const canMove = this.resolveMeasuredCondition(move, [this.getSquareFullPredicate(move.square1)]);
    if (!canMove) {
      return { applied: false, measured: true, measurementPassed: false };
    }
    this.applyCaptureEnPassant(move.square1, move.square2, move.square3);
    return { applied: true, measured: true, measurementPassed: true };
  }

  private applyKingSideCastle(move: QChessMove): QuantumMoveResult {
    if (move.variant === MoveVariant.Excluded) {
      const canMove = this.resolveMeasuredCondition(move, this.getPathEmptyPredicates(move.square1, move.square1 + 3));
      if (!canMove) {
        return { applied: false, measured: true, measurementPassed: false };
      }
    }
    this.swapSquares(move.square1, move.square1 + 2);
    this.swapSquares(move.square1 + 3, move.square1 + 1);
    return { applied: true, measured: move.variant === MoveVariant.Excluded, measurementPassed: move.variant === MoveVariant.Excluded ? true : undefined };
  }

  private applyQueenSideCastle(move: QChessMove): QuantumMoveResult {
    if (move.variant === MoveVariant.Excluded) {
      const canMove = this.resolveMeasuredCondition(move, this.getPathEmptyPredicates(move.square1, move.square1 - 3));
      if (!canMove) {
        return { applied: false, measured: true, measurementPassed: false };
      }
    }
    // Controlled by b-file square empty (matches C++ get_qs_castle_op)
    const bFilePredicates = [this.getSquareEmptyPredicate(move.square1 - 3)];
    this.swapSquares(move.square1, move.square1 - 2, bFilePredicates);
    this.swapSquares(move.square1 - 4, move.square1 - 1, bFilePredicates);
    return { applied: true, measured: move.variant === MoveVariant.Excluded, measurementPassed: move.variant === MoveVariant.Excluded ? true : undefined };
  }

  /**
   * Flush any pending deferred phases for a quantum handle.
   * Applies clock(handle, 0.5 * count) to account for accumulated iSwap phases.
   * Must be called before any real quantum interaction with the handle.
   */
  private flushPendingPhase(handle: QuantumHandle): void {
    const count = this.pendingPhases.get(handle);
    if (count) {
      this._clock(handle, 0.5 * count);
      this.pendingPhases.delete(handle);
    }
  }

  /**
   * Flush pending phases for all handles involved in a set of squares.
   */
  private flushPendingPhasesForSquares(squares: number[]): void {
    for (const sq of squares) {
      const handle = this.squareProps.get(sq);
      if (handle) this.flushPendingPhase(handle);
    }
  }

  private swapSquares(source: number, target: number, predicates?: QuantumPredicate[]): void {
    // Fast path 1: both squares purely classical, no predicates
    if (!predicates?.length && !this.squareProps.has(source) && !this.squareProps.has(target)) {
      const sourceOccupied = this.classicalOccupied.has(source);
      const targetOccupied = this.classicalOccupied.has(target);
      if (sourceOccupied && !targetOccupied) {
        this.classicalOccupied.delete(source);
        this.classicalOccupied.add(target);
      } else if (!sourceOccupied && targetOccupied) {
        this.classicalOccupied.delete(target);
        this.classicalOccupied.add(source);
      }
      return;
    }

    // Fast path 2: one square is quantum, the other is empty (no quantum property,
    // not classically occupied), and no predicates. Defer the iSwap phase.
    // The piece moves (handle reassigned) but the phase of i is accumulated.
    if (!predicates?.length) {
      const sourceHandle = this.squareProps.get(source);
      const targetHandle = this.squareProps.get(target);

      if (sourceHandle && !targetHandle && !this.classicalOccupied.has(target)) {
        // Superposed piece on source moves to empty target
        this.squareProps.delete(source);
        this.squareProps.set(target, sourceHandle);
        this.classicalOccupied.delete(source); // source is now empty
        this.pendingPhases.set(sourceHandle, (this.pendingPhases.get(sourceHandle) ?? 0) + 1);
        return;
      }
      if (targetHandle && !sourceHandle && !this.classicalOccupied.has(source)) {
        // Superposed piece on target moves to empty source
        this.squareProps.delete(target);
        this.squareProps.set(source, targetHandle);
        this.classicalOccupied.delete(target); // target is now empty
        this.pendingPhases.set(targetHandle, (this.pendingPhases.get(targetHandle) ?? 0) + 1);
        return;
      }
    }

    // Full quantum path: flush any pending phases before the real iSwap
    const srcHandle = this.squareProps.get(source);
    const tgtHandle = this.squareProps.get(target);
    if (srcHandle) this.flushPendingPhase(srcHandle);
    if (tgtHandle) this.flushPendingPhase(tgtHandle);

    this._iSwap(this.ensureSquareProp(source), this.ensureSquareProp(target), 1.0, predicates);
  }

  private doCapture(source: number, target: number, predicates?: QuantumPredicate[]): void {
    const ancilla = this.createAncilla("captureAncilla");
    this._iSwap(this.ensureSquareProp(target), ancilla, 1.0, predicates);
    this._iSwap(this.ensureSquareProp(source), this.ensureSquareProp(target), 1.0, predicates);
    // ancilla holds captured piece quantum state -- entangled with board, cannot recycle
  }

  private applyBasicEnPassant(source: number, target: number, epSquare: number): void {
    const predicates = [this.getSquareFullPredicate(source), this.getSquareEmptyPredicate(target), this.getSquareFullPredicate(epSquare)];
    this.applyControlledCycles([source, target, epSquare], predicates);
  }

  private applyCaptureEnPassant(source: number, target: number, epSquare: number): void {
    const ancillaTarget = this.createAncilla("captureAncilla");
    const ancillaEp = this.createAncilla("captureAncilla");
    this._iSwap(this.ensureSquareProp(epSquare), ancillaEp, 1.0, [this.getSquareEmptyPredicate(target)]);
    this._iSwap(this.ensureSquareProp(target), ancillaTarget, 1.0);
    this._iSwap(this.ensureSquareProp(source), this.ensureSquareProp(target), 1.0, [this.port.predicateIs(ancillaTarget, 1)]);
    this._iSwap(this.ensureSquareProp(source), this.ensureSquareProp(target), 1.0, [this.port.predicateIs(ancillaEp, 1)]);
    // ancillas hold captured piece quantum state -- entangled with board, cannot recycle
  }

  private getPathEmptyPredicates(source: number, target: number, excluded: Set<number> = new Set()): QuantumPredicate[] {
    const path = this.getPathSquaresExclusive(source, target).filter((square) => !excluded.has(square));
    // For each path square, determine if we need a predicate:
    // - No quantum property + empty classically: deterministically empty, skip (always clear)
    // - No quantum property + occupied classically: deterministically full, path is blocked.
    //   Create the property so the predicate correctly reflects the occupied state.
    // - Has quantum property: check probability -- skip if deterministically empty
    return path
      .filter((square) => {
        if (!this.squareProps.has(square)) {
          return this.classicalOccupied.has(square);
        }
        return this.getExistenceProbability(square) > 1e-9;
      })
      .map((square) => this.port.predicateIs(this.ensureSquareProp(square), 0));
  }

  private getSquareFullPredicate(square: number): QuantumPredicate {
    return this.port.predicateIs(this.ensureSquareProp(square), 1);
  }

  private getSquareEmptyPredicate(square: number): QuantumPredicate {
    return this.port.predicateIs(this.ensureSquareProp(square), 0);
  }

  private createAncilla(purpose: "captureAncilla" | "conditionFlag" | "measureAncilla" = "measureAncilla"): QuantumHandle {
    while (this.ancillaPool.length > 0) {
      const candidate = this.ancillaPool.pop()!;
      const isValid = candidate && typeof (candidate as any).is_valid === "function"
        ? (candidate as any).is_valid()
        : candidate != null;
      if (isValid) return candidate;
    }
    const h = this.port.createProperty(this.dimension);
    this._allHandles.add(h);
    this._trackCreate(purpose);
    return h;
  }

  private recycleAncilla(handle: QuantumHandle): void {
    // Measure + cycle to |0⟩ and pool for reuse. Do NOT destroyProperty here —
    // the handle may be restored by undo during do/undo search.
    const [value] = this.port.measure([handle]);
    if (value !== 0) {
      this._cycle(handle);
    }
    this.ancillaPool.push(handle);
  }

  private createConditionFlag(predicates: QuantumPredicate[]): QuantumHandle {
    const flag = this.createAncilla("conditionFlag");
    this._cycle(flag, undefined, predicates);
    return flag;
  }

  private applyControlledCycles(squares: number[], predicates: QuantumPredicate[]): void {
    const gate = this.createConditionFlag(predicates);
    const gatePredicate = this.port.predicateIs(gate, 1);
    for (const square of squares) {
      this._cycle(this.ensureSquareProp(square), undefined, [gatePredicate]);
    }
    // gate is entangled with the cycled squares -- cannot recycle
  }

  private applySplitJumpSequence(square1: number, square2: number, square3: number, predicates?: QuantumPredicate[]): void {
    this._iSwap(this.ensureSquareProp(square1), this.ensureSquareProp(square2), 0.5, predicates);
    this._iSwap(this.ensureSquareProp(square1), this.ensureSquareProp(square3), 1.0, predicates);
  }

  private applyMergeJumpSequence(square1: number, square2: number, square3: number, predicates?: QuantumPredicate[]): void {
    // Exact inverse of split: reverse the step order and negate fractions.
    // Split did iSwap(src, tgt1, 0.5) then iSwap(src, tgt2, 1.0).
    // For merge, square3=target (was split source), square1/square2=sources (were split targets).
    this._iSwap(this.ensureSquareProp(square3), this.ensureSquareProp(square2), -1.0, predicates);
    this._iSwap(this.ensureSquareProp(square3), this.ensureSquareProp(square1), -0.5, predicates);
  }

  private resolveMeasuredCondition(move: QChessMove, predicates: QuantumPredicate[]): boolean {
    if (!move.doesMeasurement) {
      return this.port.measurePredicate(predicates) === 1;
    }
    // Forced measurement: use forced_measure_predicate if available (QF >= 1.6.2).
    const fmp = (this.port as any).forcedMeasurePredicate as
      ((preds: QuantumPredicate[], value: number) => number) | undefined;
    if (fmp) {
      const requestedOutcome = move.measurementOutcome;
      // Check probability first to skip impossible outcomes without overhead.
      const pp = (this.port as any).predicateProbability as
        ((preds: QuantumPredicate[]) => number) | undefined;
      if (pp) {
        const prob = pp(predicates); // probability that predicates hold (outcome=1)
        const requestedProb = requestedOutcome === 1 ? prob : (1 - prob);
        if (requestedProb < 1e-9) {
          // Impossible — measure randomly
          return this.port.measurePredicate(predicates) === 1;
        }
      }
      // forced_measure_predicate no longer throws on impossible (QF >= 1.10.0)
      // — returns actual outcome instead. Safe to call directly.
      return fmp(predicates, requestedOutcome) === 1;
    }
    // Fallback (QF < 1.6.2): encode predicates into an ancilla and force its outcome.
    const ancilla = this.createAncilla();
    this._cycle(ancilla, undefined, predicates);
    const probs = this.port.probabilities([ancilla]);
    const p1 = probs.find((e) => e.qudit_values[0] === 1)?.probability ?? 0;
    const requestedOutcome = move.measurementOutcome;
    const requestedProb = requestedOutcome === 1 ? p1 : (1 - p1);
    let outcome: number;
    if (requestedProb < 1e-6 || p1 < 1e-9 || p1 > 1 - 1e-9) {
      [outcome] = this.port.measure([ancilla]);
    } else {
      try {
        [outcome] = this.port.forcedMeasure([ancilla], [requestedOutcome]);
      } catch {
        [outcome] = this.port.measure([ancilla]);
      }
    }
    this.recycleAncilla(ancilla);
    return outcome === 1;
  }

  private getPathSquaresExclusive(source: number, target: number): number[] {
    const sourceFile = getFile(source);
    const targetFile = getFile(target);
    const sourceRank = getRank(source);
    const targetRank = getRank(target);
    const fileDelta = targetFile - sourceFile;
    const rankDelta = targetRank - sourceRank;
    if (fileDelta === 0 && rankDelta === 0) {
      return [];
    }

    const absFile = Math.abs(fileDelta);
    const absRank = Math.abs(rankDelta);
    if (!(fileDelta === 0 || rankDelta === 0 || absFile === absRank)) {
      return [];
    }

    const stepFile = fileDelta === 0 ? 0 : fileDelta > 0 ? 1 : -1;
    const stepRank = rankDelta === 0 ? 0 : rankDelta > 0 ? 1 : -1;
    const squares: number[] = [];
    let file = sourceFile + stepFile;
    let rank = sourceRank + stepRank;
    while (file !== targetFile || rank !== targetRank) {
      squares.push(rank * 8 + file);
      file += stepFile;
      rank += stepRank;
    }
    return squares;
  }

  // -----------------------------------------------------------------------
  // Quantum relationship analysis
  // -----------------------------------------------------------------------

  /** Get squares that are in superposition (0 < P < 1). */
  getSuperpositionSquares(gameData: QChessGameData, epsilon = 1.1920929e-7): number[] {
    const result: number[] = [];
    for (let sq = 0; sq < 64; sq++) {
      if (!this.squareProps.has(sq)) continue;
      const p = this.getExistenceProbability(sq);
      if (p > epsilon && p < 1 - epsilon) {
        result.push(sq);
      }
    }
    return result;
  }

  /**
   * Compute pairwise correlation between two squares using joint probabilities.
   * Returns { strength, correlation } where:
   *   strength = mutual information (0 = independent, higher = more entangled)
   *   correlation = P(A=1,B=1) - P(A=1)*P(B=1), positive = correlated, negative = anti-correlated
   */
  computeCorrelation(squareA: number, squareB: number): { strength: number; correlation: number } {
    const propA = this.squareProps.get(squareA);
    const propB = this.squareProps.get(squareB);
    if (!propA || !propB) return { strength: 0, correlation: 0 };

    const joint = this.port.probabilities([propA, propB]);
    // Extract joint probabilities
    let p00 = 0, p01 = 0, p10 = 0, p11 = 0;
    for (const entry of joint) {
      const [a, b] = entry.qudit_values;
      if (a === 0 && b === 0) p00 = entry.probability;
      else if (a === 0 && b === 1) p01 = entry.probability;
      else if (a === 1 && b === 0) p10 = entry.probability;
      else if (a === 1 && b === 1) p11 = entry.probability;
    }

    // Marginals
    const pA = p10 + p11;
    const pB = p01 + p11;

    // Correlation coefficient: how much P(A=1,B=1) deviates from independence
    const correlation = p11 - pA * pB;

    // Mutual information
    const eps = 1e-12;
    let mi = 0;
    const pairs: [number, number, number][] = [
      [p00, 1 - pA, 1 - pB],
      [p01, 1 - pA, pB],
      [p10, pA, 1 - pB],
      [p11, pA, pB]
    ];
    for (const [pjoint, pmA, pmB] of pairs) {
      if (pjoint > eps && pmA > eps && pmB > eps) {
        mi += pjoint * Math.log2(pjoint / (pmA * pmB));
      }
    }

    return { strength: mi, correlation };
  }

  /**
   * Compute entanglement links for all superposition squares.
   * Returns links sorted by strength, filtered above a threshold.
   */
  computeEntanglementLinks(gameData: QChessGameData, threshold = 0.01): EntanglementVisualLink[] {
    const spSquares = this.getSuperpositionSquares(gameData);
    const links: EntanglementVisualLink[] = [];

    for (let i = 0; i < spSquares.length; i++) {
      for (let j = i + 1; j < spSquares.length; j++) {
        const { strength, correlation } = this.computeCorrelation(spSquares[i], spSquares[j]);
        if (strength >= threshold) {
          links.push({
            fromSquare: spSquares[i],
            toSquare: spSquares[j],
            strength,
            correlation
          });
        }
      }
    }

    return links.sort((a, b) => b.strength - a.strength);
  }

  /**
   * Compute how measuring a square would affect other squares' probabilities.
   * Returns delta = P(other | measured=1) - P(other) for each other superposition square.
   */
  computeMeasurementImpact(square: number, gameData: QChessGameData, epsilon = 1.1920929e-7): Array<{ square: number; deltaIfIn: number; deltaIfOut: number }> {
    const propA = this.squareProps.get(square);
    if (!propA) return [];

    const pA = this.getExistenceProbability(square);
    if (pA < epsilon || pA > 1 - epsilon) return [];

    const spSquares = this.getSuperpositionSquares(gameData, epsilon);
    const results: Array<{ square: number; deltaIfIn: number; deltaIfOut: number }> = [];

    for (const sq of spSquares) {
      if (sq === square) continue;
      const propB = this.squareProps.get(sq);
      if (!propB) continue;

      const joint = this.port.probabilities([propA, propB]);
      let p01 = 0, p10 = 0, p11 = 0;
      for (const entry of joint) {
        const [a, b] = entry.qudit_values;
        if (a === 0 && b === 1) p01 = entry.probability;
        else if (a === 1 && b === 0) p10 = entry.probability;
        else if (a === 1 && b === 1) p11 = entry.probability;
      }

      const pB = p01 + p11;
      const pBgivenAin = pA > 1e-9 ? p11 / pA : pB;
      const pBgivenAout = (1 - pA) > 1e-9 ? p01 / (1 - pA) : pB;

      const deltaIfIn = pBgivenAin - pB;
      const deltaIfOut = pBgivenAout - pB;

      if (Math.abs(deltaIfIn) > 1e-4 || Math.abs(deltaIfOut) > 1e-4) {
        results.push({ square: sq, deltaIfIn, deltaIfOut });
      }
    }

    return results;
  }

  /**
   * Compute relative phase between two squares using the reduced density matrix.
   */
  computeRelativePhase(squareA: number, squareB: number): { radians: number; magnitude: number } | null {
    if (!this.port.reducedDensityMatrix) return null;

    const propA = this.squareProps.get(squareA);
    const propB = this.squareProps.get(squareB);
    if (!propA || !propB) return null;

    try {
      const rdm = this.port.reducedDensityMatrix([propA, propB]);
      const offDiag = rdm.find(
        (e) => e.row_values[0] === 1 && e.row_values[1] === 0 &&
               e.col_values[0] === 0 && e.col_values[1] === 1
      );
      if (!offDiag) return null;

      const { real, imag } = offDiag.value;
      const magnitude = Math.sqrt(real * real + imag * imag);
      if (magnitude < 1e-6) return null;

      const radians = Math.atan2(imag, real);
      return { radians, magnitude };
    } catch {
      return null;
    }
  }

  /**
   * Compute relative phase links for same-type same-color piece pairs.
   */
  computeRelativePhaseLinks(gameData: QChessGameData, epsilon = 1.1920929e-7): RelativePhaseVisualLink[] {
    if (!this.port.reducedDensityMatrix) return [];

    const spSquares = this.getSuperpositionSquares(gameData, epsilon);
    const groups = new Map<string, number[]>();
    for (const sq of spSquares) {
      const piece = gameData.board.pieces[sq];
      if (piece === ".") continue;
      const key = piece;
      const list = groups.get(key) ?? [];
      list.push(sq);
      groups.set(key, list);
    }

    const links: RelativePhaseVisualLink[] = [];
    for (const squares of groups.values()) {
      if (squares.length < 2) continue;
      for (let i = 0; i < squares.length; i++) {
        for (let j = i + 1; j < squares.length; j++) {
          const phase = this.computeRelativePhase(squares[i], squares[j]);
          if (phase) {
            links.push({
              fromSquare: squares[i],
              toSquare: squares[j],
              radians: phase.radians,
              confidence: phase.magnitude
            });
          }
        }
      }
    }

    return links;
  }
}
