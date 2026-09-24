/**
 * Runs async tasks one at a time, in the order they were queued.
 *
 * An engine process has one search slot, so every caller that talks to it has
 * to take turns. The hand-rolled lock this replaces,
 *
 *   await this.lock;
 *   this.lock = new Promise((r) => { release = r; });
 *
 * only works for a single waiter: every caller that awaited the same promise
 * wakes when it resolves, and they all run at once. Chaining each task onto
 * the previous one's settlement gives each task its own predecessor.
 *
 * A task that throws does not stall the queue; its rejection goes to its own
 * caller only.
 */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
