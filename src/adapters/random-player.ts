import type {
  QCPlayer,
  QCEngineView,
  QCExplorer,
  QCMoveChoice,
  QCClock,
  QCGameResult
} from "../types";

/**
 * AI that picks a uniformly random legal move each turn.
 * Useful as a baseline opponent for stress testing and benchmarking.
 */
export class RandomPlayer implements QCPlayer {
  readonly name: string;
  readonly control = "ai" as const;
  readonly author = "Quantum Chess";
  readonly description = "Picks a random legal move each turn.";
  readonly quantumEnabled: boolean;

  constructor(name: string = "Random", options?: { quantumEnabled?: boolean }) {
    this.name = name;
    this.quantumEnabled = options?.quantumEnabled ?? true;
  }

  async chooseMove(view: QCEngineView): Promise<QCMoveChoice> {
    const { legalMoves } = view;

    const all: QCMoveChoice[] = [
      ...legalMoves.standard.map((m): QCMoveChoice => ({
        type: "standard",
        from: m.from,
        to: m.to,
        ...(m.promotionChoices ? { promotion: m.promotionChoices[Math.floor(Math.random() * m.promotionChoices.length)] } : {})
      })),
      ...legalMoves.splits.map((m): QCMoveChoice => ({
        type: "split",
        from: m.from,
        targetA: m.targetA,
        targetB: m.targetB
      })),
      ...legalMoves.merges.map((m): QCMoveChoice => ({
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

  onGameOver(_result: QCGameResult): void {}
  dispose(): void {}
}
