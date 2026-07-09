import type { IncomingMessage, ServerResponse } from "node:http";
import type { Member } from "../member/membersClient.js";
import { catalogue } from "./catalogue.js";
import { planTrips } from "./planTrips.js";
import { narrate, tokenize } from "./narrate.js";
import { toSuggestions } from "./suggestions.js";
import { normalizeLang } from "./phrasebook.js";

export type StreamDeps = {
  fetchMember: (baseUrl: string, id: string, correlationId?: string, authorization?: string, acceptLanguage?: string) => Promise<Member | null>;
  membersUrl: string;
  delayMs?: number; // per-token pause for the typewriter feel; 0 in tests
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const send = (res: ServerResponse, event: string, data: unknown): void => {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
};

// The only impure unit in the slice. Resolves the member (bounded by the members client's own
// timeout), runs the pure core, and streams the result as SSE. Any failure becomes one `error`
// event — exceptions handled here at the edge, never leaking into the pure core (ROP).
export async function handleTravelAgentStream(req: IncomingMessage, res: ServerResponse, deps: StreamDeps): Promise<void> {
  const url = new URL(req.url ?? "", "http://gateway");
  const memberId = url.searchParams.get("memberId") ?? "";
  const lang = normalizeLang(url.searchParams.get("lang"));
  const correlationId = typeof req.headers["x-correlation-id"] === "string" ? req.headers["x-correlation-id"] : undefined;
  const authorization = typeof req.headers.authorization === "string" ? req.headers.authorization : undefined;

  // SSE headers. X-Accel-Buffering:no is belt-and-suspenders for buffering proxies; Traefik v3
  // streams by default. CORS (Access-Control-Allow-Origin) is already set by the caller in index.ts.
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });

  try {
    const member = await deps.fetchMember(deps.membersUrl, memberId, correlationId, authorization);
    if (!member) {
      send(res, "error", { message: "member not found" });
      res.end();
      return;
    }
    const plan = planTrips(member.spendablePoints, catalogue);
    send(res, "meta", { spendablePoints: member.spendablePoints });
    const delay = deps.delayMs ?? 70; // ~14 tokens/sec — an unhurried typewriter cadence; 0 in tests
    for (const token of tokenize(narrate(plan, lang))) {
      send(res, "token", { text: token });
      if (delay) await sleep(delay);
    }
    for (const suggestion of toSuggestions(plan)) send(res, "suggestion", suggestion);
    send(res, "done", {});
    res.end();
  } catch {
    // Headers are already sent, so we can still emit an error event and close cleanly.
    send(res, "error", { message: "travel agent unavailable" });
    res.end();
  }
}
