import { describe, expect, it } from "vitest";
import { detectOnelinerReaction } from "@/lib/onelinerReactions";

describe("oneliner reaction detection", () => {
  it("detects hearts in emoji and ASCII forms", () => {
    expect(detectOnelinerReaction("you are great ❤️")).toBe("heart");
    // Literal `<` (typed in chat) and HTML-entity `&lt;` (from HTML-encoded
    // sources) are both supported so incoming chat text is handled regardless
    // of encoding.
    expect(detectOnelinerReaction("love it <3!")).toBe("heart");
    expect(detectOnelinerReaction("still love this &lt;33")).toBe("heart");
    expect(detectOnelinerReaction("ouch </3")).toBe("heart");
    // Token immediately before the heart token (no whitespace separator).
    expect(detectOnelinerReaction("love<3")).toBe("heart");
    // Double-escaped HTML entity (&amp;lt;3) from sources that encode twice.
    expect(detectOnelinerReaction("&amp;lt;3")).toBe("heart");
  });

  it("detects laughter emoji and ASCII forms", () => {
    expect(detectOnelinerReaction("that is wild 😂")).toBe("laughter");
    expect(detectOnelinerReaction("haha that's great")).toBe("laughter");
    expect(detectOnelinerReaction("LOL!")).toBe("laughter");
    expect(detectOnelinerReaction("xD")).toBe("laughter");
    expect(detectOnelinerReaction(":-D")).toBe("laughter");
    // Punctuation-prefixed emoticon adjacent to word characters.
    expect(detectOnelinerReaction("hi:D")).toBe("laughter");
  });

  it("detects wink emoji and ASCII forms", () => {
    expect(detectOnelinerReaction("nice one 😉")).toBe("wink");
    expect(detectOnelinerReaction("that works ;)")).toBe("wink");
    expect(detectOnelinerReaction("cool ;-P")).toBe("wink");
    expect(detectOnelinerReaction("huh ;D")).toBe("wink");
    // Wink emoticon immediately after word characters (no whitespace separator).
    expect(detectOnelinerReaction("nice;)")).toBe("wink");
  });

  it("uses word boundaries for ASCII tokens", () => {
    expect(detectOnelinerReaction("lollipop time")).toBeNull();
    expect(detectOnelinerReaction("shelolx")).toBeNull();
    expect(detectOnelinerReaction("xdm")).toBeNull();
    expect(detectOnelinerReaction("punctuated lol!")).toBe("laughter");
  });
});
