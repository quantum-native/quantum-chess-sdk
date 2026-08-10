// Re-export core types, functions, and constants
export * from "./core";

// Re-export quantum adapter, port factories, and visual telemetry
export * from "./quantum";

// SDK types
export type {
  QCPlayer,
  QCEngineView,
  QCMoveChoice,
  QCLegalMoveSet,
  QCMoveOption,
  QCSplitOption,
  QCMergeOption,
  QCMoveRecord,
  QCClock,
  QCGameResult,
  QCMatchConfig,
  QCMatchEvent,
  QCMatchMoveEvent,
  QCMatchMeasurementEvent,
  QCMatchGameOverEvent,
  QCMatchErrorEvent,
  QCMatchClockEvent,
  QCMoveExecutionResult,
  QCServerAuthority,
  QCExplorer,
  QCExplorerResult,
  QCPositionEval,
  QCSample
} from "./types";

// Engine
export { QCEngine } from "./engine";

// Measurement semantics — what a move's measurement actually asks, and how
// likely it is to pass. UIs use these to show measurement effects on the
// squares that are genuinely being measured, and to tell certain outcomes
// from real collapses.
export { isSuperposed, squaresBetween, measurementPassProbability, measurementCanCollapse } from "./measurement";

// Rule presets — spread and override instead of hand-writing the object:
//   new QCEngine(adapter, { ...DEFAULT_RULES, allowCastling: false })
export { DEFAULT_RULES, CLASSICAL_RULES } from "./rules-presets";

// One-call standalone helpers (position explorer / analysis engine).
export { createAnalysisEngine, createPositionExplorer, toMoveChoice } from "./standalone";
export type { PositionInput, StandaloneOptions } from "./standalone";

// Legal move builder
export { buildLegalMoveSet } from "./legal-moves";

// Match runner
export { QCMatchRunner } from "./match-runner";

// Explorer
export { StackExplorer, createStackExplorer } from "./stack-explorer";
export type { QuantumAdapterFactory } from "./stack-explorer";

// Game runner (high-level API for community AI development)
export { createGameRunner } from "./game-runner";
export type { GameRunner, PlayMatchOptions } from "./game-runner";

// Player adapters (public)
export { PureSDKAdapter } from "./adapters/pure-sdk-ai";
export type { PureSDKAIOptions } from "./adapters/pure-sdk-ai";
export { RandomPlayer } from "./adapters/random-player";
export { HttpPlayerAdapter } from "./adapters/http-player";
export { ModuleWorkerPlayer } from "./adapters/module-worker-player";
export { WorkerPlayerAdapter } from "./adapters/worker-player";
export { WebSocketPlayerAdapter } from "./adapters/websocket-player";
export { LocalHumanPlayer } from "./adapters/local-human";
export type { LocalHumanBoardUI } from "./adapters/local-human";
export { RemoteHumanPlayer } from "./adapters/remote-human";
export type { GameConnection } from "./adapters/remote-human";

// Match bridge (UI integration for human play)
export { MatchBridge } from "./adapters/match-bridge";
export type { MatchBridgeCallbacks } from "./adapters/match-bridge";


// Node-only WASM adapters live behind the "/node" subpath so they don't
// pull node:fs / node:worker_threads transitively into browser bundles.
// Import them as:
//   import { NodeXBoardAdapter } from "@quantum-native/quantum-chess-sdk/node";

// AI loader
export { loadCustomAI } from "./ai-loader";
export { validatePlayerShape } from "./ai-validation";
export type { AISource } from "./ai-loader";

// Tournament
export { QCTournamentRunner } from "./tournament/tournament-runner";
export type {
  QCTournamentConfig,
  QCTournamentResult,
  QCTournamentMatchResult,
  QCTournamentEvent,
  QCStanding
} from "./tournament/types";
export { computeStandings } from "./tournament/standings";
export { roundRobinPairings, swissPairing, swissRoundCount } from "./tournament/pairings";
