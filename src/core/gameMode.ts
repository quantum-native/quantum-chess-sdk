export type GameModeId =
  | "sandbox"
  | "local"
  | "vs_ai"
  | "ai_vs_ai"
  | "online_ranked"
  | "online_unranked"
  | "alchemy_league"
  | "puzzle"
  | "tutorial"
  | "spectate"
  | "analysis";
export type PlayerSide = "white" | "black";
export type PlayerControl = "human_local" | "human_remote" | "ai";
export type MatchmakingType = "none" | "casual" | "ranked";
export type ObjectiveType = "checkmate" | "puzzle";
export type StartingPositionType = "classical" | "custom";

export interface PlayerConfig {
  side: PlayerSide;
  control: PlayerControl;
}

export interface TimeControlConfig {
  initialSeconds: number;
  incrementSeconds: number;
  maxSeconds: number;
}

export interface RulesConfig {
  quantumEnabled: boolean;
  allowSplit: boolean;
  allowMerge: boolean;
  /** Moves may carry a pi/2-increment phase rotation (`.p<k>` suffix). */
  allowPhaseRotation: boolean;
  allowMeasurementAnnotations: boolean;
  allowCastling: boolean;
  allowEnPassant: boolean;
  allowPromotion: boolean;
  objective: ObjectiveType;
}

export interface VariantDefinition {
  id: string;
  name: string;
  description?: string;
  ruleOverrides?: Partial<RulesConfig>;
  startingPosition?: StartingPositionType;
}

export interface GameModeConfig {
  modeId: GameModeId;
  label: string;
  players: [PlayerConfig, PlayerConfig];
  rules: RulesConfig;
  matchmaking: MatchmakingType;
  timeControl?: TimeControlConfig;
  puzzleId?: string;
  tutorialId?: string;
  variantId?: string;
  startingPosition: StartingPositionType;
}

export interface GameModeConfigOverrides {
  puzzleId?: string;
  tutorialId?: string;
  timeControl?: TimeControlConfig;
  players?: Partial<Record<PlayerSide, PlayerControl>>;
  variant?: VariantDefinition;
}

const BASE_RULES: RulesConfig = {
  quantumEnabled: true,
  allowSplit: true,
  allowMerge: true,
  allowPhaseRotation: false,
  allowMeasurementAnnotations: true,
  allowCastling: true,
  allowEnPassant: true,
  allowPromotion: true,
  objective: "checkmate"
};

/**
 * The Alchemy League runs seasonal experimental rulesets. Season 1:
 * merge moves are removed and every move may carry a pi/2-increment
 * phase rotation on the moving piece.
 */
export const ALCHEMY_SEASON_1_VARIANT: VariantDefinition = {
  id: "alchemy-s1",
  name: "Alchemy Season 1",
  description: "No merge moves. Any move may add a phase rotation in increments of pi/2.",
  ruleOverrides: { allowMerge: false, allowPhaseRotation: true }
};

function cloneModeConfig(config: GameModeConfig): GameModeConfig {
  return {
    ...config,
    players: config.players.map((player) => ({ ...player })) as [PlayerConfig, PlayerConfig],
    rules: { ...config.rules },
    timeControl: config.timeControl ? { ...config.timeControl } : undefined
  };
}

