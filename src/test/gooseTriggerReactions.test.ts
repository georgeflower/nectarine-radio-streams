import { beforeEach, describe, expect, it } from "vitest";
import { __testing as learnedTesting, learnPhraseFromOneliner } from "@/lib/gooseLearnedPhrases";
import { detectGooseTriggerReaction } from "@/lib/gooseTriggerReactions";

describe("goose trigger reactions", () => {
  beforeEach(() => {
    localStorage.removeItem(learnedTesting.STORAGE_KEY);
  });

  it("detects built-in Whatta trigger", () => {
    const reaction = detectGooseTriggerReaction("Whatta!!!");
    expect(reaction).toMatchObject({ key: "whatta", echo: "Whatta!", mode: "stun-freakout" });
  });

  it("uses emphatic learned phrases as triggers", () => {
    learnPhraseFromOneliner("Honkstorm", "Rapture");
    const reaction = detectGooseTriggerReaction("HONKSTORM!!");
    expect(reaction).not.toBeNull();
    expect(reaction?.echo).toBe("Honkstorm");
  });
});
