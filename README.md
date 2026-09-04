# Quantum Chess SDK

Build AI players for [Quantum Chess](https://quantumchess.net). The SDK provides the full quantum chess engine (legal moves, quantum state simulation, measurements) so you only need to implement one method: pick a move.

## Install

```bash
npm install @quantum-native/quantum-chess-sdk
```

No registry configuration is needed — the package and its engine are on the
public npm registry. If install fails with a **404 / "not found" from
`npm.pkg.github.com`**, your `.npmrc` is routing the `@quantum-native` scope to
GitHub Packages. Remove that line so the scope resolves to public npm:

```
# delete this if present in ~/.npmrc or ./.npmrc
@quantum-native:registry=https://npm.pkg.github.com
```

## Quick Start

```typescript
import type { QCPlayer, QCMoveChoice } from "@quantum-native/quantum-chess-sdk";

const myAI: QCPlayer = {
  name: "MyFirstAI",
  control: "ai",

  async chooseMove(view, explorer, clock) {
    // Pick the first legal move
    const move = view.legalMoves.standard[0];
    return { type: "standard", from: move.from, to: move.to };
  }
};

export default myAI;
```

That's a complete AI. The engine handles everything else: quantum physics, move validation, board state, measurements.

## What You Get

When your `chooseMove` is called, you receive:

- **`view.gameData`** -- current board: 64 pieces, 64 probabilities, ply count, castle flags, en passant
- **`view.legalMoves`** -- every legal move pre-computed, split into `standard`, `splits`, and `merges`
- **`view.sideToMove`** -- `"white"` or `"black"`
- **`explorer`** -- a sandboxed engine clone for lookahead (see below)
- **`clock`** -- time remaining in milliseconds (null if untimed)

You return one of:

```typescript
{ type: "standard", from: 12, to: 28 }              // e2-e4
{ type: "split", from: 1, targetA: 16, targetB: 18 } // knight splits
{ type: "merge", sourceA: 16, sourceB: 18, to: 1 }   // knight merges
```

## Explorer (Lookahead)

The `explorer` lets you try moves without affecting the real game. Apply a move, evaluate, then undo to try the next one:

```typescript
async chooseMove(view, explorer, clock) {
  if (!explorer) return { type: "standard", from: view.legalMoves.standard[0].from, to: view.legalMoves.standard[0].to };

  let bestMove = view.legalMoves.standard[0];
  let bestScore = -Infinity;

  for (const move of view.legalMoves.standard) {
    const choice = { type: "standard" as const, from: move.from, to: move.to };
    const result = explorer.apply(choice);

    if (result.success && !result.measured) {
      const score = explorer.evaluate().score;
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
      explorer.undo();
    }
  }

  return { type: "standard", from: bestMove.from, to: bestMove.to };
}
```

### Explorer Methods

- **`apply(choice, opts?)`** -- try a move, returns `{ success, measured, measurementPassProbability }`
- **`undo()`** -- undo the last apply, restoring the previous position
- **`evaluate()`** -- material + probability score (positive = white advantage)
- **`view`** -- current game state at this node (pieces, probabilities, legal moves)

### Handling Measurements

Some moves trigger quantum measurements with probabilistic outcomes. When `result.measured` is true, branch on both outcomes:

```typescript
const result = explorer.apply(choice);
if (result.measured) {
  const p = result.measurementPassProbability ?? 0.5;

  const pass = explorer.apply(choice, { forceMeasurement: "pass" });
  const passScore = explorer.evaluate().score;
  explorer.undo();

  const fail = explorer.apply(choice, { forceMeasurement: "fail" });
  const failScore = explorer.evaluate().score;
  explorer.undo();

  const expected = p * passScore + (1 - p) * failScore;
}
```

> **Note on undo across measurements:** a measurement collapses quantum state, and
> collapse is not reversible. `undo()` after a forced-measurement apply restores the
> board bookkeeping exactly, but superpositions the measurement collapsed stay
> collapsed. In the pattern above, the "fail" branch is evaluated on a slightly
> drifted state (bounded, piece-conserving). This is the same tradeoff the built-in
> AIs accept; for exact branch comparison, `fork()` a fresh explorer per branch
> instead of reusing one via undo.

## Standalone Engine (analysis / tools)

Most AIs only implement `chooseMove` and let the match runner own the engine.
To drive the engine yourself — a position explorer, analysis tool, or test
harness — use the one-call helpers. Paste the same `position` string the app
shows (FEN, setup moves, and history all supported):

```typescript
import { createPositionExplorer, toMoveChoice } from "@quantum-native/quantum-chess-sdk";

const explorer = await createPositionExplorer(
  "position fen 2KR2k1/5ppp/8/8/3q4/8/8/8 w - - 0 1 setup g8^f8h8 d8^d7g8",
);

const moves = explorer.view.legalMoves;                  // legal moves for the side to move
const result = explorer.apply(toMoveChoice(moves.standard[0])); // try a move; undo() to revert
const score = explorer.evaluate().score;
```

`view.legalMoves` entries carry engine metadata; `toMoveChoice()` turns one
into the `{ type, from, to }` shape `apply()` expects (it also handles split
and merge moves).

`createAnalysisEngine(position)` returns a bare `QCEngine` (for
`getView()` / `executeMove()`) the same way. Both accept a `position`/FEN
string or a `QChessPosition` object, and an optional `{ rules }` override
(defaults to `DEFAULT_RULES`).

> **`setup` moves** build quantum state (superposition/entanglement) *before*
> the game starts — they are not game moves. The FEN's active color decides
> whose turn it is, regardless of how many setup moves there are.

<details><summary>Manual construction (if you need full control)</summary>

```typescript
import {
  QCEngine, QuantumChessQuantumAdapterWasm, loadQCGameModule,
  createStackExplorer, DEFAULT_RULES, parsePositionString,
} from "@quantum-native/quantum-chess-sdk";

const mod = await loadQCGameModule();               // load the engine once
const engine = new QCEngine(new QuantumChessQuantumAdapterWasm(mod), {
  ...DEFAULT_RULES, allowCastling: false,           // override any rule field
});
engine.initializeFromPosition(
  parsePositionString("position fen 2KR2k1/5ppp/8/8/3q4/8/8/8 w - - 0 1")!,
);
const explorer = createStackExplorer(
  engine, engine.getGameData(), () => new QuantumChessQuantumAdapterWasm(mod),
);
```
</details>

> **Migrating from `createQuantumForgePort` (≤ 0.2.2):** earlier builds exposed a
> port-backed adapter constructed as
> `new QuantumChessQuantumAdapter(createQuantumForgePort(QFW))`. Both that adapter
> and `createQuantumForgePort` were removed — use `createPositionExplorer` /
> `createAnalysisEngine` (or `QuantumChessQuantumAdapterWasm` directly). The
> engine, explorer, and move APIs are unchanged, and the WASM adapter matches the
> live game exactly — including captures through the explorer and `setupMoves`,
> which the old adapter did not always reflect.

## Playing Against Your AI

The easiest way to test your AI: write a `.js` file and upload it in the game.

### 1. Write your AI file

Create `my-ai.js`:

```javascript
export default {
  name: "My First AI",
  control: "ai",

  async chooseMove(view, explorer, clock) {
    // Pick a random legal move
    const moves = view.legalMoves.standard;
    const pick = moves[Math.floor(Math.random() * moves.length)];
    return { type: "standard", from: pick.from, to: pick.to };
  }
};
```

### 2. Load it in the game

1. Go to **VS AI** in Quantum Chess
2. Select **Custom AI** as the engine
3. Click **Upload File** and choose your `.js` file
4. Click **Start Game**

Your AI plays as the opponent. Edit the file and re-upload to iterate.

## Other Hosting Options

### JavaScript Module (URL)

Host your AI file and load it by URL:

```typescript
import { loadCustomAI } from "@quantum-native/quantum-chess-sdk";
const ai = await loadCustomAI({ type: "module", url: "/my-ai.js" });
```

### HTTP Server (any language)

Your server receives `POST /move` with `{ view, clock }` and returns a `QCMoveChoice`.

```python
from flask import Flask, request, jsonify
import random

app = Flask(__name__)

@app.route("/move", methods=["POST"])
def choose_move():
    data = request.json
    moves = data["view"]["legalMoves"]["standard"]
    pick = random.choice(moves)
    return jsonify({"type": "standard", "from": pick["from"], "to": pick["to"]})

app.run(port=8080)
```

Load in the game:

```typescript
import { loadCustomAI } from "@quantum-native/quantum-chess-sdk";
const ai = await loadCustomAI({ type: "http", url: "http://localhost:8080/move", name: "MyPythonAI" });
```

### Web Worker

For heavy computation without blocking the UI:

```typescript
// worker.js
self.onmessage = (e) => {
  const { type, view, clock } = e.data;
  if (type === "chooseMove") {
    const move = view.legalMoves.standard[0];
    self.postMessage({ type: "standard", from: move.from, to: move.to });
  }
};
```

**Message format:**

- Main thread sends: `{ type: "chooseMove", view: QCEngineView, clock: QCClock | null }`
- Worker responds with: `QCMoveChoice` via `postMessage` (e.g. `{ type: "standard", from, to }`)

### WebSocket

For persistent connections and pondering:

```typescript
const ai = await loadCustomAI({ type: "websocket", url: "ws://localhost:8081", name: "MyWSAI" });
```

**Message format:**

- Client sends: `{ type: "chooseMove", requestId: number, view: QCEngineView, clock: QCClock | null }`
- Server responds: `{ requestId: number, ...QCMoveChoice }`

The `requestId` ties the response to the request. Include the full `QCMoveChoice` fields in the response object alongside `requestId`.

## Learn Quantum Chess

New to Quantum Chess? Learn the rules and strategy at [chess.quantumnative.io](https://chess.quantumnative.io). Join the community on [Discord](https://discord.gg/cMJgTBcZDT).

## License

This package is split-licensed; see [LICENSE.md](LICENSE.md).

- **SDK code** (all TypeScript/JavaScript in this package): MIT.
- **Engine binary** (`dist/wasm/qc-game.wasm`): proprietary. Built from closed source and licensed under the Quantum Native Engine License for community AI development, meaning building, testing and running AI players and analysis tools for Quantum Chess, entering the official app and sanctioned events, and personal, educational or research projects that are not themselves a product. Powering another game, product or service with it needs a separate license: licensing@quantumnative.io.


## Trademarks and intended use

This SDK exists so you can build AI players for the official Quantum Chess app and sanctioned events — that's what it's designed, documented, and supported for.

QUANTUM CHESS® is a registered trademark of Christopher Cantwell (U.S. Reg. No. 5,242,360); Quantum Native and Quantum Forge are trademarks of Quantum Native. Neither license in this package grants any right to these names or logos, to the official app and its services (ranked play, tournaments, puzzles, multiplayer), or to official content. Branding a product, service, event, or tournament with these marks requires a license from licensing@quantumnative.io.
