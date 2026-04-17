/**
 * Basic AI example: run a game between the SDK's reference AI and a random player.
 *
 * Usage:
 *   npx tsx examples/basic-ai.ts
 */
import { createGameRunner, PureSDKAdapter, RandomPlayer } from "../src";

async function main() {
  const runner = await createGameRunner();

  const myAI = new PureSDKAdapter("My AI", {
    maxDepth: 3,
    maxTimeMs: 5000,
  });

  const random = new RandomPlayer("Random");

  console.log("Starting game: My AI (white) vs Random (black)");

  const result = await runner.playMatch(myAI, random, {
    onMove(ply, color, moveString) {
      console.log(`  ply ${ply} (${color}): ${moveString}`);
    },
  });

  console.log(`\nResult: ${result.winner} wins by ${result.reason} (${result.totalPly} plies)`);
}

main().catch(console.error);
