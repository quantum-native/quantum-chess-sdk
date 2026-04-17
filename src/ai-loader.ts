import type { QCPlayer } from "./types";
import { HttpPlayerAdapter } from "./adapters/http-player";
import { WorkerPlayerAdapter } from "./adapters/worker-player";
import { WebSocketPlayerAdapter } from "./adapters/websocket-player";

/**
 * Description of an AI source to load.
 */
export type AISource =
  | { type: "module"; url: string }
  | { type: "http"; url: string; name: string; authToken?: string; timeoutMs?: number }
  | { type: "websocket"; url: string; name: string }
  | { type: "worker"; url: string; name: string };

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

/**
 * Load a custom AI player from the specified source.
 *
 * - `module`: Dynamic import of an ES module that default-exports a QCPlayer.
 * - `http`: Creates an HttpPlayerAdapter that POSTs to the given URL.
 * - `websocket`: Creates a WebSocketPlayerAdapter with persistent connection.
 * - `worker`: Creates a WorkerPlayerAdapter running in a Web Worker.
 */
export async function loadCustomAI(source: AISource): Promise<QCPlayer> {
  switch (source.type) {
    case "module": {
      const mod = await import(/* @vite-ignore */ source.url);
      const player = mod.default;

      const error = validatePlayerShape(player);
      if (error) {
        throw new Error(`Invalid AI module at ${source.url}: ${error}`);
      }

      // Ensure control is set to 'ai' if not specified
      if (!player.control) {
        player.control = "ai";
      }

      return player as QCPlayer;
    }

    case "http": {
      return new HttpPlayerAdapter({
        endpoint: source.url,
        name: source.name,
        authToken: source.authToken,
        timeoutMs: source.timeoutMs
      });
    }

    case "websocket": {
      const adapter = new WebSocketPlayerAdapter({
        url: source.url,
        name: source.name
      });
      await adapter.initialize();
      return adapter;
    }

    case "worker": {
      const adapter = new WorkerPlayerAdapter({
        workerUrl: source.url,
        name: source.name
      });
      await adapter.initialize();
      return adapter;
    }
  }
}
