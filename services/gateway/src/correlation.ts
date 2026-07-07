export const CORRELATION_HEADER = "x-correlation-id";

/** Accept the caller's id or mint one — every request is traceable either way. */
export function resolveCorrelationId(headers: Headers): string {
  return headers.get(CORRELATION_HEADER) ?? crypto.randomUUID().replaceAll("-", "");
}
