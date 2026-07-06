import { GraphQLClient } from "graphql-request";

export const gatewayClient = new GraphQLClient(
  import.meta.env.VITE_GATEWAY_URL ?? "http://localhost:4000/graphql",
);
