#!/usr/bin/env npx tsx
/**
 * Test StackExplorer parity with real QuantumForge AFTER quantum moves.
 *
 * After splits create entangled state, does the StackExplorer's classical
 * fast path diverge from the real quantum state? This test plays positions
 * with splits, then compares the explorer's board state against a fresh
 * QuantumForge replay at each node.
 */
import { QuantumChessQuantumAdapter, createQuantumForgePort } from "../src/quantum";
import { QCEngine } from "../src/engine";
import { createExplorer } from "../src/explorer";
import { createStackExplorer, StackExplorer } from "../src/stack-explorer";
import { createPoolingPort } from "../src/pooling-port";
import type { QCExplorer, QCMoveChoice } from "../src/types";
import { cloneGameData, CLASSICAL_START_FEN, squareNameToIndex as sq } from "../src/core";

let QFW: any;

async function init() {
  QFW = await import("@quantum-native/quantum-forge-chess");
  await QFW.QuantumForge.initialize({
    printErr: (msg: string) => {
      if (!msg.includes("destroying entangled")) console.error(msg);
    }
  } as any);
}

function af(): QuantumChessQuantumAdapter {
  return new QuantumChessQuantumAdapter(createPoolingPort(createQuantumForgePort(QFW)));
}

const RULES = {
  quantumEnabled: true, allowSplitMerge: true, allowMeasurementAnnotations: true,
  allowCastling: true, allowEnPassant: true, allowPromotion: true, objective: "checkmate" as const
};

function createEngine() {
  const q = af();
  const e = new QCEngine(q, RULES);
  e.initializeFromPosition({ startingFen: CLASSICAL_START_FEN, history: [] });
  return { engine: e, quantum: q };
}

async function testScenario(
  name: string,
  moves: QCMoveChoice[],
  depth: number = 2
) {
  console.log(`\n=== ${name} ===`);

  const { engine } = createEngine();
  for (const m of moves) {
    const r = engine.executeMove(m);
    if (!r.success) {
      console.log(`  SKIP: move failed at ${JSON.stringify(m)}`);
      return;
    }
  }

  const startData = cloneGameData(engine.getGameData());
  const old = createExplorer(engine, startData, af);
  const stack = createStackExplorer(engine, startData, af) as StackExplorer;

  let errors = 0;
  let nodes = 0;

  function compare(oldExp: QCExplorer, stackExp: StackExplorer, d: number, path: string) {
    nodes++;
    const ov = oldExp.view;
    const sv = stackExp.view;

    for (let i = 0; i < 64; i++) {
      if (ov.gameData.board.pieces[i] !== sv.gameData.board.pieces[i]) {
        if (errors < 5) console.log(`  ${path} sq ${i}: piece old="${ov.gameData.board.pieces[i]}" stack="${sv.gameData.board.pieces[i]}"`);
        errors++;
      }
    }
    for (let i = 0; i < 64; i++) {
      if (Math.abs(ov.gameData.board.probabilities[i] - sv.gameData.board.probabilities[i]) > 0.02) {
        if (errors < 5) console.log(`  ${path} sq ${i}: prob old=${ov.gameData.board.probabilities[i].toFixed(3)} stack=${sv.gameData.board.probabilities[i].toFixed(3)}`);
        errors++;
      }
    }
    if (ov.legalMoves.count !== sv.legalMoves.count) {
      if (errors < 5) console.log(`  ${path}: legal moves old=${ov.legalMoves.count} stack=${sv.legalMoves.count}`);
      errors++;
    }

    if (d <= 0) return;

    const stdMoves = ov.legalMoves.standard.filter(m => !m.willMeasure).slice(0, 5);
    for (const m of stdMoves) {
      const choice: QCMoveChoice = { type: "standard", from: m.from, to: m.to };
      const oldR = oldExp.apply(choice);
      const stackR = stackExp.apply(choice);

      if (oldR.success && stackR.success) {
        compare(oldR.explorer, stackR.explorer === stackExp ? stackExp : stackR.explorer as any, d - 1, `${path}/${m.from}-${m.to}`);
      }
      if (stackR.explorer === stackExp) stackExp.undo();
    }

    const splitMoves = ov.legalMoves.splits.slice(0, 2);
    for (const m of splitMoves) {
      const choice: QCMoveChoice = { type: "split", from: m.from, targetA: m.targetA, targetB: m.targetB };
      const oldR = oldExp.apply(choice);
      const stackR = stackExp.apply(choice);

      if (oldR.success && stackR.success) {
        compare(oldR.explorer, stackR.explorer === stackExp ? stackExp : stackR.explorer as any, d - 1, `${path}/split${m.from}`);
      }
      if (stackR.explorer === stackExp) stackExp.undo();
    }
  }

  compare(old, stack, depth, "root");
  console.log(errors === 0
    ? `  PASS: ${nodes} nodes checked`
    : `  FAIL: ${errors} mismatches in ${nodes} nodes`);

  if (errors > 0) throw new Error(`${name}: ${errors} mismatches`);
}

