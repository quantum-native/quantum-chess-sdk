/**
 * Validate that an object has the required QCPlayer shape.
 * Returns an error message if invalid, null if valid.
 */
export function validatePlayerShape(player: unknown): string | null {
  if (!player || typeof player !== "object") {
    return "Player must be a non-null object.";
  }
  const p = player as Record<string, unknown>;

  if (typeof p.name !== "string" || p.name.length === 0) {
    return "Player must have a non-empty 'name' string property.";
  }

  if (typeof p.chooseMove !== "function") {
    return "Player must have a 'chooseMove' method.";
  }

  if (p.control !== undefined && p.control !== "ai" && p.control !== "human_local" && p.control !== "human_remote") {
    return "Player 'control' must be 'ai', 'human_local', or 'human_remote'.";
  }

  return null;
}
