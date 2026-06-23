/**
 * One-call helpers for driving the engine standalone (position explorers,
 * analysis tools, test harnesses) without wiring up the module, adapter,
 * and engine by hand.
 *
 *   const explorer = await createPositionExplorer(
 *     "position fen 2KR2k1/5ppp/8/8/3q4/8/8/8 w - - 0 1"
 *   );
 *   const result = explorer.apply(explorer.view.legalMoves.standard[0]);
 *
 * For full games with two players, use createGameRunner() instead.
 */

import {
  parsePositionString,
  type QChessPosition,
  type RulesConfig,
} from "./core";
import { QuantumChessQuantumAdapterWasm, loadQCGameModule } from "./quantum";
import { QCEngine } from "./engine";
import { createStackExplorer } from "./stack-explorer";
import { DEFAULT_RULES } from "./rules-presets";
import type {
  QCExplorer, QCMoveChoice, QCMoveOption, QCSplitOption, QCMergeOption,
} from "./types";

/**
 * Convert a legal-move entry from `view.legalMoves` into an apply()-able
 * `QCMoveChoice`. The move *options* carry engine metadata (MoveType,
 * variant, notation); this picks out the fields apply()/executeMove() need.
 *
 *   const move = view.legalMoves.standard[0];
 *   explorer.apply(toMoveChoice(move));
 *
 * For a promotion, set `.promotion` on the result (e.g. `"q"`).
 */
export function toMoveChoice(
  option: QCMoveOption | QCSplitOption | QCMergeOption,
): QCMoveChoice {
  if ("targetA" in option && "targetB" in option) {
    return { type: "split", from: option.from, targetA: option.targetA, targetB: option.targetB };
  }
  if ("sourceA" in option && "sourceB" in option) {
    return { type: "merge", sourceA: option.sourceA, sourceB: option.sourceB, to: option.to };
  }
  return { type: "standard", from: option.from, to: option.to };
}

/** A position as a QChessPosition, or a position/FEN string to parse. */
export type PositionInput = string | QChessPosition;

export interface StandaloneOptions {
  /** Override individual rule fields; defaults to DEFAULT_RULES. */
  rules?: Partial<RulesConfig>;
}

function toPosition(input: PositionInput): QChessPosition {
  if (typeof input !== "string") return input;
  const parsed = parsePositionString(input);
  if (parsed) return parsed;
  // Allow a bare FEN too (no "fen"/"position" keyword).
  if (/^[1-8pnbrqkPNBRQK/]+\s+[wb]/.test(input.trim())) {
    return { startingFen: input.trim(), history: [] };
  }
  throw new Error(
    `createPositionExplorer: could not parse position "${input}". ` +
      `Expected a FEN or "position fen <fen> [setup ...] [moves ...]".`,
  );
}

/**
 * Load the engine for a position in a single await. Returns a QCEngine
 * ready for getView()/executeMove(). Accepts a QChessPosition or a
 * position/FEN string (e.g. one copied from the app).
 */
export async function createAnalysisEngine(
  position: PositionInput,
  options: StandaloneOptions = {},
): Promise<QCEngine> {
  const mod = await loadQCGameModule();
  const rules: RulesConfig = { ...DEFAULT_RULES, ...options.rules };
  const engine = new QCEngine(new QuantumChessQuantumAdapterWasm(mod), rules);
  engine.initializeFromPosition(toPosition(position));
  return engine;
}

/**
 * Load a sandboxed explorer (engine + do/undo lookahead) for a position
 * in a single await. The explorer's isolated simulations share the loaded
 * module. Accepts a QChessPosition or a position/FEN string.
 */
export async function createPositionExplorer(
  position: PositionInput,
  options: StandaloneOptions = {},
): Promise<QCExplorer> {
  const mod = await loadQCGameModule();
  const rules: RulesConfig = { ...DEFAULT_RULES, ...options.rules };
  const adapterFactory = () => new QuantumChessQuantumAdapterWasm(mod);
  const engine = new QCEngine(adapterFactory(), rules);
  engine.initializeFromPosition(toPosition(position));
  return createStackExplorer(engine, engine.getGameData(), adapterFactory);
}
