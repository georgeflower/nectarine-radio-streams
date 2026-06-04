import { describe, expect, it } from "vitest";
import { detectOnelinerReaction } from "@/lib/onelinerReactions";

describe("oneliner reaction detection", () => {
  it("detects hearts in emoji and ASCII forms", () => {
    expect(detectOnelinerReaction("you are great ❤️")).toBe("heart");
    expect(detectOnelinerReaction("love it <3!")).toBe("heart");
    expect(detectOnelinerReaction("still love this &lt;33")).toBe("heart");
    expect(detectOnelinerReaction("ouch </3")).toBe("heart");
  });

  it("detects laughter emoji and ASCII forms", () => {
    expect(detectOnelinerReaction("that is wild 😂")).toBe("laughter");
    expect(detectOnelinerReaction("haha that's great")).toBe("laughter");
    expect(detectOnelinerReaction("LOL!")).toBe("laughter");
    expect(detectOnelinerReaction("xD")).toBe("laughter");
    expect(detectOnelinerReaction(":-D")).toBe("laughter");
  });

  it("detects wink emoji and ASCII forms", () => {
    expect(detectOnelinerReaction("nice one 😉")).toBe("wink");
    expect(detectOnelinerReaction("that works ;)")).toBe("wink");
    expect(detectOnelinerReaction("cool ;-P")).toBe("wink");
    expect(detectOnelinerReaction("huh ;D")).toBe("wink");
  });

  it("uses word boundaries for ASCII tokens", () => {
    expect(detectOnelinerReaction("lollipop time")).toBeNull();
    expect(detectOnelinerReaction("shelolx")).toBeNull();
    expect(detectOnelinerReaction("xdm")).toBeNull();
    expect(detectOnelinerReaction("punctuated lol!")).toBe("laughter");
  });
});
