import { beforeEach, describe, expect, it } from "vitest";
import {
  __testing,
  buildBirdUtterance,
  classifyToken,
  deriveOnelinerMood,
  getLearnedLexicon,
  learnLexiconFromOneliner,
  pickTokenByCategory,
  tokenizeOneliner,
} from "@/lib/gooseLearnedLexicon";

describe("goose learned lexicon", () => {
  beforeEach(() => {
    localStorage.removeItem(__testing.STORAGE_KEY);
  });

  it("tokenizes expressive non-sensitive snippets", () => {
    const tokens = tokenizeOneliner("HELLO scene!!! lol ;) <3 token=secret");
    expect(tokens).toEqual(["HELLO", "scene", "!!!", "lol", ";)", "<3"]);
  });

  it("classifies key token categories", () => {
    expect(classifyToken("<3")).toBe("heart");
    expect(classifyToken("lol")).toBe("laughter");
    expect(classifyToken(";)")).toBe("wink");
    expect(classifyToken("WHATTA")).toBe("hype");
    expect(classifyToken("!!!")).toBe("emphasis");
  });

  it("learns tokens and picks weighted category candidates", () => {
    learnLexiconFromOneliner("whatta scene!!!", "Rapture");
    learnLexiconFromOneliner("whatta", "Rapture");
    learnLexiconFromOneliner("whatta", "MoodsPlateau");

    const snapshot = getLearnedLexicon();
    expect(snapshot.tokens.length).toBeGreaterThan(0);

    const hype = pickTokenByCategory("hype", "hype");
    expect(hype).toBe("whatta");
  });

  it("derives mood from recent oneliner patterns", () => {
    const friendly = deriveOnelinerMood([
      { text: "hello sceners <3" },
      { text: "hey ;)" },
      { text: "hehe" },
    ]);
    expect(friendly).toBe("friendly");

    const chaotic = deriveOnelinerMood([
      { text: "WHATTA!!!" },
      { text: "BOOM!!! 1337!!!" },
      { text: "RUSH!!!" },
    ]);
    expect(chaotic).toBe("chaotic");
  });

  it("builds short safe utterances", () => {
    learnLexiconFromOneliner("hello ;) <3", "Rapture");
    const utterance = buildBirdUtterance({ mood: "friendly", maxLen: 28 });

    expect(utterance).not.toBeNull();
    expect((utterance ?? "").length).toBeLessThanOrEqual(28);
    expect(utterance).toMatch(/hello|<3|;\)/i);
  });
});
