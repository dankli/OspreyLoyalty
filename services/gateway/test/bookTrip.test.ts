import { expect, test } from "vitest";
import { buildYoga } from "../src/server.js";
import { fakeDeps } from "./fakeDeps.js";
import type { RoutePath } from "../src/features/routes/routesClient.js";

const arn = { iata: "ARN", name: "Stockholm Arlanda", city: "Stockholm", country: "Sweden", countryCode: "SE", latitude: 59.65, longitude: 17.92 };
const jfk = { iata: "JFK", name: "John F. Kennedy Intl", city: "New York", country: "United States", countryCode: "US", latitude: 40.64, longitude: -73.78 };

const itinerary: RoutePath = {
  legs: [{ from: arn, to: jfk, km: 6300, min: 500, carriers: [{ iata: "SK", name: "SAS" }] }],
  totalKm: 6300,
  totalMin: 500,
  hops: 1,
  estimatedPoints: 12600,
};

const MUTATION = `mutation {
  bookTrip(memberId: "demo-ada", from: "ARN", to: "JFK", idempotencyKey: "trip-key-0001") {
    fromIata toIata pointsSpent spendablePoints alreadyApplied itinerary { totalKm estimatedPoints }
  }
}`;

async function post(yoga: ReturnType<typeof buildYoga>, query: string) {
  const response = await yoga.fetch("http://gateway/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return response.json();
}

test("bookTrip prices server-side from the route estimate and burns via members", async () => {
  const seen: number[] = [];
  const yoga = buildYoga(fakeDeps({
    searchRoute: async () => itinerary,
    postTripRedemption: async (_url, _memberId, fromIata, toIata, points) => {
      seen.push(points);
      return {
        ok: true,
        result: { fromIata, toIata, pointsSpent: points, spendablePoints: 1900, alreadyApplied: false },
      };
    },
  }));

  const body = await post(yoga, MUTATION);

  expect(body.errors).toBeUndefined();
  expect(seen).toEqual([12600]); // the estimate, not anything the browser sent
  expect(body.data.bookTrip).toEqual({
    fromIata: "ARN",
    toIata: "JFK",
    pointsSpent: 12600,
    spendablePoints: 1900,
    alreadyApplied: false,
    itinerary: { totalKm: 6300, estimatedPoints: 12600 },
  });
});

test("no route between the airports is an expected GraphQL error", async () => {
  const yoga = buildYoga(fakeDeps({ searchRoute: async () => null }));

  const body = await post(yoga, MUTATION);

  expect(body.errors?.[0]?.message).toBe("No route found between those airports.");
});

test("a route without a points estimate refuses instead of guessing", async () => {
  const yoga = buildYoga(fakeDeps({
    searchRoute: async () => ({ ...itinerary, estimatedPoints: null }),
  }));

  const body = await post(yoga, MUTATION);

  expect(body.errors?.[0]?.message).toBe("No points estimate is available for that route right now.");
});

test("members' refusal (insufficient points) carries its localized message", async () => {
  const yoga = buildYoga(fakeDeps({
    searchRoute: async () => itinerary,
    postTripRedemption: async () => ({ ok: false, reason: "rejected", message: "Insufficient spendable points." }),
  }));

  const body = await post(yoga, MUTATION);

  expect(body.errors?.[0]?.message).toBe("Insufficient spendable points.");
});

test("a replayed idempotency key surfaces alreadyApplied without a second spend", async () => {
  const yoga = buildYoga(fakeDeps({
    searchRoute: async () => itinerary,
    postTripRedemption: async () => ({
      ok: true,
      result: { fromIata: "ARN", toIata: "JFK", pointsSpent: 0, spendablePoints: 1900, alreadyApplied: true },
    }),
  }));

  const body = await post(yoga, MUTATION);

  expect(body.data.bookTrip.alreadyApplied).toBe(true);
  expect(body.data.bookTrip.pointsSpent).toBe(0);
});
