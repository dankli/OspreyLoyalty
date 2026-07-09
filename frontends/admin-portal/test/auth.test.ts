import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as auth from "../src/auth";

afterEach(() => {
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

describe("auth disabled (default)", () => {
  test("full access, no bearer", () => {
    expect(auth.authEnabled()).toBe(false);
    expect(auth.isAdmin()).toBe(true);
    expect(auth.getAccessToken()).toBeUndefined();
  });
});

describe("auth enabled", () => {
  beforeEach(() => vi.stubEnv("VITE_AUTH_ENABLED", "true"));

  test("admin role and bearer come from the shared session", () => {
    auth.writeSession({ accessToken: "tok", expiresAt: Date.now() + 60_000, sub: "root", roles: ["admin", "member"] });
    expect(auth.isAdmin()).toBe(true);
    expect(auth.getAccessToken()).toBe("tok");
  });

  test("a member-only session is not an admin", () => {
    auth.writeSession({ accessToken: "tok", expiresAt: Date.now() + 60_000, sub: "erik", roles: ["member"] });
    expect(auth.isAdmin()).toBe(false);
  });

  test("no session means no admin and no bearer", () => {
    expect(auth.isAdmin()).toBe(false);
    expect(auth.getAccessToken()).toBeUndefined();
  });
});
