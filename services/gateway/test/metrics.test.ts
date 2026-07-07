import { expect, test } from "vitest";
import { httpRequestDuration, metricsRegistry } from "../src/metrics.js";

test("http requests are observed in the histogram", async () => {
  httpRequestDuration.observe({ method: "GET", route: "/health", status: "200" }, 0.005);
  const text = await metricsRegistry.metrics();
  expect(text).toContain("http_request_duration_seconds");
  expect(text).toContain('route="/health"');
});
