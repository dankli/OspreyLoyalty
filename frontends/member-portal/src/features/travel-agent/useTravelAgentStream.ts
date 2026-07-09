import { useCallback, useState } from "react";
import i18n from "../../i18n";
import { getAccessToken } from "../../auth";
import { parseSseEvents } from "./sse";

export type Suggestion = {
  destination: string;
  emoji: string;
  cost: number;
  affordable: boolean;
  gap?: number;
};

export type StreamState = {
  status: "idle" | "streaming" | "done" | "error";
  spendablePoints: number | null;
  text: string;
  suggestions: Suggestion[];
};

const initial: StreamState = { status: "idle", spendablePoints: null, text: "", suggestions: [] };

// Reuse the repo convention (see logger.ts) for deriving a non-GraphQL gateway URL, so this works
// unchanged in dev, Docker Compose and k8s HTTPS.
const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL ?? "http://localhost:4000/graphql";
const STREAM_BASE = GATEWAY_URL.replace(/\/graphql$/, "") + "/travel-agent/stream";

export function useTravelAgentStream(memberId: string) {
  const [state, setState] = useState<StreamState>(initial);

  const generate = useCallback(async () => {
    setState({ ...initial, status: "streaming" });
    // accept-language is a forbidden fetch header, so the language travels as a query param.
    const url = `${STREAM_BASE}?memberId=${encodeURIComponent(memberId)}&lang=${encodeURIComponent(i18n.language)}`;
    const token = getAccessToken();
    try {
      const response = await fetch(url, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok || !response.body) throw new Error(`stream responded ${response.status}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = parseSseEvents(buffer);
        buffer = rest;
        for (const evt of events) apply(evt.event, evt.data, setState);
      }
      // Flush any bytes the decoder buffered across the final chunk boundary (e.g. a destination
      // emoji split mid-sequence), then drain whatever completes.
      buffer += decoder.decode();
      const { events: flushed } = parseSseEvents(buffer);
      for (const evt of flushed) apply(evt.event, evt.data, setState);
    } catch {
      setState((s) => ({ ...s, status: "error" }));
    }
  }, [memberId]);

  return { state, generate };
}

function apply(event: string, data: string, setState: React.Dispatch<React.SetStateAction<StreamState>>): void {
  switch (event) {
    case "meta": {
      const { spendablePoints } = JSON.parse(data) as { spendablePoints: number };
      setState((s) => ({ ...s, spendablePoints }));
      break;
    }
    case "token": {
      const { text } = JSON.parse(data) as { text: string };
      setState((s) => ({ ...s, text: s.text + text }));
      break;
    }
    case "suggestion": {
      const suggestion = JSON.parse(data) as Suggestion;
      setState((s) => ({ ...s, suggestions: [...s.suggestions, suggestion] }));
      break;
    }
    case "done":
      setState((s) => ({ ...s, status: "done" }));
      break;
    case "error":
      setState((s) => ({ ...s, status: "error" }));
      break;
  }
}
