import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GooseAPI, GooseRole } from "@/lib/gooseSocial";

const makeGoose = (variant: GooseRole): GooseAPI => ({
  variant,
  say: vi.fn(),
  getPosition: vi.fn(() => (variant === "white" ? { x: 140, y: 260 } : { x: 520, y: 260 })),
  setAway: vi.fn(),
  setChaseTarget: vi.fn(),
  setFoodBag: vi.fn(),
  setSitting: vi.fn(),
  setFetchingFood: vi.fn(),
  setBallPlayActive: vi.fn(),
});

describe("gooseSocial game flows", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps ball play as chase-and-bump directives and clears at end", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const social = await import("@/lib/gooseSocial");
    social.__testing.resetStateForTests();

    const white = makeGoose("white");
    const brown = makeGoose("brown");
    const unregWhite = social.__testing.registerGooseForTests(white);
    const unregBrown = social.__testing.registerGooseForTests(brown);
    social.setBallPos({ x: 300, y: 220 });

    const playing = social.__testing.runBallPlay();
    await vi.advanceTimersByTimeAsync(700);
    const directive = social.getBallPlayDirective();
    expect(directive).not.toBeNull();
    if (directive) social.reportBallBump(directive.chaser);
    await vi.advanceTimersByTimeAsync(100);

    expect(social.getBallPlayDirective()).toBeNull();

    await vi.runAllTimersAsync();
    await playing;

    expect(social.getBallPlayDirective()).toBeNull();
    expect(white.setChaseTarget).toHaveBeenCalled();
    expect(brown.setChaseTarget).toHaveBeenCalled();

    unregWhite();
    unregBrown();
    randomSpy.mockRestore();
  });

  it("calls setSitting(false) on both geese when runBallPlay starts", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const social = await import("@/lib/gooseSocial");
    social.__testing.resetStateForTests();

    const white = makeGoose("white");
    const brown = makeGoose("brown");
    const unregWhite = social.__testing.registerGooseForTests(white);
    const unregBrown = social.__testing.registerGooseForTests(brown);
    social.setBallPos({ x: 300, y: 220 });

    const playing = social.__testing.runBallPlay();
    // Advance just enough for the pre-play sitting clear to have been called.
    await vi.advanceTimersByTimeAsync(1);

    expect(white.setSitting).toHaveBeenCalledWith(false);
    expect(brown.setSitting).toHaveBeenCalledWith(false);

    await vi.runAllTimersAsync();
    await playing;

    unregWhite();
    unregBrown();
    randomSpy.mockRestore();
  });

  it("toggles setBallPlayActive on both geese around runBallPlay", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const social = await import("@/lib/gooseSocial");
    social.__testing.resetStateForTests();

    const white = makeGoose("white");
    const brown = makeGoose("brown");
    const unregWhite = social.__testing.registerGooseForTests(white);
    const unregBrown = social.__testing.registerGooseForTests(brown);
    social.setBallPos({ x: 300, y: 220 });

    const playing = social.__testing.runBallPlay();
    // Advance just enough for the pre-play activation to have been called.
    await vi.advanceTimersByTimeAsync(1);

    expect(white.setBallPlayActive).toHaveBeenCalledWith(true);
    expect(brown.setBallPlayActive).toHaveBeenCalledWith(true);

    await vi.runAllTimersAsync();
    await playing;

    expect(white.setBallPlayActive).toHaveBeenCalledWith(false);
    expect(brown.setBallPlayActive).toHaveBeenCalledWith(false);

    unregWhite();
    unregBrown();
    randomSpy.mockRestore();
  });

  it("clears snack state if one goose unregisters mid-break", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const social = await import("@/lib/gooseSocial");
    social.__testing.resetStateForTests();

    const white = makeGoose("white");
    const brown = makeGoose("brown");
    const unregWhite = social.__testing.registerGooseForTests(white);
    let unregBrown: (() => void) | null = null;
    brown.setSitting = vi.fn((sitting: boolean) => {
      if (sitting) unregBrown?.();
    });
    unregBrown = social.__testing.registerGooseForTests(brown);

    const breakRun = social.__testing.runFlyAway();
    await vi.runAllTimersAsync();
    await breakRun;

    expect(white.setFoodBag).toHaveBeenCalledWith(true);
    expect(white.setFoodBag).toHaveBeenCalledWith(false);
    expect(white.setSitting).toHaveBeenCalledWith(true);
    expect(white.setSitting).toHaveBeenCalledWith(false);

    unregWhite();
    randomSpy.mockRestore();
  });

  it("runs snack break with away, food bag, and group sitting", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const social = await import("@/lib/gooseSocial");
    social.__testing.resetStateForTests();

    const white = makeGoose("white");
    const brown = makeGoose("brown");
    const unregWhite = social.__testing.registerGooseForTests(white);
    const unregBrown = social.__testing.registerGooseForTests(brown);

    const breakRun = social.__testing.runFlyAway();
    await vi.runAllTimersAsync();
    await breakRun;

    expect(white.setAway).toHaveBeenCalledWith(true);
    expect(white.setAway).toHaveBeenCalledWith(false);
    expect(white.setFoodBag).toHaveBeenCalledWith(true);
    expect(white.setFoodBag).toHaveBeenCalledWith(false);
    expect(white.setFetchingFood).toHaveBeenCalledWith(true);
    expect(white.setFetchingFood).toHaveBeenCalledWith(false);
    expect(white.setSitting).toHaveBeenCalledWith(true);
    expect(white.setSitting).toHaveBeenCalledWith(false);
    expect(brown.setSitting).toHaveBeenCalledWith(true);
    expect(brown.setSitting).toHaveBeenCalledWith(false);

    unregWhite();
    unregBrown();
    randomSpy.mockRestore();
  });

  it("only builds idle dialogue when a recent oneliner exists", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const social = await import("@/lib/gooseSocial");
    social.__testing.resetStateForTests();

    expect(social.__testing.buildContextualDialogueForTests(Date.now())).toBeNull();

    social.noteRecentOneliner("SceneUser", "Confirmasse forever");
    const dialogue = social.__testing.buildContextualDialogueForTests(Date.now());
    expect(dialogue).not.toBeNull();
    expect(dialogue?.join(" ")).toContain("SceneUser");

    randomSpy.mockRestore();
  });

  it("has a large set of oneliner reaction responses", async () => {
    const social = await import("@/lib/gooseSocial");
    social.__testing.resetStateForTests();

    const responses = social.__testing.getOnelinerReactionResponsesForTests();
    expect(responses.length).toBeGreaterThanOrEqual(50);
    expect(responses).toContain("Confirmasse!");
    expect(responses).toContain("He-Man!");
    expect(responses).toContain("glob glob!");
    expect(responses).toContain("Jogeir is GOD!");
  });
});
