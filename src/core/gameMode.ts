export type GameModeId =
  | "sandbox"
  | "local"
  | "vs_ai"
  | "ai_vs_ai"
  | "online_ranked"
  | "online_unranked"
  | "alchemy_league"
  | "tournament"
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
 * The three rules an Alchemy League season is allowed to change.
 *
 * The same triple the relay enforces on every move and the Convex season row
 * stores, so a season is described identically everywhere it is read.
 */
export interface VariantGates {
  allowSplit: boolean;
  allowMerge: boolean;
  allowPhaseRotation: boolean;
}

/**
 * Build the variant for a league season from the gates the server reported.
 *
 * There is deliberately no constant for the current season here. Hardcoding
 * one is how a client ends up playing last season's rules and reporting the
 * game as this season's: the season is data, it lives on the season row, and
 * it reaches the client through the active-season query. The league mode
 * preset below carries standard rules until this is applied to it.
 */
export function variantFromSeasonGates(
  variantId: string,
  gates: VariantGates,
  name?: string
): VariantDefinition {
  return {
    id: variantId,
    name: name ?? variantId,
    ruleOverrides: {
      allowSplit: gates.allowSplit,
      allowMerge: gates.allowMerge,
      allowPhaseRotation: gates.allowPhaseRotation
    }
  };
}

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
    // Standard rules, and no variantId, until the season's are applied with
    // `variantFromSeasonGates`. The preset cannot name a season's rules: it
    // is compiled into the client, and a client is exactly the thing that
    // goes stale when a new season opens.
    rules: { ...BASE_RULES },
    matchmaking: "ranked",
    startingPosition: "classical",
    timeControl: { initialSeconds: 600, incrementSeconds: 5, maxSeconds: 600 }
  },
  tournament: {
    modeId: "tournament",
    label: "Tournament",
    players: [
      { side: "white", control: "human_local" },
      { side: "black", control: "human_remote" }
    ],
    // Standard rules and no variantId until the event's are applied. Same
    // reason as the league preset above: the rules an event is played under
    // live on the tournament row and reach the client through the query, so
    // a client compiled before the event was created still plays it right.
    rules: { ...BASE_RULES },
    // Declared the way the league declares it: an event pairs its entrants
    // and its results move a standing, so the seat is competitive rather
    // than casual. The pairing itself is the tournament's, not the queue's —
    // nothing in the client reads this field to decide how to find a game.
    matchmaking: "ranked",
    startingPosition: "classical",
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

/**
 * Whether `modeId` is one of the four live online modes, each of which pairs
 * the local player against a remote human: ranked, unranked, the Alchemy
 * League, and tournament play. Does NOT include `correspondence` — that's
 * not a `GameModeId` at all (it's a separate synthetic strategy-dispatch
 * string used only by `apps/web/src/controllers/modeStrategies`) and
 * `spectate` has nobody on "your" side of the board.
 *
 * This predicate is the single source of truth for that four-mode set.
 * Every call site that used to spell out the union inline must go through
 * this function so a new online mode can't be added without updating every
 * site by hand.
 */
export function isOnlineHumanMode(modeId: GameModeId): boolean {
  return (
    modeId === "online_ranked" ||
    modeId === "online_unranked" ||
    modeId === "alchemy_league" ||
    modeId === "tournament"
  );
}

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

  const isOnlineMode = isOnlineHumanMode(config.modeId);

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

  if (
    config.modeId === "online_ranked" ||
    config.modeId === "alchemy_league" ||
    config.modeId === "tournament"
  ) {
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
