import "./otel.js"; // must be first — starts tracing before anything else loads
import { createServer } from "node:http";
import pino from "pino";
import { env } from "./env.js";
import { createApp } from "./app.js";
import { createAuthorizer } from "./auth.js";
import { createDriver } from "./neo4j.js";
import { createAllAirports, getAirport, getDestinations, searchAirports } from "./features/airports/queries.js";
import { searchRoute } from "./features/route-search/searchRoute.js";
import { createPointsEstimator } from "./features/points/pointsClient.js";
import { loadDataset, seedRoutes } from "./features/seed/seedRoutes.js";
import { warmRouteGraph } from "./features/route-search/warmup.js";

const logger = pino();
const driver = createDriver(env.NEO4J_URL);
const estimatePoints = createPointsEstimator(env.POINTS_ENGINE_URL, env.ROUTE_POINTS_PER_KM, logger);

let ready = false;

const app = createApp({
  searchAirports: (q, limit) => searchAirports(driver, q, limit),
  getAirport: (iata) => getAirport(driver, iata),
  getDestinations: (iata) => getDestinations(driver, iata),
  allAirports: createAllAirports(driver),
  searchRoute: async (from, to, optimize) => {
    const path = await searchRoute(driver, from, to, optimize);
    if (!path) return null;
    // Decoration, not dependency: a dead points-engine yields estimatedPoints: null, never a failed search.
    return { ...path, estimatedPoints: await estimatePoints(path.totalKm) };
  },
  isReady: () => ready,
  authorize: createAuthorizer({
    enabled: env.AUTH_ENABLED,
    secret: env.AUTH_SECRET,
    jwksUri: env.AUTH_JWKS_URI,
  }),
});

const server = createServer(app);
server.listen(env.PORT, () => logger.info({ port: env.PORT }, "routes listening"));

// Seed after listen so /health answers during the load — an orchestrator's liveness
// probe must not kill a pod that is busy seeding. /ready flips only when the graph exists.
void (async () => {
  try {
    if (env.SEED_ROUTES) {
      await seedRoutes(driver, loadDataset(), logger);
    } else {
      logger.info("SEED_ROUTES=false — assuming an already-seeded graph");
    }
    await warmRouteGraph(driver, logger); // /ready implies warm: see warmup.ts
    ready = true;
  } catch (error) {
    logger.error({ err: error }, "seeding failed — staying unready");
    // Deliberately no process.exit: /health keeps the pod alive for diagnosis while
    // /ready holds traffic off. A restart retries the seed (MERGE makes that safe).
  }
})();

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    logger.info({ signal }, "shutting down");
    server.close(() => {
      void driver.close().then(() => process.exit(0));
    });
  });
}
