# Changelog

## 0.7.0 (2026-09-24)

**Universal QC riders.** A phase rotation can now take any angle, and a split
or merge can take a strength. Both are gated by the rules:
`UNIVERSAL_QC_VARIANT` turns them on (`phaseAnyAngle`, `allowSplitStrength`).
`QCMoveChoice` gains `splitFraction` on splits and merges. A split's first
iSwap, from the source to `targetA`, runs at that fraction. A merge's iSwap
with `sourceA` runs at minus that fraction, so a merge at a strength undoes
a split at that strength. In notation, `.a<millidegrees>` is an angle that
is not a whole quarter turn and `.s<n>` is a strength of n/10000, e.g.
`g1^f3h3.s2500.a45000`. Whole quarter turns are still `.p<k>`. New helpers:
`formatRiderSuffix`, `normalizePhaseQuarters`, `normalizeSplitFraction`,
`isWholeQuarterPhase`.

**Breaking: a fraction of a quarter turn is refused, not rounded.** Under
rules without `phaseAnyAngle`, `phaseQuarters: 1.4` used to play as 1; it now
fails with an error.

**Breaking: `QuantumChessAdapter` has two more methods.** `stateSizeBound(move)`
and `maxStateSize()`. The engine refuses a move whose entangled state could
pass the simulator's cap of 100,000 basis states, instead of letting the
simulator throw part way through the move. Custom adapters must implement
both. A move refused this way returns an error and the player may try again;
an AI that keeps offering a refused move ends the match as a draw after
three tries.

Also new: `takebackAllowedInMode`, `takebackAllowedForGame` and
`takebackPlyCount` for agreed takebacks, and `SerialQueue`, which the module
worker player now uses so concurrent engine requests run one at a time.

**License.** `LICENSE.md` now names the engine binary wherever it appears,
including `src/quantum/wasm/qc-game.wasm` in this repository and its history.
Versions 0.2.3 to 0.5.0 shipped the engine binary with MIT metadata; they are
deprecated.

## 0.6.0 (2026-09-04)

**License: the package is now explicitly split-licensed.** The TypeScript
and JavaScript in this package stay MIT. The engine binary
(`dist/wasm/qc-game.wasm`) is proprietary, built from closed source, and
licensed under the Quantum Native Engine License for community AI
development: building and running AI players and analysis tools for Quantum
Chess, entering the official app and sanctioned events, and personal,
educational or research projects that are not themselves a product. Powering
another game, product or service with it needs a separate license. Read
[LICENSE.md](LICENSE.md); `package.json` now says `SEE LICENSE IN
LICENSE.md` instead of `MIT`. The licensor is Quantum Realm Games LLC, doing
business as Quantum Native, and governing law is California.

**Breaking: `ALCHEMY_SEASON_1_VARIANT` is gone.** A league season is data on
the server, not a constant in the SDK. Build the variant from the gates the
active-season query reports with `variantFromSeasonGates(variantId, gates)`;
`VariantGates` is `{ allowSplit, allowMerge, allowPhaseRotation }`.

**Breaking: `detectKingCapture` can return `"draw"`.** One measurement
removing both kings is mutual annihilation and a draw, not a white win.
Callers that switch on the result need the new case.

Game-end reasons grew two values: `"measurement"` (a collapse removed the
losing king without the move landing on him) and `"annihilation"` (both
kings gone). `"checkmate"` now means the winning move took the king off his
square.

Move records carry three optional fields: `capturedPiece` (the symbol the
move took), `moverWasSuperposed`, and `slidThroughSuperposed`.

`QCMatchConfig.clocks` (`{ whiteMs, blackMs }`) starts a match with the
remaining time of a game in progress instead of the time control's initial
time. `takebackPlyCount(ply, requester)` says how many plies an agreed
takeback rewinds. `isOnlineHumanMode` and `slidePathSquares` are exported.

## 0.5.0 (2026-08-15)

Pi/2 phase rider on moves and a split rules config. Shipped without a
changelog entry; see the tag.

## 0.4.1 (2026-08-10)

Engine glue rebuilt without dynamic code evaluation. Shipped without a
changelog entry; see the tag.

## 0.3.0 (2026-07-30)

Explorer correctness. Every fix here changed behaviour that previously looked
successful while being wrong, so read the breaking change before upgrading.

**Breaking: `apply()` now always applies the move.**

A move that would collapse a superposition used to return `success: true`
while applying nothing and pushing no undo entry, leaving the caller to
re-apply it with `forceMeasurement`. It now applies like any other move, with
a random outcome unless `forceMeasurement` picks a branch.

`measurementPassProbability` is no longer a signal that nothing happened — it
is now reported on any measuring move, including forced ones (where it used to
be `undefined`). If your code treats that field as "this was only a probe" and
skips the `undo()`, it will now leak undo entries. The rule is simply:

```ts
const r = explorer.apply(choice);
if (r.success) { /* the move was applied — pair it with exactly one undo() */ }
else           { /* nothing changed — do NOT undo */ }
```

- **Undo across a measurement now restores the quantum state.** It previously
  restored the board but not the amplitudes: a piece split 50/50 came back
  fully collapsed onto one square. The board cache reported the superposition
  as restored, so nothing looked wrong — but any search exploring both
  measurement branches evaluated its second branch from a position that never
  existed. Undo now replays the position when a measurement could have
  collapsed something. Expect roughly 25-50% less search throughput; this is
  the cost of the branches being real.
- **Fixed pieces vanishing after a classical move followed by a quantum one.**
  The explorer updated the board itself for classical moves without telling the
  simulator, so the next move through the engine re-read the board from a
  simulator that never saw those moves and pruned the pieces away —
  `success: true`, pieces gone.
- **The explorer now rejects illegal moves.** On a fully classical position it
  used to write any standard move straight onto the board and report success.
- **Fixed a memory leak in long games and searches.** Rejected moves leaked
  engine undo state, and a committed game's undo state was never released, both
  of which pin retired quantum properties in the engine.
- The bundled reference AI now weights measurement branches by their real
  probability instead of a hardcoded 0.5.

## 0.2.5 (2026-07-07)

- Fixed two engine crashes that killed real matches ("function signature mismatch"
  wasm traps): a dangling property after forced-fail measurement exploration, and a
  use-after-free in nested undo-frame rollback. Any AI exploring both measurement
  branches (including the bundled reference AI) was affected.
- Added a full-match release gate to the test suite.

## 0.2.4 (2026-07-06)

- Type cleanups in the bundled engine bindings. (Both 0.2.3 and 0.2.4 crash in
  real matches — upgrade to 0.2.5.)

## 0.2.3 (2026-06-22)

- Replaced the legacy port adapter with the bundled WASM engine.

## 0.2.2 (2026-04-27)

- Test suite and CI publish workflow.

## 0.2.0 / 0.2.1 (2026-04-21)

- Initial public release: match runner, explorer, tournament system, reference AI.
