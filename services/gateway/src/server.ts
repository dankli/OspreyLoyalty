import { createYoga } from "graphql-yoga";
import type { YogaServerInstance } from "graphql-yoga";
import { schema, type Deps } from "./schema.js";
import { fetchMember } from "./features/member/membersClient.js";

export function buildYoga(deps: Deps = { fetchMember }): YogaServerInstance<{}, {}> {
  // Demo stack: the portal is served from another local port, so CORS is wide open on purpose.
  return createYoga({ schema: schema(deps), cors: { origin: "*" } });
}
