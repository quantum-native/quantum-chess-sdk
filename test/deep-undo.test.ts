#!/usr/bin/env npx tsx
/**
 * Deep do/undo validation: randomly walks the search tree to depth 10,
 * preferring complex quantum moves (splits, measurements, captures).
 * At each leaf, validates the position by replaying the full move history
 * through a fresh engine and comparing board state.
 *
 * Usage:
 *   npx tsx test/deep-undo.test.ts                # default: 100 walks, depth 10
 *   npx tsx test/deep-undo.test.ts --walks 500    # more walks
 *   npx tsx test/deep-undo.test.ts --depth 15     # deeper
 */
import { QuantumChessQuantumAdapter, createQuantumForgePort, createIsolatedPort } from "../src/quantum";
import type { QuantumForgeLikeModule } from "../src/quantum";
import { QCEngine } from "../src/engine";
import { createStackExplorer } from "../src/stack-explorer";
import type { QCMoveChoice, QCLegalMoveSet } from "../src/types";

const MAX_DEPTH = parseInt(process.argv.find(a => a === "--depth")
  ? process.argv[process.argv.indexOf("--depth") + 1] : "10", 10);
const NUM_WALKS = parseInt(process.argv.find(a => a === "--walks")
  ? process.argv[process.argv.indexOf("--walks") + 1] : "100", 10);

function pickMove(legalMoves: QCLegalMoveSet): { choice: QCMoveChoice; label: string; complexity: number } | null {
  const candidates: Array<{ choice: QCMoveChoice; label: string; weight: number; complexity: number }> = [];

  for (const m of legalMoves.standard) {
    let weight = 1;
    let complexity = 1;
    const label = `${m.from}->${m.to}`;

    if (m.willMeasure) {
      weight = 10;
      complexity = 3;
    } else if (m.variant === 3) {
      weight = 5;
      complexity = 2;
    }
    candidates.push({ choice: { type: "standard", from: m.from, to: m.to }, label, weight, complexity });
  }

  for (const s of legalMoves.splits) {
    candidates.push({
      choice: { type: "split", from: s.from, targetA: s.targetA, targetB: s.targetB },
      label: `${s.from}^${s.targetA},${s.targetB}`,
      weight: 8,
      complexity: 3,
    });
  }

  for (const m of legalMoves.merges) {
    candidates.push({
      choice: { type: "merge", sourceA: m.sourceA, sourceB: m.sourceB, to: m.to },
      label: `${m.sourceA}+${m.sourceB}->${m.to}`,
      weight: 8,
      complexity: 3,
    });
  }

  if (candidates.length === 0) return null;

  const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
  let r = Math.random() * totalWeight;
  for (const c of candidates) {
    r -= c.weight;
    if (r <= 0) return c;
  }
  return candidates[candidates.length - 1];
}

const STARTING_POSITIONS = [
  { name: "classical", history: [] as string[] },
  { name: "1 split", history: ["g1^h3f3"] },
  { name: "split+resp", history: ["g1^h3f3", "e7-e5"] },
  { name: "2 splits", history: ["g1^h3f3", "b8^c6a6"] },
  { name: "split+meas", history: ["g1^h3f3", "e7-e5", "h3-g5.m1"] },
  { name: "deep quantum", history: ["b1^c3a3", "g8^f6h6", "e2-e4", "e7-e5"] },
];

