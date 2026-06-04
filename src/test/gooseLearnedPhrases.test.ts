import { beforeEach, describe, expect, it } from "vitest";
import {
  __testing,
  findLearnedTrigger,
  getLearnedPhrases,
  learnPhraseFromOneliner,
} from "@/lib/gooseLearnedPhrases";

describe("goose learned phrases", () => {
  beforeEach(() => {
    localStorage.removeItem(__testing.STORAGE_KEY);
  });

  it("stores safe phrases and rejects obvious sensitive content", () => {
    expect(learnPhraseFromOneliner("Whatta!", "Rapture")).toBe("Whatta!");
    expect(learnPhraseFromOneliner("token=supersecret123", "Rapture")).toBeNull();
    expect(getLearnedPhrases()).toEqual(["Whatta!"]);
  });

  it("matches emphatic learned trigger phrases", () => {
    learnPhraseFromOneliner("Whatta!", "Rapture");
    expect(findLearnedTrigger("WHATTA!!!")).toBe("Whatta!");
    expect(findLearnedTrigger("whatta")).toBeNull();
  });
});
