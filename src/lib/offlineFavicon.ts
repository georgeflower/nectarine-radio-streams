/** Convert RGB in place, preserving each pixel's alpha. */
export function grayscalePixels(pixels: Uint8ClampedArray): Uint8ClampedArray {
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const luminance = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    pixels[i] = pixels[i + 1] = pixels[i + 2] = luminance;
  }
  return pixels;
}

export function createFaviconSwap(head: HTMLHeadElement) {
  let originals: HTMLLinkElement[] = [];
  let replacement: HTMLLinkElement | undefined;
  return {
    goGray(dataUrl: string) {
      if (replacement) return;
      originals = Array.from(head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));
      if (!originals.length) return;
      replacement = head.ownerDocument.createElement("link");
      replacement.rel = "icon";
      replacement.type = "image/png";
      replacement.setAttribute("data-offline-favicon", "");
      replacement.href = dataUrl;
      originals.forEach((link) => link.remove());
      head.append(replacement);
    },
    restore() {
      if (!replacement) return;
      replacement.remove();
      originals.forEach((link) => head.append(link));
      replacement = undefined;
      originals = [];
    },
  };
}

export function initOfflineFavicon(): () => void {
  try {
    const swap = createFaviconSwap(document.head);
    let disposed = false;
    let gray: string | undefined;
    let offline = navigator.onLine === false;
    let inFlight = false;
    let interval: ReturnType<typeof setInterval> | undefined;
    let idle: number | undefined;
    let deferred: ReturnType<typeof setTimeout> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let image: HTMLImageElement | undefined;

    const markOffline = () => {
      offline = true;
      if (!disposed && gray) swap.goGray(gray);
    };
    const probe = async (): Promise<boolean> => {
      controller = new AbortController();
      const current = controller;
      timeout = setTimeout(() => current.abort(), 8_000);
      try {
        await fetch(new URL(`/site.webmanifest?probe=${Date.now()}`, window.location.origin).href, {
          method: "GET", cache: "no-store", signal: current.signal,
        });
        return true; // All HTTP statuses prove reachability.
      } catch {
        return false;
      } finally {
        clearTimeout(timeout);
        controller = undefined;
      }
    };
    const check = async () => {
      if (disposed || !gray || inFlight) return;
      if (navigator.onLine === false) { markOffline(); return; }
      inFlight = true;
      const success = await probe();
      if (disposed) { inFlight = false; return; }
      if (navigator.onLine === false) {
        markOffline();
        inFlight = false;
      } else if (success) {
        offline = false;
        swap.restore();
        inFlight = false;
      } else {
        retry = setTimeout(() => {
          retry = undefined;
          void (async () => {
            if (disposed || navigator.onLine === false) {
              if (!disposed) markOffline();
              inFlight = false;
              return;
            }
            const recovered = await probe();
            if (!disposed) {
              if (recovered && navigator.onLine !== false) {
                offline = false;
                swap.restore();
              } else markOffline();
            }
            inFlight = false;
          })();
        }, 3_000);
      }
    };
    const onOnline = () => { void check(); };
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    const build = () => {
      if (disposed) return;
      try {
        const source = document.head.querySelector<HTMLLinkElement>('link[rel~="icon"][sizes="192x192"]')
          ?? document.head.querySelector<HTMLLinkElement>('link[rel~="icon"]');
        if (!source) return;
        image = new Image();
        image.onload = () => {
          if (disposed || !image) return;
          try {
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 128;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            ctx.drawImage(image, 0, 0, 128, 128);
            const pixels = ctx.getImageData(0, 0, 128, 128);
            grayscalePixels(pixels.data);
            ctx.putImageData(pixels, 0, 0);
            gray = canvas.toDataURL("image/png");
            if (offline || navigator.onLine === false) markOffline();
            void check();
            interval = setInterval(() => { void check(); }, 60_000);
          } catch { /* Unsupported canvas or image: stay inert. */ }
        };
        image.onerror = () => { /* Stay inert if the source cannot load. */ };
        image.src = source.href;
      } catch { /* Stay inert. */ }
    };
    window.addEventListener("offline", markOffline);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(build);
    else deferred = setTimeout(build, 2_000);

    return () => {
      disposed = true;
      window.removeEventListener("offline", markOffline);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
      clearTimeout(deferred);
      clearTimeout(retry);
      clearTimeout(timeout);
      if (idle !== undefined && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle);
      controller?.abort();
      if (image) { image.onload = null; image.onerror = null; }
      swap.restore();
    };
  } catch {
    return () => {};
  }
}