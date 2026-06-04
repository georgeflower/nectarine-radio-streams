import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Cracktro from "../components/Cracktro";

vi.mock("../components/Visualizer", () => ({
  default: () => <div data-testid="visualizer" />,
}));

vi.mock("../components/BeatOverlay", () => ({
  default: () => <div data-testid="beat-overlay" />,
}));

vi.mock("../components/FlyingGoose", () => ({
  default: () => <div data-testid="flying-goose" />,
}));

vi.mock("../components/BoingBall", () => ({
  default: () => <div data-testid="boing-ball" />,
}));

vi.mock("../components/FloatingWindow", () => ({
  default: ({ id, title, children }: { id: string; title: string; children: ReactNode }) => (
    <section data-testid={`floating-${id}`} aria-label={title}>
      {children}
    </section>
  ),
}));

describe("Cracktro defaults and fullscreen behavior", () => {
  let fullscreenEl: Element | null = null;

  beforeEach(() => {
    localStorage.clear();
    fullscreenEl = null;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: vi.fn(() => null),
    });
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenEl,
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: vi.fn(async () => {
        fullscreenEl = null;
        document.dispatchEvent(new Event("fullscreenchange"));
      }),
    });
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: vi.fn(async () => {
        fullscreenEl = document.body;
        document.dispatchEvent(new Event("fullscreenchange"));
      }),
    });
  });

  it("shows goose, boing ball, info text, and queue by default", async () => {
    render(<Cracktro analyser={null} style="off" artist="Skaven" title="Lizardking" onExit={() => undefined} />);

    expect(await screen.findByText(/Skaven/i)).toBeInTheDocument();
    expect(screen.getByTestId("flying-goose")).toBeInTheDocument();
    expect(screen.getByTestId("boing-ball")).toBeInTheDocument();
    expect(screen.getByTestId("floating-queue")).toBeInTheDocument();
  });

  it("exits fullscreen back to in-browser view without opening a floating window", async () => {
    const onExit = vi.fn();
    render(<Cracktro analyser={null} style="off" artist="Skaven" title="Lizardking" onExit={onExit} />);

    const fsButton = await screen.findByRole("button", { name: "Exit fullscreen" });
    fireEvent.click(fsButton);

    await waitFor(() => expect(screen.getByRole("button", { name: "Enter fullscreen" })).toBeInTheDocument());
    expect(screen.queryByText(/Cracktro — Windowed/i)).not.toBeInTheDocument();
    expect(onExit).not.toHaveBeenCalled();
  });
});
