#!/usr/bin/env npx tsx
/**
 * Validate StackExplorer.sample() produces correct correlated samples.
 *
 * Tests:
 * 1. Classical position: all samples identical to the board
 * 2. Single split: piece on exactly one of two squares, never both
 * 3. Two independent splits: 4 combos each ~25%
 * 4. Classical squares unchanged in quantum position
 * 5. Sample after apply + undo preserves distribution
 * 6. Knight split + bishop split (different pieces)
 * 7. Split then pawn slide through superposed square (entanglement)
 * 8. Pawn promotion
 */
import { QuantumChessQuantumAdapter, createQuantumForgePort, createIsolatedPort } from "../src/quantum";
import type { QuantumForgeLikeModule } from "../src/quantum";
import { QCEngine } from "../src/engine";
import { createStackExplorer } from "../src/stack-explorer";

const N = 1000;

async function main() {
  const QFW = await import("@quantum-native/quantum-forge-chess");
  await QFW.QuantumForge.initialize({
    printErr: (msg: string) => { if (!msg.includes("destroying entangled")) console.error(msg); }
  } as any);

  const rules = {
    quantumEnabled: true, allowSplitMerge: true, allowMeasurementAnnotations: true,
    allowCastling: true, allowEnPassant: true, allowPromotion: true, objective: "checkmate" as any,
  };
  const FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const sq = (s: string) => (s.charCodeAt(0) - 97) + (parseInt(s[1]) - 1) * 8;

  let passed = 0;
  let failed = 0;

  function assert(cond: boolean, msg: string) {
    if (!cond) { console.log("  FAIL: " + msg); failed++; }
    else passed++;
  }

  // --- Test 1: Classical position ---
  console.log("Test 1: Classical position");
  {
    const mainAdapter = new QuantumChessQuantumAdapter(createQuantumForgePort(QFW as unknown as QuantumForgeLikeModule));
    const engine = new QCEngine(mainAdapter, rules);
    engine.initializeFromPosition({ startingFen: FEN, history: ["e2-e4", "e7-e5"] });

    const af = () => new QuantumChessQuantumAdapter(createIsolatedPort(QFW as unknown as QuantumForgeLikeModule));
    const explorer = createStackExplorer(engine, engine.getGameData(), af);

    const samples = explorer.sample(N);
    assert(samples.length === N, `expected ${N} samples, got ${samples.length}`);

    const refPieces = engine.getGameData().board.pieces;
    let allMatch = true;
    for (const s of samples) {
      for (let i = 0; i < 64; i++) {
        if (s.pieces[i] !== refPieces[i]) { allMatch = false; break; }
      }
      if (!allMatch) break;
    }
    assert(allMatch, "all classical samples should match the board exactly");
    console.log("  " + (allMatch ? "PASS" : "FAIL"));

    (explorer as any).dispose();
    mainAdapter.clear();
  }

  // --- Test 2: Single split (g1^h3f3) ---
  console.log("Test 2: Single split (g1^h3f3)");
  {
    const mainAdapter = new QuantumChessQuantumAdapter(createQuantumForgePort(QFW as unknown as QuantumForgeLikeModule));
    const engine = new QCEngine(mainAdapter, rules);
    engine.initializeFromPosition({ startingFen: FEN, history: ["g1^h3f3"] });

    const af = () => new QuantumChessQuantumAdapter(createIsolatedPort(QFW as unknown as QuantumForgeLikeModule));
    const explorer = createStackExplorer(engine, engine.getGameData(), af);

    const h3 = sq("h3");
    const f3 = sq("f3");
    const g1 = sq("g1");

    const samples = explorer.sample(N);

    let bothPresent = 0;
    let neitherPresent = 0;
    let h3Only = 0;
    let f3Only = 0;
    let g1Present = 0;

    for (const s of samples) {
      const hasH3 = s.pieces[h3] === "N";
      const hasF3 = s.pieces[f3] === "N";
      if (hasH3 && hasF3) bothPresent++;
      else if (!hasH3 && !hasF3) neitherPresent++;
      else if (hasH3) h3Only++;
      else f3Only++;
      if (s.pieces[g1] === "N") g1Present++;
    }

    assert(bothPresent === 0, `knight on BOTH h3 and f3: ${bothPresent} (should be 0)`);
    assert(neitherPresent === 0, `knight on NEITHER h3 nor f3: ${neitherPresent} (should be 0)`);
    assert(g1Present === 0, `knight still on g1: ${g1Present} (should be 0)`);
    assert(h3Only > N * 0.4 && h3Only < N * 0.6, `h3 only: ${h3Only}/${N} (expected ~50%)`);
    assert(f3Only > N * 0.4 && f3Only < N * 0.6, `f3 only: ${f3Only}/${N} (expected ~50%)`);
    console.log(`  h3=${h3Only} f3=${f3Only} both=${bothPresent} neither=${neitherPresent}`);
    console.log("  " + (bothPresent === 0 && neitherPresent === 0 ? "PASS" : "FAIL"));

    (explorer as any).dispose();
    mainAdapter.clear();
  }

  // --- Test 3: Two independent splits ---
  console.log("Test 3: Two independent splits (g1^h3f3, b8^c6a6)");
  {
    const mainAdapter = new QuantumChessQuantumAdapter(createQuantumForgePort(QFW as unknown as QuantumForgeLikeModule));
    const engine = new QCEngine(mainAdapter, rules);
    engine.initializeFromPosition({ startingFen: FEN, history: ["g1^h3f3", "b8^c6a6"] });

    const af = () => new QuantumChessQuantumAdapter(createIsolatedPort(QFW as unknown as QuantumForgeLikeModule));
    const explorer = createStackExplorer(engine, engine.getGameData(), af);

    const h3 = sq("h3");
    const f3 = sq("f3");
    const c6 = sq("c6");
    const a6 = sq("a6");

    const samples = explorer.sample(N);

    let whiteBoth = 0;
    let whiteNeither = 0;
    let blackBoth = 0;
    let blackNeither = 0;

    const combos: Record<string, number> = {};

    for (const s of samples) {
      const wH3 = s.pieces[h3] === "N";
      const wF3 = s.pieces[f3] === "N";
      const bC6 = s.pieces[c6] === "n";
      const bA6 = s.pieces[a6] === "n";

      if (wH3 && wF3) whiteBoth++;
      if (!wH3 && !wF3) whiteNeither++;
      if (bC6 && bA6) blackBoth++;
      if (!bC6 && !bA6) blackNeither++;

      const key = (wH3 ? "h3" : "f3") + "+" + (bC6 ? "c6" : "a6");
      combos[key] = (combos[key] ?? 0) + 1;
    }

    assert(whiteBoth === 0, `white knight on both: ${whiteBoth}`);
    assert(whiteNeither === 0, `white knight on neither: ${whiteNeither}`);
    assert(blackBoth === 0, `black knight on both: ${blackBoth}`);
    assert(blackNeither === 0, `black knight on neither: ${blackNeither}`);

    for (const [key, count] of Object.entries(combos)) {
      assert(count > N * 0.18 && count < N * 0.32, `combo ${key}: ${count}/${N} (expected ~25%)`);
    }

    console.log("  combos:", combos);
    console.log("  " + (whiteBoth === 0 && blackBoth === 0 ? "PASS" : "FAIL"));

    (explorer as any).dispose();
    mainAdapter.clear();
  }

  // --- Test 4: Classical squares unchanged ---
  console.log("Test 4: Classical squares unchanged in quantum position");
  {
    const mainAdapter = new QuantumChessQuantumAdapter(createQuantumForgePort(QFW as unknown as QuantumForgeLikeModule));
    const engine = new QCEngine(mainAdapter, rules);
    engine.initializeFromPosition({ startingFen: FEN, history: ["g1^h3f3", "e7-e5"] });

    const af = () => new QuantumChessQuantumAdapter(createIsolatedPort(QFW as unknown as QuantumForgeLikeModule));
    const explorer = createStackExplorer(engine, engine.getGameData(), af);

    const classicalSquares = [
      sq("a1"), sq("b1"), sq("c1"), sq("d1"), sq("e1"), sq("f1"),
      sq("a2"), sq("b2"), sq("c2"), sq("d2"), sq("f2"), sq("g2"), sq("h2"),
      sq("a7"), sq("b7"), sq("c7"), sq("d7"), sq("f7"), sq("g7"), sq("h7"),
      sq("a8"), sq("b8"), sq("c8"), sq("d8"), sq("e8"), sq("f8"), sq("g8"), sq("h8"),
      sq("e5"),
    ];

    const refPieces = engine.getGameData().board.pieces;
    const samples = explorer.sample(N);

    let classicalMismatches = 0;
    for (const s of samples) {
      for (const csq of classicalSquares) {
        if (s.pieces[csq] !== refPieces[csq]) classicalMismatches++;
      }
    }

    assert(classicalMismatches === 0, `classical square mismatches: ${classicalMismatches} (should be 0)`);
    console.log("  " + (classicalMismatches === 0 ? "PASS" : "FAIL"));

    (explorer as any).dispose();
    mainAdapter.clear();
  }

  // --- Test 5: Sample after search apply/undo ---
  console.log("Test 5: Sample after apply + undo preserves distribution");
  {
    const mainAdapter = new QuantumChessQuantumAdapter(createQuantumForgePort(QFW as unknown as QuantumForgeLikeModule));
    const engine = new QCEngine(mainAdapter, rules);
    engine.initializeFromPosition({ startingFen: FEN, history: ["g1^h3f3", "e7-e5"] });

    const af = () => new QuantumChessQuantumAdapter(createIsolatedPort(QFW as unknown as QuantumForgeLikeModule));
    const explorer = createStackExplorer(engine, engine.getGameData(), af);

    const h3 = sq("h3");
    const samplesBefore = explorer.sample(N);
    const h3Before = samplesBefore.filter(s => s.pieces[h3] === "N").length;

    const move = explorer.view.legalMoves.standard[0];
    explorer.apply({ type: "standard", from: move.from, to: move.to });
    explorer.undo();

    const samplesAfter = explorer.sample(N);
    const h3After = samplesAfter.filter(s => s.pieces[h3] === "N").length;

    const diff = Math.abs(h3Before - h3After);
    assert(diff < N * 0.1, `h3 count before=${h3Before} after=${h3After} diff=${diff} (should be < ${N * 0.1})`);
    console.log(`  before: h3=${h3Before}  after: h3=${h3After}`);
    console.log("  " + (diff < N * 0.1 ? "PASS" : "FAIL"));

    (explorer as any).dispose();
    mainAdapter.clear();
  }

  // --- Test 6: Splits on two different piece types ---
  console.log("Test 6: Knight split + bishop split (different pieces)");
  {
    const mainAdapter = new QuantumChessQuantumAdapter(createQuantumForgePort(QFW as unknown as QuantumForgeLikeModule));
    const engine = new QCEngine(mainAdapter, rules);
    engine.initializeFromPosition({ startingFen: FEN, history: ["g1^h3f3", "d7-d6", "f1^c4e2"] });

    const af = () => new QuantumChessQuantumAdapter(createIsolatedPort(QFW as unknown as QuantumForgeLikeModule));
    const explorer = createStackExplorer(engine, engine.getGameData(), af);

    const h3 = sq("h3");
    const f3 = sq("f3");
    const c4 = sq("c4");
    const e2 = sq("e2");

    const samples = explorer.sample(N);

    let knightBoth = 0;
    let knightNeither = 0;
    let bishopBoth = 0;
    let bishopNeither = 0;

    for (const s of samples) {
      const kH3 = s.pieces[h3] === "N";
      const kF3 = s.pieces[f3] === "N";
      const bC4 = s.pieces[c4] === "B";
      const bE2 = s.pieces[e2] === "B";

      if (kH3 && kF3) knightBoth++;
      if (!kH3 && !kF3) knightNeither++;
      if (bC4 && bE2) bishopBoth++;
      if (!bC4 && !bE2) bishopNeither++;
    }

    assert(knightBoth === 0, `knight on both: ${knightBoth}`);
    assert(knightNeither === 0, `knight on neither: ${knightNeither}`);
    assert(bishopBoth === 0, `bishop on both: ${bishopBoth}`);
    assert(bishopNeither === 0, `bishop on neither: ${bishopNeither}`);
    console.log(`  knight: both=${knightBoth} neither=${knightNeither}  bishop: both=${bishopBoth} neither=${bishopNeither}`);
    console.log("  " + (knightBoth === 0 && knightNeither === 0 && bishopBoth === 0 && bishopNeither === 0 ? "PASS" : "FAIL"));

    (explorer as any).dispose();
    mainAdapter.clear();
  }

  // --- Test 7: Split then pawn slide through superposed square ---
  console.log("Test 7: Split knight (g1^h3f3) then f2-f4 (pawn entangles with knight)");
  {
    const mainAdapter = new QuantumChessQuantumAdapter(createQuantumForgePort(QFW as unknown as QuantumForgeLikeModule));
    const engine = new QCEngine(mainAdapter, rules);
    engine.initializeFromPosition({ startingFen: FEN, history: ["g1^h3f3", "a7-a6", "f2-f4"] });

    const af = () => new QuantumChessQuantumAdapter(createIsolatedPort(QFW as unknown as QuantumForgeLikeModule));
    const explorer = createStackExplorer(engine, engine.getGameData(), af);

    const h3 = sq("h3");
    const f3 = sq("f3");
    const f2 = sq("f2");
    const f4 = sq("f4");

    const samples = explorer.sample(N);

    let knightH3_pawnF4 = 0;
    let knightF3_pawnF2 = 0;
    let knightH3_pawnF2 = 0;
    let knightF3_pawnF4 = 0;
    let other = 0;

    for (const s of samples) {
      const kH3 = s.pieces[h3] === "N";
      const kF3 = s.pieces[f3] === "N";
      const pF2 = s.pieces[f2] === "P";
      const pF4 = s.pieces[f4] === "P";

      if (kH3 && pF4 && !kF3 && !pF2) knightH3_pawnF4++;
      else if (kF3 && pF2 && !kH3 && !pF4) knightF3_pawnF2++;
      else if (kH3 && pF2) knightH3_pawnF2++;
      else if (kF3 && pF4) knightF3_pawnF4++;
      else other++;
    }

    assert(knightH3_pawnF2 === 0, `knight h3 + pawn f2 (wrong correlation): ${knightH3_pawnF2}`);
    assert(knightF3_pawnF4 === 0, `knight f3 + pawn f4 (wrong correlation): ${knightF3_pawnF4}`);
    assert(other === 0, `unexpected combinations: ${other}`);
    assert(knightH3_pawnF4 > N * 0.4, `knight h3 + pawn f4: ${knightH3_pawnF4}/${N} (expected ~50%)`);
    assert(knightF3_pawnF2 > N * 0.4, `knight f3 + pawn f2: ${knightF3_pawnF2}/${N} (expected ~50%)`);

    console.log(`  h3+f4=${knightH3_pawnF4} f3+f2=${knightF3_pawnF2} h3+f2=${knightH3_pawnF2} f3+f4=${knightF3_pawnF4} other=${other}`);
    console.log("  " + (knightH3_pawnF2 === 0 && knightF3_pawnF4 === 0 && other === 0 ? "PASS" : "FAIL"));

    (explorer as any).dispose();
    mainAdapter.clear();
  }

  // --- Test 8: Promotion ---
  console.log("Test 8: Pawn promotion to queen");
  {
    const promoFen = "k7/4P3/8/8/8/8/8/4K3 w - - 0 1";
    const mainAdapter = new QuantumChessQuantumAdapter(createQuantumForgePort(QFW as unknown as QuantumForgeLikeModule));
    const engine = new QCEngine(mainAdapter, rules);
    engine.initializeFromPosition({ startingFen: promoFen, history: [] });

    const af = () => new QuantumChessQuantumAdapter(createIsolatedPort(QFW as unknown as QuantumForgeLikeModule));
    const explorer = createStackExplorer(engine, engine.getGameData(), af);

    const e7 = sq("e7");
    const e8 = sq("e8");

    const promoMove = explorer.view.legalMoves.standard.find(
      m => m.from === e7 && m.to === e8 && m.promotionChoices?.includes("q")
    );
    assert(promoMove !== undefined, "promotion move e7-e8=q should be legal");

    if (promoMove) {
      const result = explorer.apply({ type: "standard", from: e7, to: e8, promotion: "q" });
      assert(result.success, "promotion move should succeed");

      if (result.success) {
        const gd = explorer.view.gameData;
        assert(gd.board.pieces[e8] === "Q", `e8 should be Q after promotion, got: ${gd.board.pieces[e8]}`);
        assert(gd.board.pieces[e7] === ".", `e7 should be empty after promotion, got: ${gd.board.pieces[e7]}`);

        const samples = explorer.sample(100);
        const allQueen = samples.every(s => s.pieces[e8] === "Q");
        assert(allQueen, "all samples should show Q on e8 after promotion");

        explorer.undo();
        const afterUndo = explorer.view.gameData;
        assert(afterUndo.board.pieces[e7] === "P", `e7 should be P after undo, got: ${afterUndo.board.pieces[e7]}`);
        assert(afterUndo.board.pieces[e8] === ".", `e8 should be empty after undo, got: ${afterUndo.board.pieces[e8]}`);
      }
    }
    console.log("  PASS");

    (explorer as any).dispose();
    mainAdapter.clear();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
