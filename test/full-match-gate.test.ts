#!/usr/bin/env npx tsx
/**
 * RELEASE GATE: a full match against the bundled PureSDKAdapter reference AI
 * must run to completion without player_exception.
 *
 * The 0.2.3/0.2.4 releases shipped with green unit tests but crashed the
 * wasm engine in every real match (forced-fail measurement trap + nested
 * undo-frame rollback use-after-free — fixed in the monorepo engine for
 * 0.2.5). This test closes that coverage gap: it exercises the exact
 * search pattern (both measurement branches explored with apply/undo)
 * that unit tests never hit.
 *
 * Mirrors the monorepo pin: quantum-chess/web-native/packages/qc-sdk/
 * test/release-gate-full-match.test.ts.
 */
import { createGameRunner, PureSDKAdapter } from "../src/index";

async function main() {
  const runner = await createGameRunner();
  const firstLegal = {
    name: "FirstLegal",
    control: "ai" as const,
    async chooseMove(view: any) {
      const m = view.legalMoves.standard[0];
      return { type: "standard" as const, from: m.from, to: m.to };
    },
  };
  const reference = new PureSDKAdapter("SDK AI", {
    maxDepth: 2,
    maxTimeMs: 2000,
  });

  const result = await runner.playMatch(firstLegal, reference, { maxPly: 30 });
  console.log(
    `full match: winner=${result.winner} reason=${result.reason} plies=${result.totalPly}`
  );

  if (result.reason === "player_exception") {
    console.log("FAIL: reference AI crashed (player_exception) — DO NOT RELEASE");
    process.exit(1);
  }
  console.log("full-match release gate: OK");
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
