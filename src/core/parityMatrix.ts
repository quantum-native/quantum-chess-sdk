import type { GameModeId } from "./gameMode";

export type ParityFeatureBucketId =
  | "sandbox"
  | "vs_ai"
  | "local_multiplayer"
  | "online_multiplayer"
  | "time_controls"
  | "puzzles_tutorials"
  | "spectate"
  | "analysis"
  | "probability_ring"
  | "entanglement_phase_overlays"
  | "auth_tester_portal"
  | "variants_tournaments_extensibility";

export interface ParityFeatureBucket {
  bucketId: ParityFeatureBucketId;
  label: string;
  requiredModes: readonly GameModeId[];
}

const ALL_GAME_MODES: readonly GameModeId[] = [
  "sandbox",
  "vs_ai",
  "online_ranked",
  "online_unranked",
  "puzzle",
  "tutorial",
  "spectate",
  "analysis"
];

export const PARITY_MATRIX: readonly ParityFeatureBucket[] = [
  { bucketId: "sandbox", label: "Sandbox", requiredModes: ["sandbox"] },
  { bucketId: "vs_ai", label: "VS AI", requiredModes: ["vs_ai"] },
  { bucketId: "local_multiplayer", label: "Local Multiplayer", requiredModes: ["sandbox", "analysis"] },
  { bucketId: "online_multiplayer", label: "Online Multiplayer", requiredModes: ["online_ranked", "online_unranked", "spectate"] },
  { bucketId: "time_controls", label: "Time Controls", requiredModes: ["vs_ai", "online_ranked", "online_unranked"] },
  { bucketId: "puzzles_tutorials", label: "Puzzles / Tutorials", requiredModes: ["puzzle", "tutorial"] },
  { bucketId: "spectate", label: "Spectate", requiredModes: ["spectate"] },
  { bucketId: "analysis", label: "Analysis", requiredModes: ["analysis"] },
  { bucketId: "probability_ring", label: "Probability Ring", requiredModes: ALL_GAME_MODES },
  {
    bucketId: "entanglement_phase_overlays",
    label: "Entanglement / Phase Overlays",
    requiredModes: ALL_GAME_MODES
  },
  { bucketId: "auth_tester_portal", label: "Auth Tester Portal", requiredModes: ["online_ranked", "online_unranked", "spectate"] },
  {
    bucketId: "variants_tournaments_extensibility",
    label: "Variants / Tournaments Extensibility",
    requiredModes: ["sandbox", "online_ranked", "online_unranked", "analysis"]
  }
];
