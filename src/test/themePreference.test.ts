import { beforeEach, describe, expect, it } from "vitest";
import {
  LEGACY_THEME_STORAGE_KEY,
  THEME_STORAGE_KEY,
  readThemePreference,
  writeThemePreference,
} from "@/lib/themePreference";

type TestTheme = "orange" | "simple" | "junebula";
const isTestTheme = (value: string): value is TestTheme =>
  value === "orange" || value === "simple" || value === "junebula";

describe("durable theme preference", () => {
  beforeEach(() => localStorage.clear());

  it("migrates the legacy preference once", () => {
    localStorage.setItem(LEGACY_THEME_STORAGE_KEY, "simple");

    expect(readThemePreference(isTestTheme, "orange")).toBe("simple");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("simple");
  });

  it("keeps the durable preference when an old bundle overwrites the legacy key", () => {
    writeThemePreference("junebula");
    localStorage.setItem(LEGACY_THEME_STORAGE_KEY, "orange");

    expect(readThemePreference(isTestTheme, "orange")).toBe("junebula");
  });
});