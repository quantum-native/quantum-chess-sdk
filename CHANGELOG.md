# Changelog

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
