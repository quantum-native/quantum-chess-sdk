#!/usr/bin/env npx tsx
/**
 * Regression suite for the WASM-adapter SDK (0.2.3+).
 *
 * Replaces the legacy sample/parity/deep-undo scripts, which were written
 * against the removed port-backed QuantumChessQuantumAdapter +
 * createQuantumForgePort. Covers the behaviours reported broken on the
 * old adapter:
 *   - capture through StackExplorer.apply updates the view
 *   - setupMoves (splits) are reflected in the engine state
 * plus basic move/undo and sampling on the WASM adapter.
 */
import {
  QCEngine, QuantumChessQuantumAdapterWasm, loadQCGameModule, createStackExplorer,
  createPositionExplorer, DEFAULT_RULES, parsePositionString, toMoveChoice,
} from "../src/index";

const RULES = {
  quantumEnabled: true, allowSplitMerge: true, allowMeasurementAnnotations: true,
  allowCastling: true, allowEnPassant: true, allowPromotion: true, objective: "checkmate" as const,
};
const sq = (s: string) => (s.charCodeAt(0) - 97) + (parseInt(s[1]) - 1) * 8;

let passed = 0, failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; } else { failed++; console.log("  FAIL: " + msg); }
}

async function main() {
  const mod = await loadQCGameModule();
  const af = () => new QuantumChessQuantumAdapterWasm(mod);

  // --- 1: classical move + undo via QCEngine ---
  console.log("Test 1: standard move + undo");
  {
    const engine = new QCEngine(af(), RULES);
    engine.initializeFromPosition({ startingFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", history: [] });
    const r = engine.executeMove({ type: "standard", from: sq("e2"), to: sq("e4") });
    assert(r.success, "e2-e4 should succeed");
    assert(engine.getGameData().board.pieces[sq("e4")] === "P", "pawn on e4 after move");
    assert(engine.undoMove(), "undo should succeed");
    assert(engine.getGameData().board.pieces[sq("e2")] === "P", "pawn back on e2 after undo");
    assert(engine.getGameData().board.pieces[sq("e4")] === ".", "e4 empty after undo");
  }

  // --- 2: capture through StackExplorer (the reported bug) ---
  console.log("Test 2: rook captures queen through explorer");
  {
    const engine = new QCEngine(af(), RULES);
    engine.initializeFromPosition({ startingFen: "2KR2k1/5ppp/8/8/3q4/8/8/8 w - - 0 1", history: [] });
    const ex = createStackExplorer(engine, engine.getGameData(), af);
    assert(ex.view.gameData.board.pieces[sq("d8")] === "R", "rook on d8 initially");
    assert(ex.view.gameData.board.pieces[sq("d4")] === "q", "queen on d4 initially");
    const res = ex.apply({ type: "standard", from: sq("d8"), to: sq("d4") });
    assert(res.success, "capture should report success");
    assert(ex.view.gameData.board.pieces[sq("d8")] === ".", "d8 empty after capture");
    assert(ex.view.gameData.board.pieces[sq("d4")] === "R", "rook on d4 after capture");
  }

  // --- 3: setup splits reflected (the reported bug) ---
  console.log("Test 3: setupMoves reflected in engine state");
  {
    const engine = new QCEngine(af(), RULES);
    engine.initializeFromPosition({
      startingFen: "2KR2k1/5ppp/8/8/8/8/8/8 w - - 0 1",
      setupMoves: ["g8^f8h8", "d8^d7g8"], history: [],
    });
    const view = engine.getView();
    const probs = view.gameData.board.probabilities;
    assert(probs[sq("d8")] < 0.99, "rook split off d8 (prob < 1)");
    assert(probs[sq("d7")] > 0.01, "rook present on d7");
    const froms = new Set(view.legalMoves.standard.map((m) => m.from));
    assert(froms.has(sq("d7")) || froms.has(sq("g8")), "legal moves originate from split squares");
  }

  // --- 4: sample() on a classical position returns the board ---
  console.log("Test 4: sample on classical position");
  {
    const engine = new QCEngine(af(), RULES);
    engine.initializeFromPosition({ startingFen: "2KR2k1/5ppp/8/8/3q4/8/8/8 w - - 0 1", history: [] });
    const ex = createStackExplorer(engine, engine.getGameData(), af);
    const samples = ex.sample(50);
    assert(samples.length === 50, "50 samples returned");
    const ref = engine.getGameData().board.pieces;
    assert(samples.every((s) => s.pieces.every((p, i) => p === ref[i])), "classical samples match board");
  }

  // --- 5: one-call createPositionExplorer from a pasted position string ---
  console.log("Test 5: createPositionExplorer from a position string");
  {
    const ex = await createPositionExplorer(
      "position fen 2KR2k1/5ppp/8/8/8/8/8/8 w - - 0 1 setup g8^f8h8 d8^d7g8",
    );
    const probs = ex.view.gameData.board.probabilities;
    assert(probs[sq("d8")] < 0.99, "string with setup: rook split off d8");
    assert(ex.view.legalMoves.standard.length > 0, "legal moves available");
    // toMoveChoice makes a legal-move option directly apply()-able.
    const applied = ex.apply(toMoveChoice(ex.view.legalMoves.standard[0]));
    assert(applied.success, "toMoveChoice(option) applies successfully");
  }

  // --- 6: DEFAULT_RULES preset + parsePositionString are exported ---
  console.log("Test 6: exported helpers");
  {
    assert(DEFAULT_RULES.quantumEnabled === true, "DEFAULT_RULES exported");
    const p = parsePositionString("position fen 2KR2k1/5ppp/8/8/8/8/8/8 w - - 0 1 setup d8^d7g8");
    assert(p !== null && p.setupMoves?.[0] === "d8^d7g8", "parsePositionString round-trips setup");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
