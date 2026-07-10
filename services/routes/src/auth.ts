import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

/**
 * Zero-trust config, mirroring the points-engine semantics (ADR-0007): opt-in via
 * AUTH_ENABLED so the demo and direct curls stay open; when on, API routes need a valid
 * bearer. Two modes — an HS256 shared secret (demo/test) takes precedence, otherwise
 * RS256 against the identity service's JWKS. jose's remote JWK set caches keys for
 * 10 minutes so we don't hammer the IdP.
 */
export type AuthConfig = {
  enabled: boolean;
  secret?: string;
  jwksUri?: string;
};

export type Authorizer = (authorizationHeader: string | undefined) => Promise<boolean>;

export function createAuthorizer(config: AuthConfig): Authorizer {
  if (!config.enabled) return async () => true;

  const jwks: JWTVerifyGetKey | undefined = config.jwksUri
    ? createRemoteJWKSet(new URL(config.jwksUri), { cacheMaxAge: 600_000 })
    : undefined;
  const secretKey = config.secret ? new TextEncoder().encode(config.secret) : undefined;

  return async (authorizationHeader) => {
    const token = authorizationHeader?.startsWith("Bearer ")
      ? authorizationHeader.slice("Bearer ".length)
      : undefined;
    if (!token) return false;
    try {
      if (secretKey) {
        await jwtVerify(token, secretKey, { algorithms: ["HS256"] });
        return true;
      }
      if (jwks) {
        await jwtVerify(token, jwks, { algorithms: ["RS256"] });
        return true;
      }
      return false; // enabled but unconfigured must fail closed, never open
    } catch {
      return false; // invalid signature, expiry, malformed token — all just "no"
    }
  };
}
