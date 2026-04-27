import type { QCPlayer } from "./types";
import { HttpPlayerAdapter } from "./adapters/http-player";
import { ModuleWorkerPlayer } from "./adapters/module-worker-player";
import { WorkerPlayerAdapter } from "./adapters/worker-player";
import { WebSocketPlayerAdapter } from "./adapters/websocket-player";
import { validatePlayerShape } from "./ai-validation";

/**
 * Description of an AI source to load.
 */
export type AISource =
  | { type: "module"; url: string; name?: string; runInWorker?: boolean }
  | { type: "http"; url: string; name: string; authToken?: string; timeoutMs?: number }
  | { type: "websocket"; url: string; name: string }
  | { type: "worker"; url: string; name: string };

/**
 * Load a custom AI player from the specified source.
 *
 * - `module`: Loads an ES module that default-exports a QCPlayer. In browsers,
 *   this runs in a dedicated Web Worker by default so AI search does not block
 *   timers or UI interaction.
 * - `http`: Creates an HttpPlayerAdapter that POSTs to the given URL.
 * - `websocket`: Creates a WebSocketPlayerAdapter with persistent connection.
 * - `worker`: Creates a WorkerPlayerAdapter running in a Web Worker.
 */
export async function loadCustomAI(source: AISource): Promise<QCPlayer> {
  switch (source.type) {
    case "module": {
      if (source.runInWorker !== false && typeof Worker !== "undefined") {
        const adapter = new ModuleWorkerPlayer(source.url, source.name);
        await adapter.initialize();
        return adapter;
      }

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
