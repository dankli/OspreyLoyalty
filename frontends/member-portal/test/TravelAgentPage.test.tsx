import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { TravelAgentPage } from "../src/features/travel-agent/TravelAgentPage";

function sseResponse(body: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const PAYLOAD =
  "event: meta\ndata: {\"spendablePoints\":14500}\n\n" +
  "event: token\ndata: {\"text\":\"You have 14,500 points.\"}\n\n" +
  "event: suggestion\ndata: {\"destination\":\"Lissabon\",\"emoji\":\"🏖\",\"cost\":9000,\"affordable\":true}\n\n" +
  "event: suggestion\ndata: {\"destination\":\"Mallorca\",\"emoji\":\"🏝\",\"cost\":16500,\"affordable\":false,\"gap\":2000}\n\n" +
  "event: done\ndata: {}\n\n";

afterEach(() => vi.restoreAllMocks());

test("shows the readonly prompt and the generate button before generating", () => {
  render(<TravelAgentPage memberId="demo-ada" />);
  const prompt = screen.getByLabelText(/your travel request/i) as HTMLTextAreaElement;
  expect(prompt).toHaveAttribute("readonly");
  expect(prompt.value.length).toBeGreaterThan(0);
  expect(screen.getByRole("button", { name: /generate suggestions/i })).toBeEnabled();
});

test("generates: streams narration, balance and affordable + goal cards", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(sseResponse(PAYLOAD));
  render(<TravelAgentPage memberId="demo-ada" />);
  await userEvent.click(screen.getByRole("button", { name: /generate suggestions/i }));

  expect(await screen.findByText(/you have 14,500 points/i)).toBeInTheDocument();
  expect(screen.getAllByText(/14[\s, ]?500/).length).toBeGreaterThan(0); // balance card (+ narration)
  expect(screen.getByText(/Lissabon/)).toBeInTheDocument();
  expect(screen.getByText(/you can go now/i)).toBeInTheDocument(); // affordable badge
  expect(screen.getByText(/Mallorca/)).toBeInTheDocument();
  expect(screen.getByText(/save 2[\s, ]?000 more points/i)).toBeInTheDocument(); // goal
});

test("shows a visible error and never a blank page when the stream fails", async () => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
  render(<TravelAgentPage memberId="demo-ada" />);
  await userEvent.click(screen.getByRole("button", { name: /generate suggestions/i }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/unavailable/i);
  expect(screen.getByRole("heading", { name: /travel agent/i })).toBeInTheDocument();
});
