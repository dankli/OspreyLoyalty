import { expect, test, vi } from "vitest";
import { withRetry } from "../src/retry.js";

test("a transient failure is retried once and succeeds", async () => {
  vi.useFakeTimers();
  const flaky = vi.fn()
    .mockRejectedValueOnce(new Error("members service responded 503"))
    .mockResolvedValueOnce("ok");

  const promise = withRetry(flaky)("arg");
  await vi.runAllTimersAsync();

  expect(await promise).toBe("ok");
  expect(flaky).toHaveBeenCalledTimes(2);
  expect(flaky).toHaveBeenLastCalledWith("arg");
  vi.useRealTimers();
});

test("a persistent failure surfaces after exactly one retry", async () => {
  vi.useFakeTimers();
  const down = vi.fn().mockRejectedValue(new Error("members service responded 500"));

  const promise = withRetry(down)();
  const outcome = promise.catch((e: Error) => e.message);
  await vi.runAllTimersAsync();

  expect(await outcome).toBe("members service responded 500");
  expect(down).toHaveBeenCalledTimes(2);
  vi.useRealTimers();
});

test("a success never retries", async () => {
  const healthy = vi.fn().mockResolvedValue(42);

  expect(await withRetry(healthy)()).toBe(42);
  expect(healthy).toHaveBeenCalledTimes(1);
});
