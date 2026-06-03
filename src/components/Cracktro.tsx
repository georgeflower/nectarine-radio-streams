import { useEffect, useMemo, useRef, useState } from "react";
import Visualizer, { type VisualizerStyle } from "./Visualizer";
import BeatOverlay from "./BeatOverlay";
import FloatingWindow from "./FloatingWindow";
import FlyingGoose from "./FlyingGoose";
import BoingBall from "./BoingBall";
import { getCachedInfo, requestInfo, subscribe as subscribeEntities } from "@/lib/entityCache";
import type { OnelinerEntry, QueueEntry } from "@/lib/nectarine";
import { renderWithSmileys } from "@/lib/smileys";

type OnlineUser = { name: string; flag: string };

type Props = {
  analyser: AnalyserNode | null;
  style: VisualizerStyle;
  artist: string;
  title: string;
  songId?: string;
  onExit: () => void;
  onStyleChange?: (s: VisualizerStyle) => void;
  oneliners?: OnelinerEntry[];
  users?: OnlineUser[];
  usersTotal?: number;
  queue?: QueueEntry[];
  history?: QueueEntry[];
};

const VIZ_STYLES: { id: VisualizerStyle; label: string }[] = [
  { id: "starfield", label: "Starfield" },
  { id: "bars", label: "Bars" },
  { id: "plasma", label: "Plasma" },
  { id: "oscilloscope", label: "Scope" },
  { id: "tunnel", label: "Tunnel" },
  { id: "rings", label: "Rings" },
  { id: "particles", label: "Particles" },
];

type ScrollMode =
  | "sinus"
  | "bouncy"
  | "zoomer"
  | "wobble"
  | "copper"
  | "vector";

const MODES: { id: ScrollMode; label: string }[] = [
  { id: "sinus", label: "Sinus" },
  { id: "bouncy", label: "Bouncy" },
  { id: "zoomer", label: "Zoomer" },
  { id: "wobble", label: "Wobble" },
  { id: "copper", label: "Copper" },
  { id: "vector", label: "Vector" },
];

const STORAGE_MODE = "cracktro-scroll-mode";
const STORAGE_ON = "cracktro-scroll-on";
const STORAGE_INFOBAR = "cracktro-infobar-on";

type PanelId = "oneliner" | "online" | "queue" | "history";
const PANELS: { id: PanelId; label: string }[] = [
  { id: "oneliner", label: "Oneliner" },
  { id: "online", label: "Online" },
  { id: "queue", label: "Up Next" },
  { id: "history", label: "Recent" },
];
const STORAGE_PANELS = "cracktro-panels-on";

