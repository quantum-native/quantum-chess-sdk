import type { RulesConfig } from "./core";

/**
 * Standard quantum chess rules: superposition, split/merge, castling, en
 * passant, promotion, checkmate objective. Spread and override fields to
 * customize:  `{ ...DEFAULT_RULES, allowCastling: false }`.
 */
export const DEFAULT_RULES: RulesConfig = {
  quantumEnabled: true,
  allowSplitMerge: true,
  allowMeasurementAnnotations: true,
  allowCastling: true,
  allowEnPassant: true,
  allowPromotion: true,
  objective: "checkmate",
};

/** Classical chess rules: quantum and split/merge disabled. */
export const CLASSICAL_RULES: RulesConfig = {
  ...DEFAULT_RULES,
  quantumEnabled: false,
  allowSplitMerge: false,
};
