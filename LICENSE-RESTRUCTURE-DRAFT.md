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

- Entity naming: Quantum Realm Games is a SOLE PROPRIETORSHIP — the legal
  person behind QRG and the Quantum Native brand is Christopher Cantwell
  individually, so licensor/copyright lines read "Christopher Cantwell,
  d/b/a Quantum Realm Games / Quantum Native". Confirm this reading
  across LICENSE.md (both parts), the venue agreement, the Steam EULA,
  and the site ToS.
- Trademark: QUANTUM CHESS, U.S. Reg. No. 5,242,360 (Class 9,
  "downloadable electronic game software"; registered 2017-07-11; §8/§15
  accepted 2023-06-14 — incontestable), owned by Christopher Cantwell.
  Because QRG is a sole proprietorship, owner and operator are the same
  person — NO intercompany trademark license is needed. Outbound venue/
  tournament licenses still need quality-control clauses (naked-licensing
  risk). If an entity is formed later, decide assign-vs-license for the
  mark then. Also confirm ownership/registration of the other marks
  (Quantum Native, Quantum Forge, Quantris, Ponq, Bloch Invaders).
- Entity formation: flag for discussion — venue licensing, public
  installations, and subscription billing under a sole proprietorship
  expose personal assets. LLC formation (plus general/E&O liability
  insurance for exhibit installs) is worth pricing before the first
  venue agreement is signed.
- **DEADLINE: §8/§9 ten-year renewal window is open** (USPTO courtesy
  reminder sent 2026-07-11); file by 2027-07-11 (grace to 2028-01-11 with
  surcharge). Calendar it now.
- Class scope: the registration covers Class 9 only. Venue exhibition,
  arcade operation, and tournament services are Class 41 — consider a new
  application now that these are revenue lines.

- Patent posture: if Quantum Native holds patent claims covering quantum
  chess mechanics, (a) confirm MIT (no express patent grant) is preferred
  over Apache-2.0 for the code layer, and (b) decide whether the Engine
  License should include an express no-patent-license clause.
- Prior versions (0.2.0–0.3.0) shipped with an unqualified `"license":
  "MIT"` package field and no engine carve-out. The package has
  effectively no installed base (one known tester), so we're simply
  correcting the metadata at vNEXT rather than adding prior-version
  clarification language. Flag if you see a reason to do more.
- Governing law / venue for the Engine License.
- Whether "Engine Binary" should also enumerate hashes/filenames per
  release or the current definitional language suffices.
