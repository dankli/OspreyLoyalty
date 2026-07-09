import { expect, test } from "vitest";
import { parseSseEvents } from "../src/features/travel-agent/sse.ts";

test("parses complete events and returns the trailing partial as rest", () => {
  const buffer =
    "event: meta\ndata: {\"spendablePoints\":14500}\n\n" +
    "event: token\ndata: {\"text\":\"Hi\"}\n\n" +
    "event: token\ndata: {\"text\":\"the"; // incomplete tail
  const { events, rest } = parseSseEvents(buffer);
  expect(events).toEqual([
    { event: "meta", data: "{\"spendablePoints\":14500}" },
    { event: "token", data: "{\"text\":\"Hi\"}" },
  ]);
  expect(rest).toBe("event: token\ndata: {\"text\":\"the");
});

test("an event split across two buffers is only emitted once complete", () => {
  const first = parseSseEvents("event: token\ndata: {\"text\":\"ab");
  expect(first.events).toEqual([]);
  const { events } = parseSseEvents(first.rest + "\"}\n\n");
  expect(events).toEqual([{ event: "token", data: "{\"text\":\"ab\"}" }]);
});

test("defaults the event name to message when only data is present", () => {
  const { events } = parseSseEvents("data: hello\n\n");
  expect(events).toEqual([{ event: "message", data: "hello" }]);
});
