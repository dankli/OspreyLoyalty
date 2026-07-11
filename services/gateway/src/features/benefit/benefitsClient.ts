import { z } from "zod";
import { t } from "../../i18n.js";

const REQUEST_TIMEOUT_MS = 2000; // the BFF must answer fast or not at all

export const BenefitActivationSchema = z.object({
  benefit: z.string(),
  code: z.string(),
  activatedAtUtc: z.string(),
  alreadyApplied: z.boolean(),
});

export type BenefitActivation = z.infer<typeof BenefitActivationSchema>;

// members' 400 body carries a localized { error } message.
const RejectionSchema = z.object({ error: z.string().optional() });

// Same rail shape as the other members mutations: applied, or an EXPECTED refusal as a value.
export type BenefitActivationOutcome =
  | { ok: true; result: BenefitActivation }
  | { ok: false; reason: "not_found" | "rejected"; message: string };

function headers(correlationId?: string, authorization?: string, acceptLanguage?: string): Record<string, string> {
  return {
    ...(correlationId ? { "x-correlation-id": correlationId } : {}),
    ...(authorization ? { authorization } : {}),
    ...(acceptLanguage ? { "accept-language": acceptLanguage } : {}),
  };
}

export async function fetchBenefitActivations(
  baseUrl: string,
  memberId: string,
  correlationId?: string,
  authorization?: string,
  acceptLanguage?: string,
): Promise<BenefitActivation[]> {
  const response = await fetch(
    `${baseUrl}/api/members/${encodeURIComponent(memberId)}/benefit-activations`,
    { headers: headers(correlationId, authorization, acceptLanguage), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
  );
  if (!response.ok) throw new Error(`members service responded ${response.status}`);
  return z.array(BenefitActivationSchema).parse(await response.json());
}

export async function postBenefitActivation(
  baseUrl: string,
  memberId: string,
  benefit: string,
  idempotencyKey: string,
  correlationId?: string,
  authorization?: string,
  acceptLanguage?: string,
): Promise<BenefitActivationOutcome> {
  const response = await fetch(
    `${baseUrl}/api/members/${encodeURIComponent(memberId)}/benefit-activations`,
    {
      method: "POST",
      headers: { ...headers(correlationId, authorization, acceptLanguage), "content-type": "application/json" },
      body: JSON.stringify({ benefit, idempotencyKey }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );
  if (response.status === 404) return { ok: false, reason: "not_found", message: t("member_not_found", acceptLanguage) };
  if (response.status === 400) {
    const body = RejectionSchema.safeParse(await response.json());
    const message = body.success && body.data.error ? body.data.error : t("benefit_rejected", acceptLanguage);
    return { ok: false, reason: "rejected", message };
  }
  if (!response.ok) throw new Error(`members service responded ${response.status}`);
  return { ok: true, result: BenefitActivationSchema.parse(await response.json()) };
}
