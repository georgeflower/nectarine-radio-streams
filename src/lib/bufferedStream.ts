/**
 * MSE-based buffered audio streaming.
 *
 * Uses MediaSource Extensions to fetch a live audio stream and append
 * it to a SourceBuffer ahead of the playhead, allowing a much larger
 * pre-buffer than the browser's default ~2s live policy.
 */

export type AttachOptions = {
  targetBufferSec?: number;
  /** Hint for the SourceBuffer MIME, otherwise sniffed from Content-Type. */
  mimeHint?: string;
};

export type BufferedStreamHandle = {
  cleanup: () => void;
};

const DEFAULT_TARGET_BUFFER_SEC = 30;
const RESUME_RATIO = 0.7;
const FETCH_RETRY_DELAY_MS = 1500;

const pickMime = (contentType: string | null, hint?: string): string | null => {
  const candidates: string[] = [];
  if (hint) candidates.push(hint);
  if (contentType) {
    const ct = contentType.toLowerCase();
    if (ct.includes("mpeg")) candidates.push("audio/mpeg");
    if (ct.includes("aac")) candidates.push('audio/aac', 'audio/mp4; codecs="mp4a.40.2"');
    if (ct.includes("mp4")) candidates.push('audio/mp4; codecs="mp4a.40.2"');
  }
  // Fallback default — most Shoutcast/Icecast streams are MP3
  candidates.push("audio/mpeg");
  for (const c of candidates) {
    try {
      if (MediaSource.isTypeSupported(c)) return c;
    } catch {
      // ignore
    }
  }
  return null;
};

export const isMseAudioSupported = (): boolean => {
  if (typeof window === "undefined") return false;
  if (!("MediaSource" in window)) return false;
  try {
    return MediaSource.isTypeSupported("audio/mpeg");
  } catch {
    return false;
  }
};

export const attachBufferedStream = (
  audio: HTMLAudioElement,
  url: string,
  opts: AttachOptions = {},
): BufferedStreamHandle => {
  const targetBufferSec = opts.targetBufferSec ?? DEFAULT_TARGET_BUFFER_SEC;
  const resumeBelow = targetBufferSec * RESUME_RATIO;

  const mediaSource = new MediaSource();
  const objectUrl = URL.createObjectURL(mediaSource);
  audio.src = objectUrl;

  let cancelled = false;
  let abortController: AbortController | null = null;
  let sourceBuffer: SourceBuffer | null = null;
  const pendingChunks: Uint8Array[] = [];
  let appending = false;

  const computeBufferedAhead = (): number => {
    if (!sourceBuffer) return 0;
    try {
      const b = sourceBuffer.buffered;
      if (b.length === 0) return 0;
      const end = b.end(b.length - 1);
      return Math.max(0, end - audio.currentTime);
    } catch {
      return 0;
    }
  };

  const pumpAppend = () => {
    if (cancelled || !sourceBuffer || appending) return;
    if (sourceBuffer.updating) return;
    if (pendingChunks.length === 0) return;
    const chunk = pendingChunks.shift()!;
    appending = true;
    try {
      sourceBuffer.appendBuffer(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer);
    } catch (err) {
      appending = false;
      // QuotaExceededError: drop the oldest buffered range and retry next tick
      if ((err as DOMException)?.name === "QuotaExceededError") {
        try {
          const b = sourceBuffer.buffered;
          if (b.length > 0) {
            const removeEnd = Math.max(b.start(0) + 5, audio.currentTime - 5);
            if (removeEnd > b.start(0)) {
              sourceBuffer.remove(b.start(0), removeEnd);
            }
          }
        } catch {
          // ignore
        }
        // requeue the chunk
        pendingChunks.unshift(chunk);
      }
    }
  };

  const startFetchLoop = async () => {
    while (!cancelled) {
      abortController = new AbortController();
      try {
        const response = await fetch(url, { signal: abortController.signal, cache: "no-store" });
        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status}`);
        }
        const contentType = response.headers.get("content-type");
        const mime = pickMime(contentType, opts.mimeHint);

        // Initialize SourceBuffer once we know the MIME (only on first successful response)
        if (!sourceBuffer) {
          if (!mime) throw new Error("No supported MIME for stream");
          if (mediaSource.readyState !== "open") {
            await new Promise<void>((resolve) => {
              const onOpen = () => {
                mediaSource.removeEventListener("sourceopen", onOpen);
                resolve();
              };
              mediaSource.addEventListener("sourceopen", onOpen);
            });
          }
          if (cancelled) return;
          sourceBuffer = mediaSource.addSourceBuffer(mime);
          sourceBuffer.mode = "sequence";
          sourceBuffer.addEventListener("updateend", () => {
            appending = false;
            pumpAppend();
          });
        }

        const reader = response.body.getReader();
        while (!cancelled) {
          // Back-pressure: wait if buffered ahead exceeds target
          if (computeBufferedAhead() >= targetBufferSec) {
            await new Promise<void>((resolve) => {
              const check = () => {
                if (cancelled || computeBufferedAhead() < resumeBelow) {
                  resolve();
                } else {
                  window.setTimeout(check, 250);
                }
              };
              check();
            });
            if (cancelled) return;
          }

          const { value, done } = await reader.read();
          if (done) break;
          if (value && value.byteLength > 0) {
            pendingChunks.push(value);
            pumpAppend();
          }
        }
      } catch (err) {
        if (cancelled) return;
        // Network drop — buffer will keep playing; wait and retry silently
        await new Promise((r) => window.setTimeout(r, FETCH_RETRY_DELAY_MS));
        if (cancelled) return;
        continue;
      }
      // Stream ended naturally — retry to keep live stream going
      if (!cancelled) {
        await new Promise((r) => window.setTimeout(r, 500));
      }
    }
  };

  void startFetchLoop();

  const cleanup = () => {
    if (cancelled) return;
    cancelled = true;
    try {
      abortController?.abort();
    } catch {
      // ignore
    }
    try {
      if (sourceBuffer && !sourceBuffer.updating && mediaSource.readyState === "open") {
        mediaSource.endOfStream();
      }
    } catch {
      // ignore
    }
    try {
      URL.revokeObjectURL(objectUrl);
    } catch {
      // ignore
    }
  };

  return { cleanup };
};
