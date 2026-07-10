import { z } from "zod";
import type pino from "pino";

// Much tighter than the 2 s request budget: the estimate decorates an answer that has
// already been computed, and the decorated response still has to beat the BFF's 2 s
// abort. A dead engine (hanging connect, slow DNS) must cost at most this.
const REQUEST_TIMEOUT_MS = 600;

const CalculateResponseSchema = z.object({ points: z.number() });

/**
 * Reuse over reimplement (ADR-0006): the Rust points-engine owns the calculation;
 * this service sends km as the amount with the configured points-per-km rate.
 * The estimate is decoration on a route answer, so EVERY failure — engine down,
 * timeout, drifted shape — degrades to null with a warn log. A route search must
 * never fail because a badge could not be computed.
 */
export function createPointsEstimator(
  baseUrl: string,
  pointsPerKm: number,
  log: pino.Logger,
): (totalKm: number) => Promise<number | null> {
  return async (totalKm) => {
    try {
      const response = await fetch(`${baseUrl}/calculate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: totalKm, rate: pointsPerKm, promotions: [] }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`points-engine responded ${response.status}`);
      return CalculateResponseSchema.parse(await response.json()).points;
    } catch (error) {
      log.warn({ err: error }, "points estimate unavailable — degrading to null");
      return null;
    }
  };
}