const Cracktro = ({
  analyser, style, artist, title, songId, onExit, onStyleChange,
  oneliners = [], users = [], usersTotal, queue = [], history = [],
}: Props) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onExitRef = useRef(onExit);
  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);

  const [scrollOn, setScrollOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_ON) !== "0";
    } catch {
      return true;
    }
  });
  const [mode, setMode] = useState<ScrollMode>(() => {
    try {
      const v = localStorage.getItem(STORAGE_MODE) as ScrollMode | null;
      if (v && MODES.some((m) => m.id === v)) return v;
    } catch {
      // ignore
    }
    return "sinus";
  });
  const [infobarOn, setInfobarOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_INFOBAR) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(STORAGE_ON, scrollOn ? "1" : "0"); } catch { /* ignore */ }
  }, [scrollOn]);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_MODE, mode); } catch { /* ignore */ }
  }, [mode]);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_INFOBAR, infobarOn ? "1" : "0"); } catch { /* ignore */ }
  }, [infobarOn]);
  const [panelsOn, setPanelsOn] = useState<Record<PanelId, boolean>>(() => {
    const defaults: Record<PanelId, boolean> = { oneliner: false, online: false, queue: false, history: false };
    try {
      const raw = localStorage.getItem(STORAGE_PANELS);
      if (raw) {
        const v = JSON.parse(raw) as Partial<Record<PanelId, boolean>>;
        return { ...defaults, ...v };
      }
    } catch {
      // ignore
    }
    return defaults;
  });
  useEffect(() => {
    try { localStorage.setItem(STORAGE_PANELS, JSON.stringify(panelsOn)); } catch { /* ignore */ }
  }, [panelsOn]);
  const togglePanel = (id: PanelId) => setPanelsOn((p) => ({ ...p, [id]: !p[id] }));

  // Auto-hide UI (exit + controls) after 5s of no pointer activity.
  const [showControls, setShowControls] = useState(true);
  const hideTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const reveal = () => {
      setShowControls(true);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = window.setTimeout(() => setShowControls(false), 5000);
    };
    reveal();
    window.addEventListener("mousemove", reveal);
    window.addEventListener("touchstart", reveal, { passive: true });
    window.addEventListener("keydown", reveal);
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      window.removeEventListener("mousemove", reveal);
      window.removeEventListener("touchstart", reveal);
      window.removeEventListener("keydown", reveal);
    };
  }, []);

  // Pull song info (platform/rating) from the entity cache.
  const [info, setInfo] = useState(() => (songId ? getCachedInfo("song", songId) : undefined));
  useEffect(() => {
    if (!songId) { setInfo(undefined); return; }
    setInfo(getCachedInfo("song", songId));
    requestInfo("song", songId);
    const unsub = subscribeEntities(() => setInfo(getCachedInfo("song", songId)));
    return unsub;
  }, [songId]);
  const platform = info?.platformName ?? "";
  const rating = typeof info?.rating === "number" ? info.rating : undefined;
  const votes = info?.votes;

  // Request browser fullscreen.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const req = (el as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    }).requestFullscreen ?? (el as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    }).webkitRequestFullscreen;
    let entered = false;
    Promise.resolve(req?.call(el))
      .then(() => { entered = !!document.fullscreenElement; })
      .catch(() => { /* ignore */ });

    const onFsChange = () => {
      if (entered && !document.fullscreenElement) onExitRef.current();
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => undefined);
      }
    };
  }, []);

  // Esc handler.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExitRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const text = useMemo(() => (
    `   NOW SPINNING:  ${(artist || "UNKNOWN ARTIST").toUpperCase()}  ---  ${(title || "UNKNOWN TUNE").toUpperCase()}` +
    `${platform ? `   ON  ${platform.toUpperCase()}` : ""}` +
    `${rating !== undefined ? `   ★ ${rating.toFixed(2)}` : ""}` +
    `   ***   STAY TUNED TO NECTARINE DEMOSCENE RADIO   ***   GREETZ TO ALL THE SCENERS OUT THERE   ***   `
  ), [artist, title, platform, rating]);

  type Skin = "default" | "amiga" | "atari" | "c64" | "xm";
  const autoSkin = useMemo<Skin>(() => {
    const p = (platform || "").toLowerCase();
    if (p.includes("amiga")) return "amiga";
    if (p.includes("atari")) return "atari";
    if (p.includes("c64") || p.includes("commodore 64")) return "c64";
    return "xm";
  }, [platform]);
  const [skinOverride, setSkinOverride] = useState<Skin | "auto">(() => {
    try {
      const v = localStorage.getItem("cracktro-skin-override") as Skin | "auto" | null;
      if (v && ["auto", "default", "amiga", "atari", "c64", "xm"].includes(v)) return v;
    } catch { /* ignore */ }
    return "auto";
  });
  useEffect(() => {
    try { localStorage.setItem("cracktro-skin-override", skinOverride); } catch { /* ignore */ }
  }, [skinOverride]);
  const skin: Skin = skinOverride === "auto" ? autoSkin : skinOverride;

  const [gooseOn, setGooseOn] = useState<boolean>(() => {
    try { return localStorage.getItem("cracktro-goose") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("cracktro-goose", gooseOn ? "1" : "0"); } catch { /* ignore */ }
  }, [gooseOn]);

  const [boingOn, setBoingOn] = useState<boolean>(() => {
    try { return localStorage.getItem("cracktro-boing") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("cracktro-boing", boingOn ? "1" : "0"); } catch { /* ignore */ }
  }, [boingOn]);



  // Scroller canvas — modes: sinus / bouncy / zoomer / wobble / copper / vector.
  useEffect(() => {
    if (!scrollOn) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Tall enough that wave displacement + glyph + shadow blur never clips.
    const CSS_H = 360;

    // Do the initial canvas size synchronously so font metrics and the glyph
    // cache are computed against the correct canvas height.
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(CSS_H * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${CSS_H}px`;

    const fontSize = 64 * dpr;
    const fontStr = skin === "xm"
      ? `${fontSize}px "Press Start 2P","VT323",monospace`
      : `900 ${fontSize}px "Impact","Arial Black","Helvetica Neue",sans-serif`;
    ctx.font = fontStr;
    ctx.textBaseline = "middle";
    const chars = Array.from(text);
    const widths = chars.map((c) => ctx.measureText(c).width + 4 * dpr);
    const totalW = widths.reduce((a, b) => a + b, 0);

    // Opt 6: per-glyph raster cache — pre-render each unique character once onto
    // an offscreen canvas and reuse the bitmap every frame.  This avoids the
    // expensive gradient + hatching compositing that `paintSkinned` did per frame.
    // The xm shimmer uses a static t=0 (no frame-to-frame animation) — the
    // difference is subtle and the savings are significant.
    const glyphCache = new Map<string, HTMLCanvasElement>();

    // Paints one glyph onto a caller-provided, pre-sized offscreen canvas.
    const paintSkinnedToCanvas = (ch: string, cw: number, oc: HTMLCanvasElement, octx2: CanvasRenderingContext2D) => {
      const ow = oc.width;
      const oh = oc.height;
      octx2.clearRect(0, 0, ow, oh);
      const glyphH = fontSize * 0.82;
      const top = oh / 2 - glyphH / 2;

      if (skin === "amiga") {
        const g = octx2.createLinearGradient(0, top, 0, top + glyphH);
        g.addColorStop(0, "#fff3c4");
        g.addColorStop(0.35, "#e6b94a");
        g.addColorStop(0.65, "#8a5a14");
        g.addColorStop(1, "#2a1604");
        octx2.fillStyle = g;
        octx2.fillRect(0, top, ow, glyphH);
        // 45° dark hatching
        octx2.fillStyle = "rgba(30,15,4,0.55)";
        const stripeW = 3 * dpr;
        for (let sx = -oh; sx < ow + oh; sx += stripeW * 2) {
          octx2.beginPath();
          octx2.moveTo(sx, 0);
          octx2.lineTo(sx + oh, oh);
          octx2.lineTo(sx + oh + stripeW, oh);
          octx2.lineTo(sx + stripeW, 0);
          octx2.closePath();
          octx2.fill();
        }
      } else if (skin === "atari" || skin === "c64") {
        const colors = skin === "atari"
          ? ["#d8341c", "#f5c518", "#3aa84a", "#1f5fd6"]
          : ["#c44a3a", "#e8c352", "#5aa86a"];
        const bandH = glyphH / colors.length;
        for (let i = 0; i < colors.length; i++) {
          octx2.fillStyle = colors[i];
          octx2.fillRect(0, top + i * bandH, ow, bandH + 0.5);
        }
      } else if (skin === "xm") {
        const g = octx2.createLinearGradient(0, top, 0, top + glyphH);
        g.addColorStop(0, "#0a1a3a");
        g.addColorStop(0.3, "#2a6acc");
        g.addColorStop(0.55, "#cfe1ff");
        g.addColorStop(0.78, "#2a6acc");
        g.addColorStop(1, "#0a1a3a");
        octx2.fillStyle = g;
        octx2.fillRect(0, top, ow, glyphH);
        // Static shimmer at t=0 (no per-frame animation; acceptable trade-off for caching).
        for (let yy = top; yy < top + glyphH; yy += 2 * dpr) {
          const v = (Math.sin(yy * 0.09) + 1) * 0.5;
          octx2.fillStyle = `rgba(255,255,255,${0.05 + v * 0.18})`;
          octx2.fillRect(0, yy, ow, dpr);
        }
      }

      // Clip the fill to the glyph silhouette.
      octx2.globalCompositeOperation = "destination-in";
      octx2.font = fontStr;
      octx2.textBaseline = "middle";
      octx2.fillStyle = "#fff";
      octx2.fillText(ch, 2 * dpr, oh / 2);
      octx2.globalCompositeOperation = "source-over";
    };

    const buildGlyphCache = () => {
      glyphCache.clear();
      if (skin === "default") return; // default skin draws text directly; no cache needed
      const uniqueChars = [...new Set(chars)];
      for (const ch of uniqueChars) {
        const idx = chars.indexOf(ch);
        const cw = widths[idx];
        const oc = document.createElement("canvas");
        oc.width = Math.max(1, Math.ceil(cw + 8 * dpr));
        oc.height = canvas.height;
        const octx2 = oc.getContext("2d");
        if (octx2) paintSkinnedToCanvas(ch, cw, oc, octx2);
        glyphCache.set(ch, oc);
      }
    };

    // Build initial cache once the canvas has its final dimensions.
    buildGlyphCache();

    // Opt 7 (skinned skins): shadow settings are the same for every glyph
    // within a skin; cache them so the per-frame glyph loop can skip them.
    let skinnedShadowColor = "rgba(0,0,0,0.7)";
    let skinnedShadowBlur = 4 * dpr;
    if (skin === "amiga") { skinnedShadowColor = "rgba(0,0,0,0.85)"; skinnedShadowBlur = 6 * dpr; }
    else if (skin === "xm") { skinnedShadowColor = "rgba(10,20,60,0.9)"; skinnedShadowBlur = 8 * dpr; }

    const resize = () => {
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(CSS_H * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${CSS_H}px`;
      buildGlyphCache(); // Opt 6: glyph canvas height depends on canvas.height
    };
    window.addEventListener("resize", resize);

    let offset = 0;
    let t = 0;
    let raf = 0;
    // Opt 4: delta-time tracking so scroller speed is frame-rate independent.
    let last = 0;

    const drawBackdrop = (w: number, h: number) => {
      if (mode === "copper") {
        // Copper bar gradient bands (Amiga style).
        const bandH = 6 * dpr;
        for (let y = 0; y < h; y += bandH) {
          const phase = (y * 0.02 + t * 1.4);
          const v = (Math.sin(phase) + 1) * 0.5;
          const hue = (y * 0.7 + t * 80) % 360;
          ctx.fillStyle = `hsla(${hue}, 95%, ${20 + v * 35}%, 0.55)`;
          ctx.fillRect(0, y, w, bandH);
        }
      } else {
        ctx.fillStyle = "hsla(20, 25%, 6%, 0.45)";
        ctx.fillRect(0, 0, w, h);
      }
    };

    const tick = (now: number) => {
      // Opt 3: pause scroller loop while the tab is hidden.
      if (document.hidden) {
        last = 0; // reset so dt doesn't spike on resume
        raf = requestAnimationFrame(tick);
        return;
      }

      // Opt 4: compute delta-time so scroll speed is independent of refresh rate.
      // Cap at 50 ms to avoid a large jump after the tab was hidden or frozen.
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;

      ctx.font = fontStr;
      ctx.textBaseline = "middle";
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      drawBackdrop(w, h);

      const cy = h / 2;
      // Keep amplitude well within the canvas so glyphs never clip.
      const amp = Math.min(h * 0.22, 80 * dpr);

      if (w - offset + totalW < 0) offset = 0;

      // Opt 7 (skinned skins): set shadow once before the loop to avoid
      // changing canvas state on every glyph iteration.
      if (skin !== "default") {
        ctx.shadowColor = skinnedShadowColor;
        ctx.shadowBlur = skinnedShadowBlur;
      }

      let x = w - offset;
      for (let i = 0; i < chars.length; i++) {
        const cw = widths[i];
        if (x + cw < 0) { x += cw; continue; }
        if (x > w) break;

        // Per-mode glyph transform.
        let y = cy;
        let scale = 1;
        let rotation = 0;
        let skewY = 0;

        switch (mode) {
          case "sinus": {
            const phase = x * 0.006 - t * 2.2;
            y = cy + Math.sin(phase) * amp;
            break;
          }
          case "bouncy": {
            // Each glyph bobs in lockstep cascade (classic intro look).
            const phase = i * 0.45 - t * 4.5;
            y = cy + Math.abs(Math.sin(phase)) * -amp + amp * 0.4;
            break;
          }
          case "zoomer": {
            const phase = x * 0.004 - t * 2.0;
            y = cy + Math.sin(phase) * (amp * 0.45);
            scale = 1 + Math.sin(phase * 1.3) * 0.35;
            break;
          }
          case "wobble": {
            // Two-frequency interference wave.
            const a = Math.sin(x * 0.005 - t * 2.4);
            const b = Math.sin(x * 0.013 + t * 1.1);
            y = cy + (a * 0.6 + b * 0.4) * amp;
            rotation = (a - b) * 0.18;
            break;
          }
          case "copper": {
            const phase = x * 0.007 - t * 2.6;
            y = cy + Math.sin(phase) * amp * 0.55;
            break;
          }
          case "vector": {
            // Atari-style vector tilt — sheared italic skew + gentle bob.
            const phase = x * 0.005 - t * 1.8;
            y = cy + Math.sin(phase) * amp * 0.5;
            skewY = Math.sin(phase * 0.7) * 0.35;
            scale = 0.95 + Math.cos(phase) * 0.15;
            break;
          }
        }

        ctx.save();
        ctx.translate(x + cw / 2, y);
        if (rotation) ctx.rotate(rotation);
        if (skewY) ctx.transform(1, skewY, -0.25, 1, 0, 0);
        if (scale !== 1) ctx.scale(scale, scale);

        if (skin === "default") {
          const hue = (x * 0.4 + t * 60) % 360;
          ctx.shadowColor = `hsl(${hue}, 100%, 55%)`;
          ctx.shadowBlur = 18 * dpr;
          ctx.fillStyle = `hsl(${hue}, 100%, 68%)`;
          ctx.fillText(chars[i], -cw / 2 + 2 * dpr, 0);
          ctx.shadowBlur = 0;
          ctx.fillStyle = `hsl(${(hue + 30) % 360}, 100%, 88%)`;
          ctx.fillText(chars[i], -cw / 2 + 2 * dpr, -2 * dpr);
        } else {
          // Opt 6: draw from pre-rendered glyph cache instead of repainting.
          const gc = glyphCache.get(chars[i]);
          if (gc) ctx.drawImage(gc, -cw / 2, -gc.height / 2);
          ctx.shadowBlur = 0;
        }
        ctx.restore();

        x += cw;
      }

      // Opt 4: advance scroller position and wave phase using delta-time so
      // speed is consistent across 30 fps, 60 fps, 120 fps, and 144 fps.
      // Equivalent rates at 60 fps: offset += 3*dpr/frame → 180*dpr px/s;
      //                             t += 0.05/frame → 3 rad/s.
      offset += 180 * dpr * dt;
      t += 3 * dt;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [text, mode, scrollOn, skin]);


  const scrollerBottomOffset = 40; // px, leaves room for the controls bar

  return (
    <div
      ref={wrapRef}
      className="fixed inset-0 z-[9999] bg-background overflow-hidden"
    >
      <Visualizer analyser={analyser} style={style === "off" ? "tunnel" : style} />
      <BeatOverlay analyser={analyser} enabled />
      {gooseOn && <FlyingGoose oneliners={oneliners} />}
      {boingOn && <BoingBall />}

      {/* Scroller canvas — vertically centered, taller box so glyphs never clip. */}
      {scrollOn && (
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="absolute left-0 right-0 pointer-events-none"
          style={{ top: "50%", transform: "translateY(-50%)", zIndex: 5 }}
        />
      )}

      {/* Info bar: big now-playing strip pinned to the bottom. Independent of scroller. */}
      {infobarOn && (
        <div
          className="absolute left-0 right-0 pointer-events-none"
          style={{
            bottom: scrollerBottomOffset,
            zIndex: 5,
            background: "linear-gradient(to top, hsla(20,25%,4%,0.85), hsla(20,25%,4%,0))",
            paddingTop: "1.5rem",
            paddingBottom: "1.5rem",
          }}
        >
          <div className="mx-auto max-w-6xl px-6 text-center">
            <p
              key={title || "unknown"}
              className="neon font-extrabold uppercase leading-tight tracking-wider"
              style={{ fontSize: "clamp(2rem, 5.5vw, 5rem)" }}
            >
              {(title || "Unknown Tune").split("").map((ch, i) =>
                ch === " " ? (
                  <span key={i}>&nbsp;</span>
                ) : (
                  <span key={i} data-goose-letter={ch} className="inline-block">{ch}</span>
                )
              )}
            </p>
            <p
              className="neon-accent font-bold uppercase tracking-widest mt-2"
              style={{ fontSize: "clamp(1.25rem, 3vw, 2.5rem)" }}
            >
              by {artist || "Unknown Artist"}
            </p>
            {(platform || rating !== undefined) && (
              <p
                className="text-foreground uppercase tracking-[0.3em] mt-3"
                style={{ fontSize: "clamp(0.95rem, 1.8vw, 1.5rem)" }}
              >
                {platform && <span>{platform}</span>}
                {platform && rating !== undefined && <span className="mx-3 opacity-50">·</span>}
                {rating !== undefined && (
                  <span>★ {rating.toFixed(2)}{votes ? ` (${votes})` : ""}</span>
                )}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Floating side panels — independently toggleable & draggable. */}
      {panelsOn.oneliner && (
        <FloatingWindow
          id="oneliner"
          title="Oneliner"
          defaultX={16}
          defaultY={80}
          defaultW={320}
          onClose={() => togglePanel("oneliner")}
        >
          {oneliners.length === 0 ? (
            <p className="text-muted-foreground">No messages.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {oneliners.slice(0, 30).map((o, i) => (
                <li key={i} className="leading-snug break-words">
                  <span className="text-muted-foreground text-[10px] mr-1">{o.time}</span>
                  <span className="font-semibold text-primary">{o.username}</span>
                  <span className="text-muted-foreground">: </span>
                  <span>{renderWithSmileys(o.text)}</span>
                </li>
              ))}
            </ul>
          )}
        </FloatingWindow>
      )}

      {panelsOn.online && (
        <FloatingWindow
          id="online"
          title={`Online${typeof usersTotal === "number" ? ` (${usersTotal})` : ""}`}
          defaultX={16}
          defaultY={Math.max(80, (typeof window !== "undefined" ? window.innerHeight : 800) - 340)}
          defaultW={260}
          onClose={() => togglePanel("online")}
        >
          {users.length === 0 ? (
            <p className="text-muted-foreground">No users online.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {users.map((u, i) => (
                <li key={i} className="flex items-center gap-2">
                  {u.flag && <span className="text-[10px] uppercase text-muted-foreground">{u.flag}</span>}
                  <span className="truncate">{u.name}</span>
                </li>
              ))}
            </ul>
          )}
        </FloatingWindow>
      )}

      {panelsOn.queue && (
        <FloatingWindow
          id="queue"
          title="Up Next"
          defaultX={Math.max(16, (typeof window !== "undefined" ? window.innerWidth : 1200) - 336)}
          defaultY={80}
          defaultW={320}
          onClose={() => togglePanel("queue")}
        >
          {queue.length === 0 ? (
            <p className="text-muted-foreground">Queue is empty.</p>
          ) : (
            <ol className="flex flex-col gap-1.5 list-decimal pl-5">
              {queue.map((q, i) => (
                <li key={i} className="leading-snug break-words">
                  <span className="font-semibold">{q.song}</span>
                  <span className="text-muted-foreground"> — {q.artist}</span>
                  {q.requester && (
                    <span className="text-muted-foreground text-[10px]"> · {q.requester}</span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </FloatingWindow>
      )}

      {panelsOn.history && (
        <FloatingWindow
          id="history"
          title="Recently Played"
          defaultX={Math.max(16, (typeof window !== "undefined" ? window.innerWidth : 1200) - 336)}
          defaultY={Math.max(80, (typeof window !== "undefined" ? window.innerHeight : 800) - 340)}
          defaultW={320}
          onClose={() => togglePanel("history")}
        >
          {history.length === 0 ? (
            <p className="text-muted-foreground">No history yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {history.map((h, i) => (
                <li key={i} className="leading-snug break-words">
                  <span className="font-semibold">{h.song}</span>
                  <span className="text-muted-foreground"> — {h.artist}</span>
                </li>
              ))}
            </ul>
          )}
        </FloatingWindow>
      )}


      {/* Top-right exit — auto-hides with the controls. */}
      <button
        type="button"
        onClick={onExit}
        className={`absolute top-4 right-4 min-h-11 px-3 py-2 text-xs uppercase tracking-widest rounded-sm border border-border bg-card/80 text-foreground hover:bg-card hover:opacity-90 touch-manipulation transition-opacity duration-500 ${
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        style={{ zIndex: 10 }}
        aria-label="Exit fullscreen cracktro"
      >
        Exit ✕
      </button>

      {/* Bottom controls bar — scroller toggle + scroller mode + visualizer effect.
          Hides after 5s of inactivity; reappears on mousemove/touch/keypress. */}
      <div
        className={`absolute left-0 right-0 bottom-0 flex flex-col gap-1.5 px-3 py-2 bg-card/70 border-t border-border backdrop-blur-sm transition-opacity duration-500 ${
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        style={{ zIndex: 11 }}
      >
        {/* Row 1: scroller controls */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mr-1">Scroller</span>
          <button
            type="button"
            onClick={() => setScrollOn((v) => !v)}
            className="min-h-9 px-3 py-1 text-[10px] uppercase tracking-widest rounded-sm border border-border bg-background/60 text-foreground hover:bg-background"
            aria-pressed={scrollOn}
          >
            {scrollOn ? "ON" : "OFF"}
          </button>
          <div className="flex flex-wrap items-center gap-1">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => { setMode(m.id); if (!scrollOn) setScrollOn(true); }}
                disabled={!scrollOn}
                className={`min-h-9 px-2 py-1 text-[10px] uppercase tracking-widest rounded-sm border ${
                  mode === m.id
                    ? "border-primary bg-primary/20 text-foreground"
                    : "border-border bg-background/60 text-muted-foreground hover:text-foreground"
                } ${!scrollOn ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground ml-2 mr-1">Font</span>
          <select
            value={skinOverride}
            onChange={(e) => setSkinOverride(e.target.value as Skin | "auto")}
            className="min-h-9 px-2 py-1 text-[10px] uppercase tracking-widest rounded-sm border border-border bg-background/60 text-foreground hover:bg-background"
          >
            <option value="auto">Auto ({autoSkin})</option>
            <option value="xm">XM</option>
            <option value="amiga">Amiga</option>
            <option value="atari">Atari</option>
            <option value="c64">C64</option>
            <option value="default">Default</option>
          </select>

          <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground ml-2 mr-1">Info Bar</span>
          <button
            type="button"
            onClick={() => setInfobarOn((v) => !v)}
            className={`min-h-9 px-3 py-1 text-[10px] uppercase tracking-widest rounded-sm border ${
              infobarOn
                ? "border-primary bg-primary/20 text-foreground"
                : "border-border bg-background/60 text-muted-foreground hover:text-foreground"
            }`}
            aria-pressed={infobarOn}
          >
            {infobarOn ? "ON" : "OFF"}
          </button>

          <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground ml-2 mr-1">Goose</span>
          <button
            type="button"
            onClick={() => setGooseOn((v) => !v)}
            className={`min-h-9 px-3 py-1 text-[10px] uppercase tracking-widest rounded-sm border ${
              gooseOn
                ? "border-primary bg-primary/20 text-foreground"
                : "border-border bg-background/60 text-muted-foreground hover:text-foreground"
            }`}
            aria-pressed={gooseOn}
            title="Toggle flying goose"
          >
            {gooseOn ? "ON" : "OFF"}
          </button>

          <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground ml-2 mr-1">Boing</span>
          <button
            type="button"
            onClick={() => setBoingOn((v) => !v)}
            className={`min-h-9 px-3 py-1 text-[10px] uppercase tracking-widest rounded-sm border ${
              boingOn
                ? "border-primary bg-primary/20 text-foreground"
                : "border-border bg-background/60 text-muted-foreground hover:text-foreground"
            }`}
            aria-pressed={boingOn}
            title="Toggle Amiga boing ball"
          >
            {boingOn ? "ON" : "OFF"}
          </button>
        </div>

        {/* Row: floating panel toggles */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mr-1">Panels</span>
          <div className="flex flex-wrap items-center gap-1">
            {PANELS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => togglePanel(p.id)}
                className={`min-h-9 px-2 py-1 text-[10px] uppercase tracking-widest rounded-sm border ${
                  panelsOn[p.id]
                    ? "border-primary bg-primary/20 text-foreground"
                    : "border-border bg-background/60 text-muted-foreground hover:text-foreground"
                }`}
                aria-pressed={panelsOn[p.id]}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: visualizer effect picker */}
        {onStyleChange && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mr-1">Effect</span>
            <div className="flex flex-wrap items-center gap-1">
              {VIZ_STYLES.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onStyleChange(v.id)}
                  className={`min-h-9 px-2 py-1 text-[10px] uppercase tracking-widest rounded-sm border ${
                    style === v.id
                      ? "border-primary bg-primary/20 text-foreground"
                      : "border-border bg-background/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground ml-2">
              ESC to exit
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default Cracktro;
