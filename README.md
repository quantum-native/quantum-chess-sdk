# Quantum Chess SDK

Build AI players for [Quantum Chess](https://quantumchess.net). The SDK provides the full quantum chess engine (legal moves, quantum state simulation, measurements) so you only need to implement one method: pick a move.

## Install

```bash
npm install @quantum-native/quantum-chess-sdk
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

MIT -- see [LICENSE](LICENSE). Note that the quantum simulation engine (`@quantum-native/quantum-forge-chess`) is a separate package with its own license.