const PRESET_MAP: Record<GameModeId, GameModeConfig> = {
  sandbox: {
    modeId: "sandbox",
    label: "Sandbox",
    players: [
      { side: "white", control: "human_local" },
      { side: "black", control: "human_local" }
    ],
    rules: { ...BASE_RULES },
    matchmaking: "none",
    startingPosition: "classical"
  },
  local: {
    modeId: "local",
    label: "Local Game",
    players: [
      { side: "white", control: "human_local" },
      { side: "black", control: "ai" }
    ],
    rules: { ...BASE_RULES },
    matchmaking: "none",
    startingPosition: "classical",
    timeControl: { initialSeconds: 900, incrementSeconds: 0, maxSeconds: 900 }
  },
  vs_ai: {
    modeId: "vs_ai",
    label: "VS AI",
    players: [
      { side: "white", control: "human_local" },
      { side: "black", control: "ai" }
    ],
    rules: { ...BASE_RULES },
    matchmaking: "none",
    startingPosition: "classical",
    timeControl: { initialSeconds: 900, incrementSeconds: 0, maxSeconds: 900 }
  },
  ai_vs_ai: {
    modeId: "ai_vs_ai",
    label: "AI vs AI",
    players: [
      { side: "white", control: "ai" },
      { side: "black", control: "ai" }
    ],
    rules: { ...BASE_RULES },
    matchmaking: "none",
    startingPosition: "classical",
    timeControl: { initialSeconds: 300, incrementSeconds: 5, maxSeconds: 600 }
  },
  online_ranked: {
    modeId: "online_ranked",
    label: "Online Ranked",
    players: [
      { side: "white", control: "human_local" },
      { side: "black", control: "human_remote" }
    ],
    rules: { ...BASE_RULES },
    matchmaking: "ranked",
    startingPosition: "classical",
    timeControl: { initialSeconds: 600, incrementSeconds: 5, maxSeconds: 600 }
  },
  online_unranked: {
    modeId: "online_unranked",
    label: "Online Casual",
    players: [
      { side: "white", control: "human_local" },
      { side: "black", control: "human_remote" }
    ],
    rules: { ...BASE_RULES },
    matchmaking: "casual",
    startingPosition: "classical",
    timeControl: { initialSeconds: 900, incrementSeconds: 3, maxSeconds: 900 }
  },
  alchemy_league: {
    modeId: "alchemy_league",
    label: "Alchemy League",
    players: [
      { side: "white", control: "human_local" },
      { side: "black", control: "human_remote" }
    ],
    rules: { ...BASE_RULES, ...ALCHEMY_SEASON_1_VARIANT.ruleOverrides },
    matchmaking: "ranked",
    startingPosition: "classical",
    variantId: ALCHEMY_SEASON_1_VARIANT.id,
    timeControl: { initialSeconds: 600, incrementSeconds: 5, maxSeconds: 600 }
  },
  puzzle: {
    modeId: "puzzle",
    label: "Puzzle",
    players: [
      { side: "white", control: "human_local" },
      { side: "black", control: "ai" }
    ],
    rules: { ...BASE_RULES, objective: "puzzle" },
    matchmaking: "none",
    startingPosition: "custom"
  },
  tutorial: {
    modeId: "tutorial",
    label: "Tutorial",
    players: [
      { side: "white", control: "human_local" },
      { side: "black", control: "ai" }
    ],
    rules: { ...BASE_RULES, objective: "puzzle" },
    matchmaking: "none",
    startingPosition: "custom"
  },
  spectate: {
    modeId: "spectate",
    label: "Spectate",
    players: [
      { side: "white", control: "human_remote" },
      { side: "black", control: "human_remote" }
    ],
    rules: { ...BASE_RULES },
    matchmaking: "none",
    startingPosition: "classical"
  },
  analysis: {
    modeId: "analysis",
    label: "Analysis",
    players: [
      { side: "white", control: "human_local" },
      { side: "black", control: "human_local" }
    ],
    rules: { ...BASE_RULES },
    matchmaking: "none",
    startingPosition: "custom"
  }
};

export function listGameModePresets(): GameModeConfig[] {
  return (Object.keys(PRESET_MAP) as GameModeId[]).map((modeId) => cloneModeConfig(PRESET_MAP[modeId]));
}

export function getGameModePreset(modeId: GameModeId): GameModeConfig {
  return cloneModeConfig(PRESET_MAP[modeId]);
}

