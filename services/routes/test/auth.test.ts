import { SignJWT } from "jose";
import { expect, test } from "vitest";
import { createAuthorizer } from "../src/auth.js";

const SECRET = "test-secret-at-least-32-bytes-long!!";

async function hs256Token(secret: string): Promise<string> {
  return new SignJWT({ sub: "demo-ada" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(secret));
}

test("auth disabled authorizes everything, token or not", async () => {
  const authorize = createAuthorizer({ enabled: false });
  expect(await authorize(undefined)).toBe(true);
  expect(await authorize("Bearer garbage")).toBe(true);
});

test("HS256 mode accepts a token signed with the shared secret", async () => {
  const authorize = createAuthorizer({ enabled: true, secret: SECRET });
  expect(await authorize(`Bearer ${await hs256Token(SECRET)}`)).toBe(true);
});

test("HS256 mode rejects a token signed with a different secret", async () => {
  const authorize = createAuthorizer({ enabled: true, secret: SECRET });
  expect(await authorize(`Bearer ${await hs256Token("wrong-secret-also-32-bytes-long!!!!!")}`)).toBe(false);
});

test("HS256 mode rejects a missing or malformed bearer", async () => {
  const authorize = createAuthorizer({ enabled: true, secret: SECRET });
  expect(await authorize(undefined)).toBe(false);
  expect(await authorize("Bearer not-a-jwt")).toBe(false);
  expect(await authorize("Basic dXNlcjpwYXNz")).toBe(false);
});

test("enabled without secret or JWKS rejects everything rather than failing open", async () => {
  const authorize = createAuthorizer({ enabled: true });
  expect(await authorize(`Bearer ${await hs256Token(SECRET)}`)).toBe(false);
});
