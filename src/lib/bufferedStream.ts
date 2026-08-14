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
  /** Called right before an internal seek to the live edge after a reconnect. */
  onLiveSeek?: () => void;
};

export type BufferedStreamHandle = {
  cleanup: () => void;
};

const DEFAULT_TARGET_BUFFER_SEC = 30;
const RESUME_RATIO = 0.7;
const FETCH_RETRY_DELAY_MS = 1500;
const KEEP_BEHIND_SEC = 20;
const TRIM_MIN_GAP_MS = 10_000;


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
  let lastTrimAt = 0;
  let skipToLiveOnNextAppend = false;

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

  /** Trim old data. When paused, currentTime is frozen so trim against buffered end. */
  const maybeTrim = (force = false) => {
    if (!sourceBuffer || sourceBuffer.updating) return;
    if (pendingChunks.length > 0) return;
    const now = Date.now();
    if (!force && now - lastTrimAt < TRIM_MIN_GAP_MS) return;
    try {
      const b = sourceBuffer.buffered;
      if (b.length === 0) return;
      const start = b.start(0);
      let removeEnd: number | null = null;
      if (audio.paused) {
        const end = b.end(b.length - 1);
        const target = end - KEEP_BEHIND_SEC * 2;
        if (target > start) removeEnd = target;
      } else if (audio.currentTime - start > KEEP_BEHIND_SEC * 2) {
        removeEnd = audio.currentTime - KEEP_BEHIND_SEC;
      }
      if (removeEnd !== null && removeEnd > start) {
        lastTrimAt = now;
        sourceBuffer.remove(start, removeEnd);
      }
    } catch {
      // ignore
    }
  };

  const pumpAppend = () => {
    if (cancelled || !sourceBuffer || appending) return;
    if (sourceBuffer.updating) return;
    if (pendingChunks.length === 0) return;
    if (mediaSource.readyState !== "open") return;
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
        return;
      }
      console.warn("[bufferedStream] appendBuffer failed", err);
      if (mediaSource.readyState === "open") {
        pendingChunks.unshift(chunk);
        window.setTimeout(pumpAppend, 250);
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
            if (skipToLiveOnNextAppend && sourceBuffer) {
              skipToLiveOnNextAppend = false;
              try {
                const b = sourceBuffer.buffered;
                if (b.length > 0) {
                  const end = b.end(b.length - 1);
                  if (end - audio.currentTime > 12) {
                    opts.onLiveSeek?.();
                    audio.currentTime = end - 3;
                  }
                }
              } catch {
                // ignore
              }
            }
            maybeTrim();
            pumpAppend();
          });
        }

        const reader = response.body.getReader();
        while (!cancelled) {
          // Back-pressure: wait if buffered ahead exceeds target.
          // While paused, currentTime is frozen — keep reading so Icecast does
          // not drop us as a slow client; memory is bounded by maybeTrim().
          if (!audio.paused && computeBufferedAhead() >= targetBufferSec) {
            await new Promise<void>((resolve) => {
              const check = () => {
                if (cancelled || audio.paused || computeBufferedAhead() < resumeBelow) {
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
        skipToLiveOnNextAppend = true;
        await new Promise((r) => window.setTimeout(r, FETCH_RETRY_DELAY_MS));
        if (cancelled) return;
        continue;
      }
      // Stream ended naturally — retry to keep live stream going
      if (!cancelled) {
        skipToLiveOnNextAppend = true;
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
