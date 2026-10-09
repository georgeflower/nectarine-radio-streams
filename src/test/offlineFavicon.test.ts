import { afterEach, describe, expect, it } from "vitest";
import { createFaviconSwap, grayscalePixels } from "../lib/offlineFavicon";

describe("offline favicon", () => {
  afterEach(() => { document.head.replaceChildren(); });

  it("converts red to luminance and preserves alpha, including transparency", () => {
    const pixels = new Uint8ClampedArray([255, 0, 0, 255, 12, 80, 160, 0]);
    grayscalePixels(pixels);
    expect(Array.from(pixels.slice(0, 4))).toEqual([76, 76, 76, 255]);
    expect(pixels[4]).toBe(pixels[5]);
    expect(pixels[5]).toBe(pixels[6]);
    expect(pixels[7]).toBe(0);
  });

  it("detaches icons idempotently and restores their references in order", () => {
    document.head.innerHTML = '<link rel="icon" href="/favicon.ico?v=1" sizes="any"><link rel="icon" href="/192.png" sizes="192x192"><link rel="icon" href="/512.png" sizes="512x512"><link rel="apple-touch-icon" href="/apple.png">';
    const originals = Array.from(document.head.querySelectorAll('link[rel~="icon"]'));
    const apple = document.head.querySelector('link[rel="apple-touch-icon"]');
    const swap = createFaviconSwap(document.head);
    swap.restore();
    swap.goGray("data:image/png;base64,gray");
    swap.goGray("data:image/png;base64,gray");
    const icons = document.head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]');
    expect(icons).toHaveLength(1);
    expect(icons[0].href).toMatch(/^data:/);
    expect(icons[0].hasAttribute("data-offline-favicon")).toBe(true);
    expect(document.head.querySelector('link[rel="apple-touch-icon"]')).toBe(apple);
    expect(apple?.getAttribute("href")).toBe("/apple.png");
    swap.restore();
    swap.restore();
    const restored = Array.from(document.head.querySelectorAll('link[rel~="icon"]'));
    expect(restored).toHaveLength(3);
    restored.forEach((link, i) => expect(link).toBe(originals[i]));
    expect(document.head.querySelector("[data-offline-favicon]")).toBeNull();
  });
});