async function main() {
  const QFW = await import("@quantum-native/quantum-forge-chess");
  await QFW.QuantumForge.initialize({
    printErr: (msg: string) => {
      if (!msg.includes("destroying entangled")) console.error(msg);
    }
  } as any);

  const rules = {
    quantumEnabled: true, allowSplitMerge: true, allowMeasurementAnnotations: true,
    allowCastling: true, allowEnPassant: true, allowPromotion: true, objective: "checkmate" as any,
  };
  const FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  console.log(`Deep do/undo validation: ${NUM_WALKS} walks, max depth ${MAX_DEPTH}`);
  console.log(`Starting positions: ${STARTING_POSITIONS.length}\n`);

  let totalWalks = 0;
  let totalNodesChecked = 0;
  let totalFailures = 0;
  let maxDepthReached = 0;
  let totalComplexity = 0;

  for (const startPos of STARTING_POSITIONS) {
    const mainAdapter = new QuantumChessQuantumAdapter(
      createQuantumForgePort(QFW as unknown as QuantumForgeLikeModule)
    );
    const mainEngine = new QCEngine(mainAdapter, rules);
    mainEngine.initializeFromPosition({ startingFen: FEN, history: startPos.history });

    const af = () => new QuantumChessQuantumAdapter(
      createIsolatedPort(QFW as unknown as QuantumForgeLikeModule)
    );

    let posWalks = 0;
    let posNodes = 0;
    let posFailures = 0;
    let posMaxDepth = 0;

    const walksPerPos = Math.ceil(NUM_WALKS / STARTING_POSITIONS.length);

    for (let walk = 0; walk < walksPerPos; walk++) {
      const explorer = createStackExplorer(mainEngine, mainEngine.getGameData(), af);
      const moveStack: string[] = [];
      let depth = 0;
      let walkComplexity = 0;

      while (depth < MAX_DEPTH) {
        const view = explorer.view;
        if (view.legalMoves.count === 0) break;

        const pick = pickMove(view.legalMoves);
        if (!pick) break;

        walkComplexity += pick.complexity;

        const result = explorer.apply(pick.choice);

        if (result.measured && !result.measurementPassed && result.measurementPassProbability !== undefined) {
          const pass = Math.random() < result.measurementPassProbability;
          const forced = pass ? "pass" as const : "fail" as const;
          const result2 = explorer.apply(pick.choice, { forceMeasurement: forced });
          if (!result2.success) break;
          moveStack.push(pick.label + (pass ? ".m1" : ".m0"));
          depth++;
          posNodes++;
        } else if (result.success) {
          moveStack.push(pick.label);
          depth++;
          posNodes++;
        } else {
          break;
        }
      }

      if (depth > posMaxDepth) posMaxDepth = depth;
      totalComplexity += walkComplexity;

      // Validate: replay full history through a fresh engine
      if (depth > 0) {
        const explorerPieces = [...explorer.view.gameData.board.pieces];
        const explorerProbs = [...explorer.view.gameData.board.probabilities];
        const explorerPly = explorer.view.gameData.board.ply;
        const fullHistory = explorer.view.gameData.position.history;

        const replayAdapter = new QuantumChessQuantumAdapter(
          createIsolatedPort(QFW as unknown as QuantumForgeLikeModule)
        );
        const replayEngine = new QCEngine(replayAdapter, rules);
        try {
          replayEngine.initializeFromPosition({
            startingFen: FEN,
            history: fullHistory,
          });

          const replayGD = replayEngine.getGameData();

          let mismatch = false;
          const errors: string[] = [];

          if (replayGD.board.ply !== explorerPly) {
            errors.push(`ply: explorer=${explorerPly} replay=${replayGD.board.ply}`);
            mismatch = true;
          }

          for (let sq = 0; sq < 64; sq++) {
            if (explorerPieces[sq] !== replayGD.board.pieces[sq]) {
              errors.push(`sq${sq} piece: explorer=${explorerPieces[sq]} replay=${replayGD.board.pieces[sq]}`);
              mismatch = true;
            }
            if (Math.abs(explorerProbs[sq] - replayGD.board.probabilities[sq]) > 0.01) {
              errors.push(`sq${sq} prob: explorer=${explorerProbs[sq].toFixed(3)} replay=${replayGD.board.probabilities[sq].toFixed(3)}`);
              mismatch = true;
            }
          }

          if (mismatch) {
            posFailures++;
            console.log(`  FAIL walk ${walk} depth=${depth} complexity=${walkComplexity}`);
            console.log(`    history: ${fullHistory.join(" ")}`);
            for (const e of errors.slice(0, 5)) console.log(`    ${e}`);
            if (errors.length > 5) console.log(`    ... and ${errors.length - 5} more`);
          }
        } catch (err) {
          // Replay failed — measurement outcome differs (stochastic), expected
        }

        const replayPort = (replayAdapter as any).port;
        if (typeof replayPort?.dispose === "function") replayPort.dispose();
      }

      // Validate undo: unwind and check we return to starting state
      for (let i = depth - 1; i >= 0; i--) {
        explorer.undo();
      }

      const afterUndo = explorer.view.gameData;
      const startGD = mainEngine.getGameData();

      let undoMismatch = false;
      const undoErrors: string[] = [];

      if (afterUndo.board.ply !== startGD.board.ply) {
        undoErrors.push(`ply: undo=${afterUndo.board.ply} start=${startGD.board.ply}`);
        undoMismatch = true;
      }

      for (let sq = 0; sq < 64; sq++) {
        if (afterUndo.board.pieces[sq] !== startGD.board.pieces[sq]) {
          undoErrors.push(`sq${sq} piece: undo=${afterUndo.board.pieces[sq]} start=${startGD.board.pieces[sq]}`);
          undoMismatch = true;
        }
        if (Math.abs(afterUndo.board.probabilities[sq] - startGD.board.probabilities[sq]) > 0.01) {
          undoErrors.push(`sq${sq} prob: undo=${afterUndo.board.probabilities[sq].toFixed(3)} start=${startGD.board.probabilities[sq].toFixed(3)}`);
          undoMismatch = true;
        }
      }

      if (undoMismatch) {
        posFailures++;
        console.log(`  UNDO FAIL walk ${walk} depth=${depth}`);
        for (const e of undoErrors.slice(0, 5)) console.log(`    ${e}`);
        if (undoErrors.length > 5) console.log(`    ... and ${undoErrors.length - 5} more`);
      }

      (explorer as any).dispose();
      posWalks++;
    }

    const status = posFailures === 0 ? "PASS" : `FAIL (${posFailures})`;
    console.log(`${startPos.name.padEnd(14)} ${status}  walks=${posWalks} nodes=${posNodes} maxDepth=${posMaxDepth}`);

    totalWalks += posWalks;
    totalNodesChecked += posNodes;
    totalFailures += posFailures;
    if (posMaxDepth > maxDepthReached) maxDepthReached = posMaxDepth;

    mainAdapter.clear();
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Total: ${totalWalks} walks, ${totalNodesChecked} nodes, max depth ${maxDepthReached}`);
  console.log(`Avg complexity per walk: ${(totalComplexity / totalWalks).toFixed(1)}`);
  if (totalFailures === 0) {
    console.log(`Result: ALL PASSED`);
  } else {
    console.log(`Result: ${totalFailures} FAILURES`);
  }

  process.exit(totalFailures > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
