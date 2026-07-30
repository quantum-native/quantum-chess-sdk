# Changelog

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
