/**
 * Build your own AI: a simple material-counting player.
 *
 * This shows the minimum needed to implement a QCPlayer.
 * The only required method is chooseMove().
 *
 * Usage:
 *   npx tsx examples/my-first-ai.ts
 */
import {
  createGameRunner,
  PureSDKAdapter,
  type QCPlayer,
  type QCEngineView,
  type QCExplorer,
  type QCClock,
  type QCMoveChoice,
} from "../src";

/** Piece values for material counting. */
const PIECE_VALUE: Record<string, number> = {
  P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0,
  p: -1, n: -3, b: -3, r: -5, q: -9, k: 0,
};

/**
 * A simple AI that picks the move leading to the best material balance.
 * Looks one move ahead — captures high-value pieces, avoids losing material.
 */
const materialAI: QCPlayer = {
  name: "Material Counter",
  control: "ai",
  author: "You",
  description: "Picks the move with the best immediate material outcome",

  async chooseMove(
    view: QCEngineView,
    explorer: QCExplorer | null,
    _clock: QCClock | null
  ): Promise<QCMoveChoice> {
    const { legalMoves, gameData, sideToMove } = view;
    const sign = sideToMove === "white" ? 1 : -1;

    let bestChoice: QCMoveChoice = legalMoves.standard[0]
      ? { type: "standard", from: legalMoves.standard[0].from, to: legalMoves.standard[0].to }
      : { type: "split", from: legalMoves.splits[0].from, targetA: legalMoves.splits[0].targetA, targetB: legalMoves.splits[0].targetB };
    let bestScore = -Infinity;

    // Evaluate each standard move
    for (const move of legalMoves.standard) {
      const choice: QCMoveChoice = { type: "standard", from: move.from, to: move.to };

      if (explorer) {
        // Use the explorer to look ahead
        const result = explorer.apply(choice);
        if (result.success && !result.measured) {
          // Count material in the resulting position
          let material = 0;
          const board = result.explorer.view.gameData.board;
          for (let sq = 0; sq < 64; sq++) {
            const piece = board.pieces[sq];
            const prob = board.probabilities[sq];
            if (piece !== "." && prob > 0.01) {
              material += (PIECE_VALUE[piece] ?? 0) * prob;
            }
          }

          const score = material * sign;
          if (score > bestScore) {
            bestScore = score;
            bestChoice = choice;
          }

          // Undo the move (required for do/undo explorer)
          (explorer as any).undo();
        }
      } else {
        // No explorer — just pick captures (high victim value)
        const victim = gameData.board.pieces[move.to];
        const victimValue = Math.abs(PIECE_VALUE[victim] ?? 0);
        if (victimValue > bestScore) {
          bestScore = victimValue;
          bestChoice = choice;
        }
      }
    }

    return bestChoice;
  },
};

async function main() {
  const runner = await createGameRunner();

  // Play against the SDK's reference AI
  const opponent = new PureSDKAdapter("SDK AI", { maxDepth: 2, maxTimeMs: 3000 });

  console.log("Material Counter (white) vs SDK AI depth 2 (black)\n");

  const result = await runner.playMatch(materialAI, opponent, {
    maxPly: 100,
    onMove(ply, color, moveString) {
      console.log(`  ply ${ply} (${color}): ${moveString}`);
    },
  });

  console.log(`\nResult: ${result.winner} wins by ${result.reason} (${result.totalPly} plies)`);
}

main().catch(console.error);
