import { describe, expect, it } from "vitest";
import { createRawEmail, delta, renderDigestHtml, weekEnd, weekStart, type DigestData } from "../../supabase/functions/weekly-digest/digest";

describe("weekly digest helpers", () => {
  it("finds the Stockholm Monday for the current and previous week", () => {
    // Tue 2026-09-08 14:00 UTC
    const now = new Date("2026-09-08T14:00:00Z");
    expect(weekStart(now, 0)).toBe("2026-09-07");
    expect(weekStart(now, 1)).toBe("2026-08-31");
    // Sunday 23:30 Stockholm (21:30 UTC) is still the same week
    expect(weekStart(new Date("2026-09-13T21:30:00Z"), 0)).toBe("2026-09-07");
    // Monday 00:30 Stockholm (Sunday 22:30 UTC) is the new week
    expect(weekStart(new Date("2026-09-13T22:30:00Z"), 0)).toBe("2026-09-14");
    expect(weekEnd("2026-09-07")).toBe("2026-09-13");
  });

  it("formats deltas", () => {
    expect(delta(0, 0)).toBe("±0");
    expect(delta(5, 0)).toBe("new");
    expect(delta(150, 100)).toBe("+50%");
    expect(delta(62, 405)).toBe("-85%");
  });

  const data: DigestData = {
    weekLabel: "2026-09-07 – 2026-09-13",
    isTest: true,
    plays: 62,
    playsDelta: "-85%",
    uniqueSongs: 60,
    loves: 3,
    unloves: 1,
    lovesDelta: "new",
    logins: 2,
    loginsDelta: "±0",
    busiestDay: "Tue 08 Sep (62 plays)",
    topSongs: [{ title: "Melo <3", artists: "Mosaik & Co", plays: 1 }],
    trend: [{ week: "2026-08-31", plays: 405 }, { week: "2026-09-07", plays: 62 }],
  };

  it("renders escaped HTML with all sections", () => {
    const html = renderDigestHtml(data);
    expect(html).toContain("Melo &lt;3");
    expect(html).toContain("Mosaik &amp; Co");
    expect(html).toContain("Tue 08 Sep (62 plays)");
    expect(html).toContain("2026-08-31");
    expect(html).toContain("· test");
  });

  it("encodes a base64url raw message with a UTF-8 safe subject", () => {
    const raw = createRawEmail("a@b.se", "Necta – vecka", "<p>hi</p>");
    expect(raw).not.toMatch(/[+/=]/);
    const decoded = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    expect(decoded).toContain("To: a@b.se");
    expect(decoded).toContain("Subject: =?UTF-8?B?");
    expect(decoded).toContain("<p>hi</p>");
  });
});
