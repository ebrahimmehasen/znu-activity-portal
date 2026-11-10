import { afterEach, describe, expect, it, vi } from "vitest";

describe("server clock", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it("corrects a phone clock that is minutes off", async () => {
    const { learnServerTime, serverNow } = await import("@/components/qr/server-clock");
    // The phone thinks it's 10:00:00; the server says 10:03:00.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-10T10:00:00Z"));
    const res = new Response(null, { headers: { date: new Date("2026-11-10T10:03:00Z").toUTCString() } });
    learnServerTime(res, Date.now());
    expect(Math.abs(serverNow() - Date.parse("2026-11-10T10:03:00.500Z"))).toBeLessThan(50);
  });

  it("ignores sub-second jitter and missing headers", async () => {
    const { learnServerTime, serverNow } = await import("@/components/qr/server-clock");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-10T10:00:00Z"));
    learnServerTime(new Response(null), Date.now());
    learnServerTime(new Response(null, { headers: { date: new Date("2026-11-10T10:00:00Z").toUTCString() } }), Date.now());
    expect(serverNow()).toBe(Date.now());
  });
});