async function main() {
  console.log("Initializing QuantumForge...");
  await init();

  // Scenario 0: Direct split comparison
  {
    console.log("\n=== Scenario 0: Split root comparison ===");
    const { engine } = createEngine();
    const startData = cloneGameData(engine.getGameData());
    const old = createExplorer(engine, startData, af);
    const stack = createStackExplorer(engine, startData, af) as StackExplorer;

    const split: QCMoveChoice = { type: "split", from: sq("b1"), targetA: sq("a3"), targetB: sq("c3") };
    const oldR = old.apply(split);
    const stackR = stack.apply(split);

    let mismatches = 0;
    for (const s of ["a3","c3","b1","g1","e2","a1"]) {
      const i = sq(s);
      const op = oldR.explorer.view.gameData.board.pieces[i];
      const sp = stackR.explorer.view.gameData.board.pieces[i];
      const opr = oldR.explorer.view.gameData.board.probabilities[i];
      const spr = stackR.explorer.view.gameData.board.probabilities[i];
      const match = op === sp && Math.abs(opr - spr) < 0.01;
      if (!match) mismatches++;
      console.log(`  ${s}(${i}): old=${op}/${opr.toFixed(2)} stack=${sp}/${spr.toFixed(2)}${match ? "" : " MISMATCH"}`);
    }

    // Apply a classical move on both and compare
    const pawnMove: QCMoveChoice = { type: "standard", from: sq("a7"), to: sq("a5") };
    const oldP = oldR.explorer.apply(pawnMove);
    const stackP = stackR.explorer.apply(pawnMove);
    console.log("  --- After a7-a5 ---");
    for (const s of ["a7","a5","g1","a3","c3"]) {
      const i = sq(s);
      const op = oldP.explorer.view.gameData.board.pieces[i];
      const sp = stackP.explorer.view.gameData.board.pieces[i];
      const opr = oldP.explorer.view.gameData.board.probabilities[i];
      const spr = stackP.explorer.view.gameData.board.probabilities[i];
      const match = op === sp && Math.abs(opr - spr) < 0.01;
      if (!match) mismatches++;
      console.log(`  ${s}(${i}): old=${op}/${opr.toFixed(2)} stack=${sp}/${spr.toFixed(2)}${match ? "" : " MISMATCH"}`);
    }
    if (mismatches > 0) throw new Error(`Scenario 0: ${mismatches} mismatches`);
    console.log("  PASS");
  }

  await testScenario("After split Nb1^a3c3", [
    { type: "split", from: sq("b1"), targetA: sq("a3"), targetB: sq("c3") },
  ]);

  await testScenario("Split + e5 + classical", [
    { type: "split", from: sq("b1"), targetA: sq("a3"), targetB: sq("c3") },
    { type: "standard", from: sq("e7"), to: sq("e5") },
    { type: "standard", from: sq("e2"), to: sq("e4") },
  ]);

  await testScenario("Two splits", [
    { type: "split", from: sq("b1"), targetA: sq("a3"), targetB: sq("c3") },
    { type: "split", from: sq("b8"), targetA: sq("a6"), targetB: sq("c6") },
  ]);

  await testScenario("Split + move superposed piece", [
    { type: "split", from: sq("b1"), targetA: sq("a3"), targetB: sq("c3") },
    { type: "standard", from: sq("e7"), to: sq("e5") },
    { type: "standard", from: sq("a3"), to: sq("b5") },
  ]);

  await testScenario("Split + measurement via capture", [
    { type: "standard", from: sq("e2"), to: sq("e4") },
    { type: "split", from: sq("b8"), targetA: sq("a6"), targetB: sq("c6") },
    { type: "standard", from: sq("d2"), to: sq("d4") },
    { type: "standard", from: sq("d7"), to: sq("d5") },
    { type: "standard", from: sq("e4"), to: sq("d5") },
  ]);

  await testScenario("Deep tree after split (depth 3)", [
    { type: "split", from: sq("b1"), targetA: sq("a3"), targetB: sq("c3") },
    { type: "standard", from: sq("e7"), to: sq("e5") },
  ], 3);

  // Regression tests
  await testScenario("Regression: classical pawn + split", [
    { type: "standard", from: sq("e2"), to: sq("e3") },
    { type: "split", from: sq("g8"), targetA: sq("h6"), targetB: sq("f6") },
  ]);

  await testScenario("Regression: d2-d3 c7-c5 then split", [
    { type: "standard", from: sq("d2"), to: sq("d3") },
    { type: "standard", from: sq("c7"), to: sq("c5") },
    { type: "split", from: sq("c1"), targetA: sq("e3"), targetB: sq("f4") },
  ]);

  await testScenario("Regression: h4 b5 then 2 splits", [
    { type: "standard", from: sq("h2"), to: sq("h4") },
    { type: "standard", from: sq("b7"), to: sq("b5") },
    { type: "split", from: sq("g1"), targetA: sq("h3"), targetB: sq("f3") },
    { type: "split", from: sq("g8"), targetA: sq("h6"), targetB: sq("f6") },
  ]);

  await testScenario("Regression: c4 b6 e3 deep queen split", [
    { type: "standard", from: sq("c2"), to: sq("c4") },
    { type: "standard", from: sq("b7"), to: sq("b6") },
    { type: "standard", from: sq("e2"), to: sq("e3") },
    { type: "standard", from: sq("a7"), to: sq("a5") },
    { type: "split", from: sq("d1"), targetA: sq("b3"), targetB: sq("a4") },
  ]);

  await testScenario("Regression: split+merge+resplit+measurements", [
    { type: "split", from: sq("g1"), targetA: sq("h3"), targetB: sq("f3") },
    { type: "standard", from: sq("a7"), to: sq("a5") },
    { type: "merge", sourceA: sq("f3"), sourceB: sq("h3"), to: sq("g1") },
    { type: "standard", from: sq("f7"), to: sq("f6") },
    { type: "standard", from: sq("f2"), to: sq("f3") },
    { type: "split", from: sq("b8"), targetA: sq("c6"), targetB: sq("a6") },
    { type: "split", from: sq("g1"), targetA: sq("h3"), targetB: sq("f3") },
  ], 3);

  await testScenario("Regression: d20 merge+meas chain (depth 2)", [
    { type: "standard", from: sq("d2"), to: sq("d4") },
    { type: "split", from: sq("g8"), targetA: sq("h6"), targetB: sq("f6") },
    { type: "split", from: sq("c1"), targetA: sq("f4"), targetB: sq("g5") },
  ], 2);

  await testScenario("Regression: swapSquares classicalOccupied leak", [
    { type: "split", from: sq("g1"), targetA: sq("h3"), targetB: sq("f3") },
    { type: "standard", from: sq("a7"), to: sq("a6") },
    { type: "merge", sourceA: sq("f3"), sourceB: sq("h3"), to: sq("g1") },
    { type: "standard", from: sq("h7"), to: sq("h6") },
    { type: "standard", from: sq("g1"), to: sq("h3") },
    { type: "standard", from: sq("d7"), to: sq("d6") },
    { type: "standard", from: sq("f2"), to: sq("f3") },
    { type: "split", from: sq("c8"), targetA: sq("d7"), targetB: sq("f5") },
  ], 3);

  console.log("\nAll parity tests passed.");
}

main().catch(e => { console.error(e); process.exit(1); });
