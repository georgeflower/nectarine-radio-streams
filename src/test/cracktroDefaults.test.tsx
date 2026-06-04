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

  it("shows an exit button and calls onExit when clicked", async () => {
    const onExit = vi.fn();
    render(<Cracktro analyser={null} style="off" artist="Skaven" title="Lizardking" onExit={onExit} />);

    fireEvent.click(await screen.findByRole("button", { name: "Exit Cracktro" }));

    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
  });

  it("reveals and hides exit chrome with mouse movement", async () => {
    render(<Cracktro analyser={null} style="off" artist="Skaven" title="Lizardking" onExit={() => undefined} />);

    const exitButton = await screen.findByRole("button", { name: "Exit Cracktro" });
    expect(exitButton.className).toContain("opacity-0");

    fireEvent.mouseMove(window);
    await waitFor(() => expect(exitButton.className).toContain("opacity-100"));
  });

  it("renders oneliner BBCode song/artist links and flags", async () => {
    localStorage.setItem(
      "cracktro-panels-on",
      JSON.stringify({ oneliner: true, online: false, queue: false, history: false }),
    );
    render(
      <Cracktro
        analyser={null}
        style="off"
        artist="Skaven"
        title="Lizardking"
        onExit={() => undefined}
        oneliners={[
          {
            username: "axis",
            time: "12:34:56",
            flag: "fi",
            text: "[song]123[/song] by [artist]55[/artist] [flag]se[/flag]",
          },
        ]}
      />,
    );

    const songLink = await screen.findByRole("link", { name: "song #123" });
    expect(songLink).toHaveAttribute("href", "https://scenestream.net/demovibes/song/123/");
    const artistLink = screen.getByRole("link", { name: "artist #55" });
    expect(artistLink).toHaveAttribute("href", "https://scenestream.net/demovibes/artist/55/");
    expect(screen.getByAltText("FI")).toBeInTheDocument();
    expect(screen.getByAltText("SE")).toBeInTheDocument();
  });

  it("shows persisted scene era badge when scene eras are enabled", async () => {
    localStorage.setItem("cracktro-scene-eras", "1");
    localStorage.setItem("cracktro-scene-era-listen-ms", String(200 * 60_000));

    render(<Cracktro analyser={null} style="off" artist="Skaven" title="Lizardking" onExit={() => undefined} />);

    expect(await screen.findByLabelText("Scene Era: Veteran")).toBeInTheDocument();
  });

  it("allows toggling FPS counter from settings and persists it", async () => {
    render(<Cracktro analyser={null} style="off" artist="Skaven" title="Lizardking" onExit={() => undefined} />);

    fireEvent.mouseMove(window);
    fireEvent.click(await screen.findByRole("button", { name: "Expand settings" }));
    const fpsToggle = await screen.findByRole("button", { name: "Toggle FPS counter" });
    expect(fpsToggle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(fpsToggle);
    await waitFor(() => expect(fpsToggle).toHaveAttribute("aria-pressed", "true"));
    await waitFor(() => expect(localStorage.getItem("cracktro-fps-counter")).toBe("1"));
  });
});
