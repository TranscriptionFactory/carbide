import { describe, it, expect } from "vitest";
import { AsyncQueue } from "$lib/shared/utils/async_queue";

describe("AsyncQueue", () => {
  it("yields pushed values", async () => {
    const queue = new AsyncQueue<string>();
    queue.push("a");
    queue.push("b");
    queue.end();

    const results: string[] = [];
    for await (const v of queue) {
      results.push(v);
    }
    expect(results).toEqual(["a", "b"]);
  });

  it("blocks until value is pushed", async () => {
    const queue = new AsyncQueue<number>();

    const promise = (async () => {
      const results: number[] = [];
      for await (const v of queue) {
        results.push(v);
      }
      return results;
    })();

    queue.push(1);
    queue.push(2);
    queue.end();

    const results = await promise;
    expect(results).toEqual([1, 2]);
  });

  it("terminates on end() even when waiting", async () => {
    const queue = new AsyncQueue<string>();

    const promise = (async () => {
      const results: string[] = [];
      for await (const v of queue) {
        results.push(v);
      }
      return results;
    })();

    queue.end();

    const results = await promise;
    expect(results).toEqual([]);
  });

  it("ignores pushes after end", async () => {
    const queue = new AsyncQueue<string>();
    queue.push("a");
    queue.end();
    queue.push("b");

    const results: string[] = [];
    for await (const v of queue) {
      results.push(v);
    }
    expect(results).toEqual(["a"]);
  });
});
