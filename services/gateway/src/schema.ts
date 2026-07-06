import { readFileSync } from "node:fs";
import { createSchema } from "graphql-yoga";
import { env } from "./env.js";
import type { Member } from "./features/member/membersClient.js";

export type Deps = { fetchMember: (baseUrl: string, id: string) => Promise<Member | null> };

const typeDefs = readFileSync(new URL("../schema.graphql", import.meta.url), "utf8");

export function schema(deps: Deps) {
  return createSchema({
    typeDefs,
    resolvers: {
      Query: {
        member: (_parent: unknown, args: { id: string }) => deps.fetchMember(env.MEMBERS_URL, args.id),
      },
    },
  });
}
