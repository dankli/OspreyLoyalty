import { GraphQLClient } from "graphql-request";
import { getAccessToken } from "./auth";
import i18n from "./i18n";

export const gatewayClient = new GraphQLClient(
  import.meta.env.VITE_GATEWAY_URL ?? "http://localhost:4000/graphql",
  {
    // Per request: send the active UI language so the gateway (and the services it forwards to)
    // localize their messages to the switcher's choice, and attach the caller's bearer when auth
    // is on. Copy via `new Headers(...)` so graphql-request's own Content-Type: application/json is
    // preserved — spreading request.headers (a Headers instance) would drop it and Yoga returns 415.
    requestMiddleware: (request) => {
      const headers = new Headers(request.headers as HeadersInit);
      headers.set("accept-language", i18n.language);
      const token = getAccessToken();
      if (token) headers.set("authorization", `Bearer ${token}`);
      return { ...request, headers };
    },
  },
);
