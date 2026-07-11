import { graphql } from "../../gql";
import type { RouteOptimize } from "../../gql/graphql";
import { gatewayClient } from "../../gatewayClient";

const BookTripDocument = graphql(`
  mutation BookTrip($memberId: ID!, $from: ID!, $to: ID!, $optimize: RouteOptimize!, $idempotencyKey: String!) {
    bookTrip(memberId: $memberId, from: $from, to: $to, optimize: $optimize, idempotencyKey: $idempotencyKey) {
      fromIata
      toIata
      pointsSpent
      spendablePoints
      alreadyApplied
    }
  }
`);

export type TripBooking = {
  fromIata: string;
  toIata: string;
  pointsSpent: number;
  spendablePoints: number;
  alreadyApplied: boolean;
};

/**
 * Book the searched trip with points. The gateway re-prices server-side from the route
 * estimate — this call only names the route and carries the idempotency key, so a retry
 * (double-click, flaky network) can never double-spend.
 */
export async function bookTrip(
  memberId: string,
  from: string,
  to: string,
  optimize: RouteOptimize,
  idempotencyKey: string,
): Promise<TripBooking> {
  const data = await gatewayClient.request(BookTripDocument, { memberId, from, to, optimize, idempotencyKey });
  return data.bookTrip;
}
