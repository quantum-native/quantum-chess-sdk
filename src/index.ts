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
  QCMoveOverride,
  QCServerAuthority,
  QCExplorer,
  QCExplorerResult,
  QCPositionEval,
  QCSample
} from "./types";

// Engine
export { QCEngine } from "./engine";

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

// AI loader
export { loadCustomAI } from "./ai-loader";
export { validatePlayerShape } from "./ai-validation";
export type { AISource } from "./ai-loader";

// Pooling port (for advanced users managing QuantumForge lifecycle)
export { createPoolingPort } from "./pooling-port";
export type { PoolingPort } from "./pooling-port";

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
