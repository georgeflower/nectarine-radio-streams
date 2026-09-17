import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareFreshStartup } from "@/lib/startupFreshness";

describe("cold-start freshness gate", () => {
  beforeEach(() => sessionStorage.clear());

  it("falls through to rendering when the freshness request fails", async () => {
    const reload = vi.fn(async () => undefined);
    const shouldRender = await prepareFreshStartup({
      check: vi.fn(async () => { throw new Error("offline"); }),
      reload,
    });

    expect(shouldRender).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads a stale startup before rendering", async () => {
    const reload = vi.fn(async () => undefined);
    const shouldRender = await prepareFreshStartup({
      check: vi.fn(async () => ({ current: "old", server: "new", stale: true })),
      reload,
    });

    expect(shouldRender).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});