# DRAFT — split-license restructure for the next SDK release

**Status: draft for lawyer review. Not in effect. Do not release the SDK
with these files until counsel signs off.** Drafted 2026-08-03.

This file is the release checklist; the proposed license text is in
`LICENSE.md.draft` alongside it. Neither file is in `package.json`
`files`, so nothing here ships by accident.

## What changes at the next release (vNEXT)

1. Replace `LICENSE` with `LICENSE.md` (content: `LICENSE.md.draft`).
2. `package.json`:
   - `"license": "SEE LICENSE IN LICENSE.md"`
   - `"files": ["dist", "README.md", "LICENSE.md"]`
3. README "License" section: point at LICENSE.md and summarize the split
   (SDK code MIT; engine binary under the Engine License). The
   "Trademarks and intended use" section already exists.
4. Release notes: "Licensing clarified — the SDK's TypeScript/JavaScript
   remains MIT. The bundled quantum engine binary (`qc-game.wasm`) is
   licensed for community AI development for the official app and
   sanctioned events. If you're building bots, nothing changes for you."
5. Monorepo follow-up: mark `docs/quantum-forge-chess-license.md` as
   superseded by the Engine License here.

## Questions for counsel

- Patent posture: if Quantum Native holds patent claims covering quantum
  chess mechanics, (a) confirm MIT (no express patent grant) is preferred
  over Apache-2.0 for the code layer, and (b) decide whether the Engine
  License should include an express no-patent-license clause.
- Versions 0.1.x–0.3.0 were published with an unqualified `"license":
  "MIT"` covering the whole package including the engine binary. We treat
  that grant as irrevocable for those versions and are not attempting to
  claw it back — confirm the "prior versions" note in the Engine License
  handles this correctly.
- Governing law / venue for the Engine License.
- Whether "Engine Binary" should also enumerate hashes/filenames per
  release or the current definitional language suffices.
