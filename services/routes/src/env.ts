import { z } from "zod";

const BoolFlag = z
  .string()
  .default("false")
  .transform((value) => value === "true");

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8083),
  NEO4J_URL: z.string().default("bolt://localhost:7687"),
  SEED_ROUTES: z
    .string()
    .default("true")
    .transform((value) => value === "true"),
  POINTS_ENGINE_URL: z.url().default("http://localhost:8082"),
  ROUTE_POINTS_PER_KM: z.coerce.number().positive().default(5),
  AUTH_ENABLED: BoolFlag,
  AUTH_SECRET: z.string().optional(),
  AUTH_JWKS_URI: z.url().optional(),
});

export const env = EnvSchema.parse(process.env);
