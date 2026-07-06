import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  MEMBERS_URL: z.url().default("http://localhost:5080"),
  PARTNERS_URL: z.url().default("http://localhost:8081"),
});

export const env = EnvSchema.parse(process.env);
