import { isBlackPiece, type QChessGameData } from "../core";

export interface ProbabilityRingVisual {
  value: number;
  visible: boolean;
  color: string;
  thickness: number;
  opacity: number;
}

export interface SquareVisualTelemetry {
  square: number;
  piece: string;
  probability: number;
  ring: ProbabilityRingVisual;
}

export interface EntanglementVisualLink {
  fromSquare: number;
  toSquare: number;
  strength: number;
  /** Positive = correlated (coexist), negative = anti-correlated (one or the other). */
  correlation?: number;
}

export interface RelativePhaseVisualLink {
  fromSquare: number;
  toSquare: number;
  radians: number;
  confidence: number;
}

export interface MeasurementImpactVisual {
  square: number;
  /** Change in probability if hovered square measures IN (occupied). */
  deltaIfIn: number;
  /** Change in probability if hovered square measures OUT (empty). */
  deltaIfOut: number;
}

export interface QuantumVisualCapabilities {
  probabilityRings: true;
  entanglement: boolean;
  relativePhase: boolean;
}

export interface QuantumVisualSnapshot {
  revision: number;
  squares: SquareVisualTelemetry[];
  entanglement: EntanglementVisualLink[];
  relativePhase: RelativePhaseVisualLink[];
  capabilities: QuantumVisualCapabilities;
  warnings: string[];
}

export interface QuantumVisualAdapter {
  getExistenceProbability(square: number): number;
  hasSquareProperty(square: number): boolean;
}

export interface QuantumRelationshipProvider {
  getEntanglement?(gameData: QChessGameData): EntanglementVisualLink[];
  getRelativePhase?(gameData: QChessGameData): RelativePhaseVisualLink[];
}

export interface QuantumVisualSnapshotOptions {
  revision?: number;
  probabilityEpsilon?: number;
  ringColor?: string;
  ringThickness?: number;
  relationshipProvider?: QuantumRelationshipProvider;
}

export function createQuantumVisualSnapshot(
  gameData: QChessGameData,
  adapter: QuantumVisualAdapter,
  options: QuantumVisualSnapshotOptions = {}
): QuantumVisualSnapshot {
  const epsilon = options.probabilityEpsilon ?? 1.1920929e-7;
  const whiteRingColor = options.ringColor ?? "#ff20d0";
  const blackRingColor = "#ff6600";
  const ringThickness = options.ringThickness ?? 3;

  const squares: SquareVisualTelemetry[] = [];
  for (let square = 0; square < 64; square += 1) {
    const probability = adapter.getExistenceProbability(square);
    const piece = gameData.board.pieces[square] ?? ".";
    const active = piece !== "." || probability > epsilon || adapter.hasSquareProperty(square);
    if (!active) {
      continue;
    }

    squares.push({
      square,
      piece,
      probability,
      ring: {
        value: probability,
        visible: probability > epsilon && probability < 1 - epsilon,
        color: isBlackPiece(piece) ? blackRingColor : whiteRingColor,
        thickness: ringThickness,
        opacity: Math.max(0.15, Math.min(1, probability))
      }
    });
  }

  const entanglement = options.relationshipProvider?.getEntanglement?.(gameData) ?? [];
  const relativePhase = options.relationshipProvider?.getRelativePhase?.(gameData) ?? [];
  const capabilities: QuantumVisualCapabilities = {
    probabilityRings: true,
    entanglement: typeof options.relationshipProvider?.getEntanglement === "function",
    relativePhase: typeof options.relationshipProvider?.getRelativePhase === "function"
  };

  const warnings: string[] = [];
  if (!capabilities.entanglement) {
    warnings.push("Entanglement overlay provider not configured.");
  }
  if (!capabilities.relativePhase) {
    warnings.push("Relative phase overlay provider not configured.");
  }

  return {
    revision: options.revision ?? 0,
    squares,
    entanglement,
    relativePhase,
    capabilities,
    warnings
  };
}
