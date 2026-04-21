import {
  cloneGameData,
  createClassicalStartGameData,
  detectKingCapture,
  type QChessGameData,
  type RulesConfig
} from "./core";
import type { QuantumChessQuantumAdapter } from "./quantum";
import { QCEngine, type MeasurementForceMode } from "./engine";
import { buildLegalMoveSet } from "./legal-moves";
import type {
  QCExplorer,
  QCExplorerResult,
  QCEngineView,
  QCMoveChoice,
  QCPositionEval,
  QCSample
} from "./types";

/** Factory that creates a fresh QuantumChessQuantumAdapter instance. */
export type QuantumAdapterFactory = () => QuantumChessQuantumAdapter;

// Piece values for the built-in evaluator
const PIECE_VALUES: Record<string, number> = {
  P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0,
  p: -1, n: -3, b: -3, r: -5, q: -9, k: 0
};

/**
 * A sandboxed engine clone for move exploration and lookahead.
 * Does not affect the real game state.
 *
 * Each explorer owns a snapshot of the game (cloned gameData + move strings).
 * `apply()` creates a fresh quantum adapter, replays the full history,
 * applies the new move, and returns a new explorer at the resulting state.
 */
export class QCExplorerImpl implements QCExplorer {
  private readonly gameData: QChessGameData;
  private readonly moveStrings: string[];
  private readonly startingData: QChessGameData;
  private readonly rules: RulesConfig;
  private readonly adapterFactory: QuantumAdapterFactory;
  readonly depth: number;

  constructor(
    gameData: QChessGameData,
    moveStrings: string[],
    startingData: QChessGameData,
    rules: RulesConfig,
    adapterFactory: QuantumAdapterFactory,
    depth: number = 0
  ) {
    this.gameData = gameData;
    this.moveStrings = moveStrings;
    this.startingData = startingData;
    this.rules = rules;
    this.adapterFactory = adapterFactory;
    this.depth = depth;
  }

  /**
   * Apply a move and return the resulting state as a new explorer.
   * Creates a fresh quantum adapter and replays the full history + new move.
   */
  apply(
    choice: QCMoveChoice,
    options?: { forceMeasurement?: "pass" | "fail" }
  ): QCExplorerResult {
    // Create fresh engine with new quantum adapter
    const quantum = this.adapterFactory();
    const engine = new QCEngine(quantum, this.rules);

    // Set measurement forcing if requested
    if (options?.forceMeasurement) {
      engine.setForceMeasurement(options.forceMeasurement === "pass" ? "m1" : "m0");
    }

    // Replay from position to reconstruct quantum state (setup + game moves)
    engine.initializeFromPosition({
      startingFen: this.startingData.position.startingFen,
      setupMoves: this.startingData.position.setupMoves,
      history: [...this.moveStrings]
    });

    // Get pass probability before applying (for measurement moves)
    let measurementPassProbability: number | undefined;
    const view = engine.getView();
    if (choice.type === "standard") {
      const moveOpt = view.legalMoves.standard.find(
        m => m.from === choice.from && m.to === choice.to
      );
      if (moveOpt?.willMeasure) {
        // Estimate probability from piece existence at source
        measurementPassProbability = this.gameData.board.probabilities[choice.from];
      }
    }

    // Apply the new move
    const result = engine.executeMove(choice);

    const newMoveStrings = [...this.moveStrings, result.moveRecord.moveString];
    const newExplorer = new QCExplorerImpl(
      result.gameData,
      newMoveStrings,
      this.startingData,
      this.rules,
      this.adapterFactory,
      this.depth + 1
    );

    return {
      explorer: newExplorer,
      success: result.success,
      measured: result.moveRecord.wasMeasurement,
      measurementPassed: result.moveRecord.measurementPassed,
      measurementPassProbability
    };
  }

  /** No-op — QCExplorerImpl creates new instances per apply, not do/undo. */
  undo(): void {}

  /**
   * Fork this explorer into N independent copies.
   * Each copy shares the same snapshot and can diverge independently.
   */
  fork(count: number = 2): QCExplorer[] {
    const forks: QCExplorer[] = [];
    for (let i = 0; i < count; i++) {
      forks.push(new QCExplorerImpl(
        cloneGameData(this.gameData),
        [...this.moveStrings],
        this.startingData,
        this.rules,
        this.adapterFactory,
        this.depth
      ));
    }
    return forks;
  }

  /** Get the current view (game state + legal moves) at this exploration node. */
  get view(): QCEngineView {
    return {
      gameData: this.gameData,
      sideToMove: this.gameData.board.ply % 2 === 0 ? "white" : "black",
      legalMoves: buildLegalMoveSet(this.gameData),
      moveHistory: [], // Explorer doesn't track full records, just strings
      quantumEnabled: this.rules.quantumEnabled,
      rules: this.rules
    };
  }

  /**
   * Simple material + probability heuristic evaluation.
   * Returns score from white's perspective (positive = white advantage).
   */
  evaluate(): QCPositionEval {
    const { gameData } = this;
    let materialBalance = 0;

    for (let sq = 0; sq < 64; sq++) {
      const piece = gameData.board.pieces[sq];
      const prob = gameData.board.probabilities[sq];
      if (piece === "." || prob <= 1e-6) continue;
      materialBalance += (PIECE_VALUES[piece] ?? 0) * prob;
    }

    const kingCapture = detectKingCapture(gameData);
    const legalMoves = buildLegalMoveSet(gameData);

    return {
      score: kingCapture === "white_win" ? 10000
           : kingCapture === "black_win" ? -10000
           : materialBalance,
      materialBalance,
      isCheckmate: kingCapture !== null,
      isStalemate: kingCapture === null && legalMoves.count === 0
    };
  }

  /**
   * Sample the current quantum state N times.
   * Each sample collapses all superpositions into a classical board.
   *
   * Creates fresh quantum adapters, replays history, then measures all 64 squares.
   */
  sample(count: number): QCSample[] {
    const samples: QCSample[] = [];

    for (let i = 0; i < count; i++) {
      const quantum = this.adapterFactory();
      const engine = new QCEngine(quantum, this.rules);
      engine.initializeFromPosition({
        startingFen: this.startingData.position.startingFen,
        setupMoves: this.startingData.position.setupMoves,
        history: [...this.moveStrings]
      });

      // Measure all squares to collapse to classical state
      const collapsedPieces = [...engine.getGameData().board.pieces];
      for (let sq = 0; sq < 64; sq++) {
        const prob = quantum.getExistenceProbability(sq);
        if (prob <= 1e-6) {
          collapsedPieces[sq] = ".";
        } else if (prob >= 1 - 1e-6) {
          // Already classical, keep piece
        } else {
          // Quantum superposition: measure it
          const value = quantum.measureSquare(sq);
          if (value === 0) {
            collapsedPieces[sq] = ".";
          }
          // If value === 1, piece stays
        }
      }

      samples.push({
        pieces: collapsedPieces,
        weight: 1.0 / count
      });
    }

    return samples;
  }
}

/**
 * Create a QCExplorer from the current QCEngine state.
 * Called by QCMatchRunner when providing the explorer to AI players.
 */
export function createExplorer(
  engine: QCEngine,
  startingData: QChessGameData,
  adapterFactory: QuantumAdapterFactory
): QCExplorer {
  return new QCExplorerImpl(
    cloneGameData(engine.getGameData()),
    engine.getMoveStrings(),
    startingData,
    engine.getView().rules,
    adapterFactory,
    0
  );
}
