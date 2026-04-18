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

The `explorer` lets you try moves without affecting the real game:

```typescript
async chooseMove(view, explorer, clock) {
  let bestMove = view.legalMoves.standard[0];
  let bestScore = -Infinity;

  for (const move of view.legalMoves.standard) {
    const choice = { type: "standard" as const, from: move.from, to: move.to };
    const result = explorer.apply(choice);

    if (result.success) {
      const score = result.explorer.evaluate().score;
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }
  }

  return { type: "standard", from: bestMove.from, to: bestMove.to };
}
```

### Explorer Methods

- **`apply(choice, opts?)`** -- play a move, get resulting state. Chain: `explorer.apply(m1).explorer.apply(m2)`
- **`fork(n)`** -- create N independent copies for parallel search
- **`evaluate()`** -- material + probability score (positive = white advantage)
- **`sample(n)`** -- collapse quantum state into N classical boards (for Monte Carlo)
- **`view`** -- current game state at this node

### Handling Measurements

Quantum moves can trigger measurements with probabilistic outcomes. Force the result for deterministic search:

```typescript
const pass = explorer.apply(move, { forceMeasurement: "pass" });
const fail = explorer.apply(move, { forceMeasurement: "fail" });
const p = pass.measurementPassProbability ?? 0.5;
const expectedScore = p * pass.explorer.evaluate().score
                    + (1 - p) * fail.explorer.evaluate().score;
```

## Hosting Options

### JavaScript Module (in-browser)

Export a `QCPlayer` as the default export. Load via URL:

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
  const { view, clock } = e.data;
  const move = view.legalMoves.standard[0];
  self.postMessage({ type: "standard", from: move.from, to: move.to });
};
```

### WebSocket

For persistent connections and pondering:

```typescript
const ai = await loadCustomAI({ type: "websocket", url: "ws://localhost:8081", name: "MyWSAI" });
```

## Tournaments

Run AI tournaments programmatically:

```typescript
import { QCTournamentRunner } from "@quantum-native/quantum-chess-sdk";

const tournament = new QCTournamentRunner({
  players: [bot1, bot2, bot3, bot4],
  format: "round_robin",  // or "swiss"
  rules: { quantumEnabled: true, allowSplitMerge: true, /* ... */ },
  timeControl: { initialSeconds: 300, incrementSeconds: 5, maxSeconds: 600 },
  gamesPerMatch: 2  // one as white, one as black
});

const result = await tournament.run(adapterFactory, (event) => {
  if (event.type === "match_end") {
    console.log(`${event.result.white} vs ${event.result.black}: ${event.result.result.winner}`);
  }
});

console.log("Final standings:", result.standings);
```

## Learn Quantum Chess

New to Quantum Chess? Learn the rules and strategy at [chess.quantumnative.io](https://chess.quantumnative.io). Join the community on [Discord](https://chess.quantumnative.io) (link on site).

## License

MIT -- see [LICENSE](LICENSE). Note that the quantum simulation engine (`@quantum-native/quantum-forge-chess`) is a separate package with its own license.
