# Contributing to Quantum Chess SDK

Thanks for your interest in contributing! This project is open to pull requests and issues from the community.

Join the [Quantum Chess Discord](https://chess.quantumnative.io) (link on site) to discuss ideas, get help, and connect with other contributors.

## Reporting Issues

- Use [GitHub Issues](https://github.com/quantum-native/quantum-chess-sdk/issues) for bug reports, feature requests, and questions.
- Include steps to reproduce for bugs.
- Include the SDK version and Node/browser version.

## Pull Requests

1. Fork the repo and create a branch from `main`.
2. Make your changes.
3. Ensure `npm run typecheck` passes.
4. Write a clear PR description explaining what changed and why.
5. Submit the PR against `main`.

### What we're looking for

- Bug fixes with clear reproduction steps.
- New player adapters (hosting options).
- Improved documentation and examples.
- Better move ordering, evaluation, or search techniques for the reference AI.
- Tournament format additions.
- Performance improvements with benchmarks showing the impact.

### What to avoid

- Changes to core game rules (move types, measurement mechanics). These are defined by the game and not up for modification.
- Large refactors without prior discussion. Open an issue first.
- Adding runtime dependencies. The SDK should stay lightweight.

## Code Style

- TypeScript strict mode.
- No linter configured — keep style consistent with surrounding code.
- Prefer clear names over comments. Add comments only where the logic isn't self-evident.
- No emojis in code or commit messages.

## Project Structure

```
src/
  core/           # Board, moves, rules, types (game logic)
  quantum/        # Quantum simulation adapter (QuantumForge wrapper)
  adapters/       # Player implementations (SDK AI, HTTP, WebSocket, etc.)
  tournament/     # Tournament runner and pairings
  engine.ts       # Game engine (move execution, undo)
  match-runner.ts # Game loop (turn order, time, win detection)
  stack-explorer.ts # Do/undo search tree for AI lookahead
  game-runner.ts  # High-level API (createGameRunner)
  types.ts        # Public types (QCPlayer, QCMoveChoice, etc.)
examples/         # Runnable example AIs
```

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
