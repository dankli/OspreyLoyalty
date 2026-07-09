import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as auth from "../src/auth";

afterEach(() => {
  vi.unstubAllEnvs();
  sessionStorage.clear();
  window.history.pushState({}, "", "/");
});

describe("auth disabled (default)", () => {
  test("member id is the demo default", () => {
    expect(auth.authEnabled()).toBe(false);
    expect(auth.getMemberId()).toBe("demo-ada");
  });

  test("?as= overrides the member id when auth is off", () => {
    window.history.pushState({}, "", "/?as=demo-erik");
    expect(auth.getMemberId()).toBe("demo-erik");
  });

  test("no bearer and no role restrictions", () => {
    expect(auth.getAccessToken()).toBeUndefined();
    expect(auth.hasRole("admin")).toBe(true);
  });
});

describe("auth enabled", () => {
  beforeEach(() => vi.stubEnv("VITE_AUTH_ENABLED", "true"));

  test("identity, roles and bearer come from the shared session", () => {
    auth.writeSession({ accessToken: "tok-123", expiresAt: Date.now() + 60_000, sub: "user-7", roles: ["member"] });
    expect(auth.getMemberId()).toBe("user-7");
    expect(auth.getAccessToken()).toBe("tok-123");
    expect(auth.hasRole("member")).toBe(true);
    expect(auth.hasRole("admin")).toBe(false);
  });

  test("an expired session is ignored", () => {
    auth.writeSession({ accessToken: "old", expiresAt: Date.now() - 1_000, sub: "user-7", roles: [] });
    expect(auth.getAccessToken()).toBeUndefined();
    expect(auth.getMemberId()).toBe("demo-ada"); // falls back
    expect(auth.hasRole("member")).toBe(false);
  });

  test("?as= cannot spoof identity when auth is on", () => {
    window.history.pushState({}, "", "/?as=attacker");
    auth.writeSession({ accessToken: "tok", expiresAt: Date.now() + 60_000, sub: "real-user", roles: [] });
    expect(auth.getMemberId()).toBe("real-user");
  });
});
