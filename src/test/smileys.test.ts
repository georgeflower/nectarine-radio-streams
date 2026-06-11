import { describe, expect, it } from "vitest";
import { renderWithSmileys } from "@/lib/smileys";
import { isValidElement, type ReactNode } from "react";

/** Returns true when at least one rendered node is a React element (= a smiley img). */
function hasSmiley(nodes: ReactNode[]): boolean {
  return nodes.some((n) => isValidElement(n));
}

describe("renderWithSmileys – word-boundary guard", () => {
  it("matches D: when it stands alone", () => {
    expect(hasSmiley(renderWithSmileys("D:"))).toBe(true);
  });

  it("matches D: when surrounded by whitespace", () => {
    expect(hasSmiley(renderWithSmileys("oh no D: really"))).toBe(true);
  });

  it("does NOT match D: when preceded by a word character (Scarhead:)", () => {
    const nodes = renderWithSmileys("Scarhead: nice track");
    expect(hasSmiley(nodes)).toBe(false);
    expect(nodes).toEqual(["Scarhead: nice track"]);
  });

  it("does NOT match D: when it is part of a word (xD:foo)", () => {
    expect(hasSmiley(renderWithSmileys("xD:foo"))).toBe(false);
  });

  it("matches :D when it stands alone", () => {
    expect(hasSmiley(renderWithSmileys(":D"))).toBe(true);
  });

  it("does NOT match :D when immediately followed by a word character (:Dashboard)", () => {
    expect(hasSmiley(renderWithSmileys(":Dashboard"))).toBe(false);
  });

  it("matches :D at the end of a word boundary (hi:D)", () => {
    // :D starts with ':', a non-word char, so no prefix guard; it ends with 'D'
    // but nothing follows → suffix guard passes.
    expect(hasSmiley(renderWithSmileys("hi:D"))).toBe(true);
  });

  it("does NOT match o_o embedded in a longer word", () => {
    expect(hasSmiley(renderWithSmileys("loophole"))).toBe(false);
  });
});