export function createGameModeConfig(modeId: GameModeId, overrides: GameModeConfigOverrides = {}): GameModeConfig {
  const base = getGameModePreset(modeId);

  if (overrides.players?.white) {
    base.players[0].control = overrides.players.white;
  }
  if (overrides.players?.black) {
    base.players[1].control = overrides.players.black;
  }
  if (overrides.timeControl) {
    base.timeControl = {
      ...overrides.timeControl,
      maxSeconds: overrides.timeControl.maxSeconds ?? overrides.timeControl.initialSeconds
    };
  }
  if (overrides.puzzleId) {
    base.puzzleId = overrides.puzzleId;
  }
  if (overrides.tutorialId) {
    base.tutorialId = overrides.tutorialId;
  }
  if (overrides.variant) {
    base.variantId = overrides.variant.id;
    if (overrides.variant.ruleOverrides) {
      base.rules = { ...base.rules, ...overrides.variant.ruleOverrides };
    }
    if (overrides.variant.startingPosition) {
      base.startingPosition = overrides.variant.startingPosition;
    }
  }

  return base;
}

export function validateGameModeConfig(config: GameModeConfig): string[] {
  const errors: string[] = [];
  const white = config.players.find((player) => player.side === "white");
  const black = config.players.find((player) => player.side === "black");

  if (!white || !black || config.players.length !== 2) {
    errors.push("players must include exactly one white and one black slot.");
  }

  if ((config.rules.allowSplit || config.rules.allowMerge) && !config.rules.quantumEnabled) {
    errors.push("allowSplit/allowMerge require quantumEnabled.");
  }

  if (config.rules.allowPhaseRotation && !config.rules.quantumEnabled) {
    errors.push("allowPhaseRotation requires quantumEnabled.");
  }

  const isOnlineMode =
    config.modeId === "online_ranked" || config.modeId === "online_unranked" || config.modeId === "alchemy_league";

  if (isOnlineMode && config.matchmaking === "none") {
    errors.push("online modes must declare matchmaking.");
  }

  if (isOnlineMode && !config.players.some((player) => player.control === "human_remote")) {
    errors.push("online modes require a remote player slot.");
  }

  if (config.modeId === "vs_ai" && !config.players.some((player) => player.control === "ai")) {
    errors.push("vs_ai mode requires an AI player slot.");
  }

  if (config.modeId === "local" && config.players.some((player) => player.control === "human_remote")) {
    errors.push("local mode cannot include remote players.");
  }

  if (config.modeId === "ai_vs_ai" && !config.players.every((player) => player.control === "ai")) {
    errors.push("ai_vs_ai mode requires both players to be AI.");
  }

  if (config.modeId === "spectate") {
    if (config.matchmaking !== "none") {
      errors.push("spectate mode cannot declare matchmaking.");
    }
    if (config.players.some((player) => player.control !== "human_remote")) {
      errors.push("spectate mode requires remote player slots.");
    }
  }

  if (config.modeId === "analysis" && config.matchmaking !== "none") {
    errors.push("analysis mode cannot declare matchmaking.");
  }

  if (config.modeId === "puzzle" && !config.puzzleId) {
    errors.push("puzzle mode requires puzzleId.");
  }

  if (config.modeId === "tutorial" && !config.tutorialId) {
    errors.push("tutorial mode requires tutorialId.");
  }

  if (config.modeId === "online_ranked" || config.modeId === "alchemy_league") {
    if (!config.timeControl) {
      errors.push(`${config.modeId} requires a time control.`);
    }
  }

  if (config.timeControl) {
    if (config.timeControl.initialSeconds <= 0 || config.timeControl.incrementSeconds < 0) {
      errors.push("time control values must be non-negative and initialSeconds must be positive.");
    }
    if (config.timeControl.maxSeconds <= 0) {
      errors.push("time control maxSeconds must be positive.");
    }
    if (config.timeControl.maxSeconds < config.timeControl.initialSeconds) {
      errors.push("time control maxSeconds cannot be less than initialSeconds.");
    }
  }

  if ((config.modeId === "puzzle" || config.modeId === "tutorial") &&
      config.rules.objective !== "puzzle") {
    errors.push("puzzle/tutorial modes must use puzzle objective.");
  }

  return errors;
}

export function assertValidGameModeConfig(config: GameModeConfig): void {
  const errors = validateGameModeConfig(config);
  if (errors.length > 0) {
    throw new Error(`Invalid game mode config: ${errors.join(" ")}`);
  }
}
