import { graphql } from "../../gql";
import type { RouteOptimize } from "../../gql/graphql";
import { gatewayClient } from "../../gatewayClient";
import type { AirportHit } from "../explore/exploreData";

const RouteSearchDocument = graphql(`
  query RouteSearch($from: ID!, $to: ID!, $optimize: RouteOptimize!) {
    routeSearch(from: $from, to: $to, optimize: $optimize) {
      hops
      totalKm
      totalMin
      estimatedPoints
      legs {
        from {
          iata
          name
          city
          country
        }
        to {
          iata
          name
          city
          country
        }
        km
        min
        carriers {
          name
        }
      }
    }
  }
`);

export type { RouteOptimize };

export type RouteLegRow = {
  from: AirportHit;
  to: AirportHit;
  km: number;
  min: number;
  carriers: { name: string }[];
};

export type RoutePathResult = {
  hops: number;
  totalKm: number;
  totalMin: number;
  estimatedPoints: number | null;
  legs: RouteLegRow[];
};

export async function searchRoute(
  from: string,
  to: string,
  optimize: RouteOptimize,
): Promise<RoutePathResult | null> {
  const data = await gatewayClient.request(RouteSearchDocument, { from, to, optimize });
  return data.routeSearch;
}
