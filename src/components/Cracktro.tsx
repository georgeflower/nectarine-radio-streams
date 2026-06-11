import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Visualizer, { type VisualizerStyle } from "./Visualizer";
import BeatOverlay from "./BeatOverlay";
import FloatingWindow from "./FloatingWindow";
import FlyingGoose from "./FlyingGoose";
import GooseFamily from "./GooseFamily";
import GooseDebugOverlay from "./GooseDebugOverlay";
import BoingBall from "./BoingBall";
import ChangelogModal, { APP_VERSION } from "./ChangelogModal";

import RosterWindow from "./RosterWindow";
import { getCachedInfo, requestInfo, subscribe as subscribeEntities } from "@/lib/entityCache";
import { formatOnelinerTime, type OnelinerEntry, QueueEntry, userUrl, formatDuration, computeTimeLeft } from "@/lib/nectarine";
import { StageProvider } from "@/lib/stage";
import { renderBBCode } from "@/lib/bbcode";
import { getSceneEraConfig, getSceneEraFromListeningMs } from "@/lib/gooseSceneEra";
import { sayFromAnyGoose, setGoosePerformanceState, setGooseSceneEra, setProcreationEnabled } from "@/lib/gooseSocial";
import { pickRatingLine } from "@/lib/gooseSongChatter";
import {
  formatMmSs,
  getMourningActive,
  getPlayerTime,
  getWindowSize,
  setWindowSize,
  subscribeMourning,
  subscribePlayerTime,
  type WindowSize,
} from "@/lib/cracktroUi";
import { clearRoster } from "@/lib/gooseFamilyRoster";
import Flag from "./Flag";

type OnlineUser = { name: string; flag: string };

type Props = {
  analyser: AnalyserNode | null;
  style: VisualizerStyle;
  artist: string;
  title: string;
  songId?: string;
  nowPlaying?: QueueEntry | null;
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

type ScrollMode = "sinus" | "bouncy" | "zoomer" | "wobble" | "copper" | "vector";

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
const STORAGE_FPS_COUNTER = "cracktro-fps-counter";
const STORAGE_SCENE_ERAS = "cracktro-scene-eras";
const STORAGE_SCENE_ERA_LISTEN_MS = "cracktro-scene-era-listen-ms";
const MAX_FRAME_TIME_MS = 100;
const FPS_EMA_ALPHA = 0.1;
const LOW_FPS_THRESHOLD = 28;
const LOW_FPS_SUSTAINED_MS = 12_000;
const FPS_HUD_UPDATE_INTERVAL_MS = 250;

type PanelId = "oneliner" | "online" | "queue" | "history" | "roster";
const PANELS: { id: PanelId; label: string }[] = [
  { id: "oneliner", label: "Oneliner" },
  { id: "online", label: "Online" },
  { id: "queue", label: "Up Next" },
  { id: "history", label: "Recent" },
  { id: "roster", label: "Geese" },
];
const STORAGE_PANELS = "cracktro-panels-on";

const Cracktro = ({
  analyser,
  style,
  artist,
  title,
  songId,
  nowPlaying,
  onExit,
  onStyleChange,
  oneliners = [],
  users = [],
  usersTotal,
  queue = [],
  history = [],
}: Props) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const setWrap = useCallback((el: HTMLDivElement | null) => {
    wrapRef.current = el;
    setStageEl(el);
  }, []);
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
    return "copper";
  });
  const [infobarOn, setInfobarOn] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(STORAGE_INFOBAR);
      return v === null ? true : v === "1";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_ON, scrollOn ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [scrollOn]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_MODE, mode);
    } catch {
      /* ignore */
    }
  }, [mode]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_INFOBAR, infobarOn ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [infobarOn]);
  const [fpsCounterOn, setFpsCounterOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_FPS_COUNTER) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(STORAGE_FPS_COUNTER, fpsCounterOn ? "1" : "0"); } catch { /* ignore */ }
  }, [fpsCounterOn]);
  const [fps, setFps] = useState<number | null>(null);
  const [lowFpsDetected, setLowFpsDetected] = useState(false);
  const [panelsOn, setPanelsOn] = useState<Record<PanelId, boolean>>(() => {
    const defaults: Record<PanelId, boolean> = { oneliner: false, online: false, queue: true, history: false, roster: false };
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
    try {
      localStorage.setItem(STORAGE_PANELS, JSON.stringify(panelsOn));
    } catch {
      /* ignore */
    }
  }, [panelsOn]);
  const togglePanel = (id: PanelId) => setPanelsOn((p) => ({ ...p, [id]: !p[id] }));

  // Auto-hide hint chrome after inactivity. Settings stay collapsed until
  // explicitly expanded.
  const [showHintChrome, setShowHintChrome] = useState(false);
  const [settingsExpanded, setSettingsExpanded] = useState(false);

  // Tutorial hints — show once per browser until dismissed.
  const TUTORIAL_BALL_KEY = "cracktro:tutorial:ballHint:v1";
  const TUTORIAL_SETTINGS_KEY = "cracktro:tutorial:settingsHint:v1";
  const [showBallHint, setShowBallHint] = useState(() => {
    try { return localStorage.getItem(TUTORIAL_BALL_KEY) !== "1"; } catch { return true; }
  });
  const [showSettingsHint, setShowSettingsHint] = useState(() => {
    try { return localStorage.getItem(TUTORIAL_SETTINGS_KEY) !== "1"; } catch { return true; }
  });
  const dismissBallHint = useCallback(() => {
    setShowBallHint(false);
    try { localStorage.setItem(TUTORIAL_BALL_KEY, "1"); } catch { /* ignore */ }
  }, []);
  const dismissSettingsHint = useCallback(() => {
    setShowSettingsHint(false);
    try { localStorage.setItem(TUTORIAL_SETTINGS_KEY, "1"); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (settingsExpanded && showSettingsHint) dismissSettingsHint();
  }, [settingsExpanded, showSettingsHint, dismissSettingsHint]);
  const hideTimerRef = useRef<number | null>(null);
  const lastRevealAtRef = useRef(0);
  useEffect(() => {
    const reveal = () => {
      const now = performance.now();
      if (now - lastRevealAtRef.current < 120) return;
      lastRevealAtRef.current = now;
      setShowHintChrome(true);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = window.setTimeout(() => setShowHintChrome(false), 5000);
    };
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
    if (!songId) {
      setInfo(undefined);
      return;
    }
    setInfo(getCachedInfo("song", songId));
    requestInfo("song", songId);
    const unsub = subscribeEntities(() => setInfo(getCachedInfo("song", songId)));
    return unsub;
  }, [songId]);
  const platform = info?.platformName ?? "";
  const rating = typeof info?.rating === "number" ? info.rating : undefined;
  const votes = info?.votes;

  // Window/info-box size selector (S/M/L), persisted via cracktroUi.
  const [windowSize, setWindowSizeState] = useState<WindowSize>(getWindowSize());
  const applyWindowSize = useCallback((s: WindowSize) => {
    setWindowSize(s);
    setWindowSizeState(s);
  }, []);

  // Mourning ritual: scrollers + info box fade & desaturate.
  const [mourning, setMourning] = useState(getMourningActive());
  useEffect(() => subscribeMourning(() => setMourning(getMourningActive())), []);

  // Live elapsed/total from the audio player.
  const [, setTimeTick] = useState(0);
  useEffect(() => subscribePlayerTime(() => setTimeTick((t) => (t + 1) % 1_000_000)), []);
  const { currentTime, duration } = getPlayerTime();

  // Refresh remaining time every second.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const timeLeft = nowPlaying ? computeTimeLeft(nowPlaying.playstart, nowPlaying.lengthSec) : "-";
  const songLength = nowPlaying ? formatDuration(nowPlaying.lengthSec) : "";

  // Song-rating chatter — fire once per (track, ratingTier) combo.
  const lastChatterKeyRef = useRef<string>("");
  useEffect(() => {
    if (rating === undefined || (!title && !artist)) return;
    const key = `${title}|${artist}|${Math.floor(rating)}`;
    if (key === lastChatterKeyRef.current) return;
    lastChatterKeyRef.current = key;
    const line = pickRatingLine(rating, artist);
    if (!line) return;
    const t = window.setTimeout(() => sayFromAnyGoose(line, 3000), 1800);
    return () => window.clearTimeout(t);
  }, [title, artist, rating]);


  const [isFullscreen, setIsFullscreen] = useState(false);

  const enterFullscreen = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const req =
      (
        el as HTMLElement & {
          webkitRequestFullscreen?: () => Promise<void>;
        }
      ).requestFullscreen ??
      (
        el as HTMLElement & {
          webkitRequestFullscreen?: () => Promise<void>;
        }
      ).webkitRequestFullscreen;
    Promise.resolve(req?.call(el))
      .then(() => {
        setIsFullscreen(Boolean(document.fullscreenElement));
      })
      .catch(() => {
        /* ignore */
      });
  }, []);

  // Auto-request fullscreen on mount. If it fails (or the user exits), we stay
  // in the normal in-browser layout that fills the viewport.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const req =
      (
        el as HTMLElement & {
          webkitRequestFullscreen?: () => Promise<void>;
        }
      ).requestFullscreen ??
      (
        el as HTMLElement & {
          webkitRequestFullscreen?: () => Promise<void>;
        }
      ).webkitRequestFullscreen;
    Promise.resolve(req?.call(el))
      .then(() => {
        setIsFullscreen(Boolean(document.fullscreenElement));
      })
      .catch(() => {
        setIsFullscreen(false);
      });

    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => undefined);
      }
    };
  }, []);

  // Esc only acts when not in browser fullscreen (the browser handles that
  // case itself).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.fullscreenElement) return; // browser will exit; onFsChange handles it
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const text = useMemo(() => (
    `   NOW SPINNING:  ${(artist || "UNKNOWN ARTIST").toUpperCase()}  ---  ${(title || "UNKNOWN TUNE").toUpperCase()}` +
    `${platform ? `   ON  ${platform.toUpperCase()}` : ""}` +
    `${rating !== undefined ? `   ★ ${rating.toFixed(2)}` : ""}` +
    `${lowFpsDetected ? "   ***   BIRDS SAY: SLOW PC + BAD GPU :( :(   ***" : ""}` +
    `   ***   STAY TUNED TO NECTARINE DEMOSCENE RADIO   ***   GREETZ TO ALL THE SCENERS OUT THERE   ***   `
  ), [artist, title, platform, rating, lowFpsDetected]);

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
    } catch {
      /* ignore */
    }
    return "xm";
  });
  useEffect(() => {
    try {
      localStorage.setItem("cracktro-skin-override", skinOverride);
    } catch {
      /* ignore */
    }
  }, [skinOverride]);
  const skin: Skin = skinOverride === "auto" ? autoSkin : skinOverride;

  const [gooseOn, setGooseOn] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem("cracktro-goose");
      return v === null ? true : v === "1";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("cracktro-goose", gooseOn ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [gooseOn]);

  const [brownGooseOn, setBrownGooseOn] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem("cracktro-goose-brown");
      return v === null ? true : v === "1";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("cracktro-goose-brown", brownGooseOn ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [brownGooseOn]);

  const [boingOn, setBoingOn] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem("cracktro-boing");
      return v === null ? true : v === "1";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("cracktro-boing", boingOn ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [boingOn]);

  const [procreationOn, setProcreationOn] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem("cracktro-procreation");
      return v === null ? false : v === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("cracktro-procreation", procreationOn ? "1" : "0");
    } catch {
      /* ignore */
    }
    setProcreationEnabled(procreationOn);
  }, [procreationOn]);
  const [changelogOpen, setChangelogOpen] = useState(false);
  // Clean up any leftover sim-mode storage keys from previous versions.
  useEffect(() => {
    try {
      localStorage.removeItem("cracktro-goose-life-sim");
      localStorage.removeItem("cracktro-goose-life-sim-migrated-v2");
    } catch {
      /* ignore */
    }
  }, []);
  const [sceneErasOn, setSceneErasOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_SCENE_ERAS) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SCENE_ERAS, sceneErasOn ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [sceneErasOn]);
  const [listeningMs, setListeningMs] = useState<number>(() => {
    try {
      const raw = Number(localStorage.getItem(STORAGE_SCENE_ERA_LISTEN_MS));
      return Number.isFinite(raw) ? Math.max(0, raw) : 0;
    } catch {
      return 0;
    }
  });
  const listeningMsRef = useRef(listeningMs);
  const lastEraTickAtRef = useRef<number | null>(null);
  const lastPersistedMinuteRef = useRef(Math.floor(listeningMs / 60_000));
  useEffect(() => {
    listeningMsRef.current = listeningMs;
  }, [listeningMs]);
  useEffect(() => {
    const minuteBucket = Math.floor(listeningMs / 60_000);
    if (minuteBucket === lastPersistedMinuteRef.current) return;
    lastPersistedMinuteRef.current = minuteBucket;
    try {
      localStorage.setItem(STORAGE_SCENE_ERA_LISTEN_MS, String(Math.floor(listeningMs)));
    } catch {
      /* ignore */
    }
  }, [listeningMs]);
  // Persist once per minute during runtime plus one final write on unmount.
  useEffect(
    () => () => {
      try {
        localStorage.setItem(STORAGE_SCENE_ERA_LISTEN_MS, String(Math.floor(listeningMsRef.current)));
      } catch {
        /* ignore */
      }
    },
    [],
  );
  useEffect(() => {
    if (!sceneErasOn) return;
    lastEraTickAtRef.current = Date.now();
    const interval = window.setInterval(() => {
      // Approximation: listening time advances while cracktro view stays open.
      const now = Date.now();
      const prev = lastEraTickAtRef.current ?? now;
      lastEraTickAtRef.current = now;
      const deltaMs = Math.min(60_000, Math.max(5_000, now - prev));
      setListeningMs((v) => v + deltaMs);
    }, 15_000);
    return () => {
      lastEraTickAtRef.current = null;
      window.clearInterval(interval);
    };
  }, [sceneErasOn]);
  const sceneEra = sceneErasOn ? getSceneEraFromListeningMs(listeningMs) : "intro";
  const sceneEraConfig = getSceneEraConfig(sceneEra);
  useEffect(() => {
    setGooseSceneEra(sceneEra);
    return () => setGooseSceneEra("intro");
  }, [sceneEra]);
  useEffect(() => {
    setGoosePerformanceState({ lowFps: lowFpsDetected });
    return () => setGoosePerformanceState({ lowFps: false });
  }, [lowFpsDetected]);
  useEffect(() => {
    if (scrollOn) return;
    setFps(null);
    setLowFpsDetected(false);
  }, [scrollOn]);
  const effectiveStyle = useMemo<VisualizerStyle>(() => {
    if (style !== "off") return style;
    if (sceneEra === "warmed") return "starfield";
    if (sceneEra === "party") return "rings";
    if (sceneEra === "veteran") return "particles";
    return "tunnel";
  }, [sceneEra, style]);

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

    const stageEl = canvas.parentElement;
    const stageW = () => (stageEl ? stageEl.clientWidth : window.innerWidth);
    const resize = () => {
      const w = stageW();
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(CSS_H * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${CSS_H}px`;
    };
    resize();
    let ro: ResizeObserver | null = null;
    if (stageEl) {
      ro = new ResizeObserver(resize);
      ro.observe(stageEl);
    } else {
      window.addEventListener("resize", resize);
    }

    const fontSize = 64 * dpr;
    const fontStr =
      skin === "xm"
        ? `${fontSize}px "Press Start 2P","VT323",monospace`
        : `900 ${fontSize}px "Impact","Arial Black","Helvetica Neue",sans-serif`;
    ctx.font = fontStr;
    ctx.textBaseline = "middle";
    const chars = Array.from(text);
    const widths = chars.map((c) => ctx.measureText(c).width + 4 * dpr);
    const totalW = widths.reduce((a, b) => a + b, 0);

    // Offscreen glyph canvas for clipped/banded skins.
    const og = document.createElement("canvas");
    og.height = canvas.height;
    const octx = og.getContext("2d");

    let offset = 0;
    let t = 0;
    let lastFrameAt = performance.now();
    let fpsEma = 60;
    let lowFpsMs = 0;
    let lastHudUpdateAt = 0;
    let raf = 0;

    const drawBackdrop = (w: number, h: number) => {
      if (mode === "copper") {
        // Copper bar gradient bands (Amiga style).
        const bandH = 6 * dpr;
        for (let y = 0; y < h; y += bandH) {
          const phase = y * 0.02 + t * 1.4;
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

    // Paint one glyph onto the offscreen canvas (size already set), clipped to letter shape.
    const paintSkinned = (ch: string, cw: number) => {
      if (!octx) return;
      const ow = og.width;
      const oh = og.height;
      octx.clearRect(0, 0, ow, oh);
      const glyphH = fontSize * 0.82;
      const top = oh / 2 - glyphH / 2;

      if (skin === "amiga") {
        const g = octx.createLinearGradient(0, top, 0, top + glyphH);
        g.addColorStop(0, "#fff3c4");
        g.addColorStop(0.35, "#e6b94a");
        g.addColorStop(0.65, "#8a5a14");
        g.addColorStop(1, "#2a1604");
        octx.fillStyle = g;
        octx.fillRect(0, top, ow, glyphH);
        // 45° dark hatching
        octx.fillStyle = "rgba(30,15,4,0.55)";
        const stripeW = 3 * dpr;
        for (let sx = -oh; sx < ow + oh; sx += stripeW * 2) {
          octx.beginPath();
          octx.moveTo(sx, 0);
          octx.lineTo(sx + oh, oh);
          octx.lineTo(sx + oh + stripeW, oh);
          octx.lineTo(sx + stripeW, 0);
          octx.closePath();
          octx.fill();
        }
      } else if (skin === "atari" || skin === "c64") {
        const colors =
          skin === "atari" ? ["#d8341c", "#f5c518", "#3aa84a", "#1f5fd6"] : ["#c44a3a", "#e8c352", "#5aa86a"];
        const bandH = glyphH / colors.length;
        for (let i = 0; i < colors.length; i++) {
          octx.fillStyle = colors[i];
          octx.fillRect(0, top + i * bandH, ow, bandH + 0.5);
        }
      } else if (skin === "xm") {
        const g = octx.createLinearGradient(0, top, 0, top + glyphH);
        g.addColorStop(0, "#0a1a3a");
        g.addColorStop(0.3, "#2a6acc");
        g.addColorStop(0.55, "#cfe1ff");
        g.addColorStop(0.78, "#2a6acc");
        g.addColorStop(1, "#0a1a3a");
        octx.fillStyle = g;
        octx.fillRect(0, top, ow, glyphH);
        // animated horizontal shimmer scan lines (FT2 wave feel)
        for (let yy = top; yy < top + glyphH; yy += 2 * dpr) {
          const v = (Math.sin(yy * 0.09 + t * 2.4) + 1) * 0.5;
          octx.fillStyle = `rgba(255,255,255,${0.05 + v * 0.18})`;
          octx.fillRect(0, yy, ow, dpr);
        }
      }

      // Clip the fill to the glyph silhouette.
      octx.globalCompositeOperation = "destination-in";
      octx.font = fontStr;
      octx.textBaseline = "middle";
      octx.fillStyle = "#fff";
      octx.fillText(ch, 2 * dpr, oh / 2);
      octx.globalCompositeOperation = "source-over";
    };

    const tick = (now: number) => {
      const dtMs = Math.min(MAX_FRAME_TIME_MS, Math.max(1, now - lastFrameAt));
      lastFrameAt = now;
      const frameScale = dtMs / (1000 / 60);
      const instFps = 1000 / dtMs;
      fpsEma += (instFps - fpsEma) * FPS_EMA_ALPHA;
      if (fpsEma < LOW_FPS_THRESHOLD) lowFpsMs += dtMs;
      else lowFpsMs = Math.max(0, lowFpsMs - dtMs * 2);
      const lowFps = lowFpsMs >= LOW_FPS_SUSTAINED_MS;
      if (now - lastHudUpdateAt > FPS_HUD_UPDATE_INTERVAL_MS) {
        setFps(Math.round(fpsEma));
        setLowFpsDetected((prev) => (prev === lowFps ? prev : lowFps));
        lastHudUpdateAt = now;
      }

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

      let x = w - offset;
      for (let i = 0; i < chars.length; i++) {
        const cw = widths[i];
        if (x + cw < 0) {
          x += cw;
          continue;
        }
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
          // Resize offscreen for this glyph (height is constant).
          const ow = Math.max(1, Math.ceil(cw + 8 * dpr));
          if (og.width !== ow) og.width = ow;
          paintSkinned(chars[i], cw);
          // Optional outline glow for legibility on the visualizer backdrop.
          if (skin === "amiga") {
            ctx.shadowColor = "rgba(0,0,0,0.85)";
            ctx.shadowBlur = 6 * dpr;
          } else if (skin === "xm") {
            ctx.shadowColor = "rgba(10,20,60,0.9)";
            ctx.shadowBlur = 8 * dpr;
          } else {
            ctx.shadowColor = "rgba(0,0,0,0.7)";
            ctx.shadowBlur = 4 * dpr;
          }
          ctx.drawImage(og, -cw / 2, -og.height / 2);
          ctx.shadowBlur = 0;
        }
        ctx.restore();

        x += cw;
      }

      offset += 3 * dpr * sceneEraConfig.scrollerSpeed * frameScale;
      t += 0.05 * frameScale;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      else window.removeEventListener("resize", resize);
    };
  }, [text, mode, scrollOn, skin, sceneEraConfig.scrollerSpeed]);

  const scrollerBottomOffset = 40; // px, leaves room for the controls bar
  return (
    <div ref={setWrap} className="fixed inset-0 z-[9999] bg-background overflow-hidden">
      <StageProvider element={stageEl}>
        <Visualizer analyser={analyser} style={effectiveStyle} />
        <BeatOverlay analyser={analyser} enabled />
        {gooseOn && <FlyingGoose oneliners={oneliners} />}
        {brownGooseOn && <FlyingGoose oneliners={oneliners} variant="brown" />}
        {(gooseOn || brownGooseOn) && <GooseFamily />}
        {boingOn && <BoingBall />}
        <GooseDebugOverlay />



        <button
          type="button"
          onClick={() => onExitRef.current?.()}
          className={`absolute top-2 left-2 z-10 min-h-9 px-3 py-1 text-[10px] uppercase tracking-widest rounded-sm border border-border bg-card/60 text-foreground hover:bg-card touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-opacity duration-500 ${
            showHintChrome ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          aria-label="Exit Cracktro"
          title="Exit Cracktro"
        >
          EXIT
        </button>
        {sceneErasOn && (
          <div
            className={`absolute top-2 left-20 z-10 min-h-9 px-3 py-1 text-[10px] uppercase tracking-widest rounded-sm border border-border bg-card/60 text-foreground transition-opacity duration-500 flex items-center ${
              showHintChrome ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
            aria-label={`Scene Era: ${sceneEraConfig.label}`}
            title={`Scene Era: ${sceneEraConfig.label}`}
          >
            Era: {sceneEraConfig.label}
          </div>
        )}
        {fpsCounterOn && (
          <div
            className="absolute top-2 right-24 z-10 rounded-sm border border-border bg-card/60 px-2 py-1 text-[10px] uppercase tracking-widest text-foreground"
            aria-live="polite"
          >
            FPS: {fps ?? "--"}{lowFpsDetected ? " · SLOW GPU" : ""}
          </div>
        )}

        {/* Scroller canvas — vertically centered, taller box so glyphs never clip. */}
        {scrollOn && (
          <canvas
            ref={canvasRef}
            aria-hidden="true"
            className="absolute left-0 right-0 pointer-events-none"
            style={{
              top: "50%",
              transform: "translateY(-50%)",
              zIndex: 5,
              opacity: mourning ? 0.25 : 1,
              filter: mourning ? "grayscale(0.85) brightness(0.55)" : undefined,
              transition: "opacity 1200ms ease-out, filter 1200ms ease-out",
            }}
          />
        )}

        {/* Info bar: big now-playing strip pinned to the bottom. Independent of scroller. */}
        {infobarOn && (() => {
          const tMult = windowSize === "s" ? 0.85 : windowSize === "l" ? 1.2 : 1;
          return (
          <div
            className="absolute left-0 right-0 pointer-events-none"
            style={{
              bottom: scrollerBottomOffset,
              zIndex: 5,
              background: `linear-gradient(to top, hsla(20,25%,4%,${sceneEraConfig.infoBarOpacity}), hsla(20,25%,4%,0))`,
              paddingTop: "1.5rem",
              paddingBottom: "1.5rem",
              opacity: mourning ? 0.4 : 1,
              filter: mourning ? "grayscale(0.85)" : undefined,
              transition: "opacity 1200ms ease-out, filter 1200ms ease-out",
            }}
          >
            <div className="mx-auto max-w-6xl px-6 text-center">
              <p
                key={title || "unknown"}
                className="neon font-extrabold uppercase leading-tight tracking-wider"
                style={{ fontSize: `clamp(${2 * tMult}rem, ${5.5 * tMult}vw, ${5 * tMult}rem)` }}
              >
                {(title || "Unknown Tune").split("").map((ch, i) =>
                  ch === " " ? (
                    <span key={i}>&nbsp;</span>
                  ) : (
                    <span key={i} data-goose-letter={ch} className="inline-block">
                      {ch}
                    </span>
                  ),
                )}
              </p>
              <p
                className="neon-accent font-bold uppercase tracking-widest mt-2"
                style={{ fontSize: `clamp(${1.25 * tMult}rem, ${3 * tMult}vw, ${2.5 * tMult}rem)` }}
              >
                by {artist || "Unknown Artist"}
              </p>
              {(platform || rating !== undefined || duration > 0 || songLength) && (
                <p
                  className="text-foreground uppercase tracking-[0.3em] mt-3"
                  style={{ fontSize: `clamp(${0.95 * tMult}rem, ${1.8 * tMult}vw, ${1.5 * tMult}rem)` }}
                >
                  {platform && <span>{platform}</span>}
                  {platform && rating !== undefined && <span className="mx-3 opacity-50">·</span>}
                  {rating !== undefined && (
                    <span>
                      ★ {rating.toFixed(2)}
                      {votes ? ` (${votes})` : ""}
                    </span>
                  )}
                  {(platform || rating !== undefined) && songLength && (
                    <span className="mx-3 opacity-50">·</span>
                  )}
                  {songLength && (
                    <span>
                      {songLength}
                    </span>
                  )}
                  {songLength && timeLeft !== "-" && (
                    <span className="mx-3 opacity-50">·</span>
                  )}
                  {timeLeft !== "-" && (
                    <span className="tabular-nums">{timeLeft}</span>
                  )}
                </p>
              )}
            </div>
          </div>
          );
        })()}

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
                    <span className="text-muted-foreground text-[10px] mr-1">{formatOnelinerTime(o.time)}</span>
                    <span className="font-semibold text-primary">
                      <Flag code={o.flag} />
                      {(() => {
                        const href = userUrl(o.username);
                        if (!href) return o.username;
                        return (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            {o.username}
                          </a>
                        );
                      })()}
                    </span>
                    <span className="text-muted-foreground">: </span>
                    <span>{renderBBCode(o.text)}</span>
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
                    {q.requester && <span className="text-muted-foreground text-[10px]"> · {q.requester}</span>}
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

        {panelsOn.roster && (
          <RosterWindow
            defaultX={Math.max(16, (typeof window !== "undefined" ? window.innerWidth : 1200) - 320)}
            defaultY={120}
            onClose={() => togglePanel("roster")}
          />
        )}


        <button
          type="button"
          onClick={() => {
            if (document.fullscreenElement) {
              document.exitFullscreen?.().catch(() => undefined);
            } else {
              enterFullscreen();
            }
          }}
          className={`absolute top-4 right-4 min-h-11 px-3 py-2 text-xs uppercase tracking-widest rounded-sm border border-border bg-card/80 text-foreground hover:bg-card hover:opacity-90 touch-manipulation transition-opacity duration-500 ${
            showHintChrome ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          style={{ zIndex: 10 }}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isFullscreen ? "Window mode ⤓" : "Enter ⤢"}
        </button>

        {!settingsExpanded && (
          <button
            type="button"
            onClick={() => setSettingsExpanded(true)}
            className={`absolute right-3 bottom-3 h-10 w-10 rounded-sm border border-border bg-card/80 backdrop-blur-sm text-foreground text-lg leading-none transition-opacity duration-500 ${
              showHintChrome ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
            style={{ zIndex: 12 }}
            aria-label="Expand settings"
            title="Expand settings"
          >
            ▲
          </button>
        )}

        {/* Bottom controls bar — opened only by explicit click. */}
        <div
          className={`absolute left-0 right-0 bottom-0 flex flex-col gap-1.5 px-3 py-2 bg-card/70 border-t border-border backdrop-blur-sm transition-opacity duration-300 ${
            settingsExpanded ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          style={{ zIndex: 11 }}
        >
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => setSettingsExpanded(false)}
              className="min-h-9 px-2 py-1 text-[10px] uppercase tracking-widest rounded-sm border border-border bg-background/60 text-foreground hover:bg-background"
              aria-label="Collapse settings"
              title="Collapse settings"
            >
              ▼
            </button>
          </div>
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
                  onClick={() => {
                    setMode(m.id);
                    if (!scrollOn) setScrollOn(true);
                  }}
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

            <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground ml-2 mr-1">FPS</span>
            <button
              type="button"
              onClick={() => setFpsCounterOn((v) => !v)}
              className={`min-h-9 px-3 py-1 text-[10px] uppercase tracking-widest rounded-sm border ${
                fpsCounterOn
                  ? "border-primary bg-primary/20 text-foreground"
                  : "border-border bg-background/60 text-muted-foreground hover:text-foreground"
              }`}
              aria-pressed={fpsCounterOn}
              aria-label="Toggle FPS counter"
            >
              {fpsCounterOn ? "ON" : "OFF"}
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

            <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground ml-2 mr-1">Brown Goose</span>
            <button
              type="button"
              onClick={() => setBrownGooseOn((v) => !v)}
              className={`min-h-9 px-3 py-1 text-[10px] uppercase tracking-widest rounded-sm border ${
                brownGooseOn
                  ? "border-primary bg-primary/20 text-foreground"
                  : "border-border bg-background/60 text-muted-foreground hover:text-foreground"
              }`}
              aria-pressed={brownGooseOn}
              title="Toggle brown flying goose"
            >
              {brownGooseOn ? "ON" : "OFF"}
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

            <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground ml-2 mr-1">Procreation</span>
            <button
              type="button"
              onClick={() => setProcreationOn((v) => !v)}
              className={`min-h-9 px-3 py-1 text-[10px] uppercase tracking-widest rounded-sm border ${
                procreationOn
                  ? "border-primary bg-primary/20 text-foreground"
                  : "border-border bg-background/60 text-muted-foreground hover:text-foreground"
              }`}
              aria-pressed={procreationOn}
              title="Toggle goose procreation (eggs, goslings, family adults)"
            >
              {procreationOn ? "ON" : "OFF"}
            </button>
            <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground ml-2 mr-1">Scene Eras</span>
            <button
              type="button"
              onClick={() => setSceneErasOn((v) => !v)}
              className={`min-h-9 px-3 py-1 text-[10px] uppercase tracking-widest rounded-sm border ${
                sceneErasOn
                  ? "border-primary bg-primary/20 text-foreground"
                  : "border-border bg-background/60 text-muted-foreground hover:text-foreground"
              }`}
              aria-pressed={sceneErasOn}
              title="Evolve scene style over long cracktro sessions"
            >
              {sceneErasOn ? "ON" : "OFF"}
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

          {/* Row: window size + reset family */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mr-1">Size</span>
            <div className="flex items-center gap-1">
              {(["s", "m", "l"] as WindowSize[]).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => applyWindowSize(sz)}
                  className={`min-h-9 px-3 py-1 text-[10px] uppercase tracking-widest rounded-sm border ${
                    windowSize === sz
                      ? "border-primary bg-primary/20 text-foreground"
                      : "border-border bg-background/60 text-muted-foreground hover:text-foreground"
                  }`}
                  aria-pressed={windowSize === sz}
                  title="Resize floating windows and info box"
                >
                  {sz.toUpperCase()}
                </button>
              ))}
            </div>
            <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground ml-3 mr-1">Family</span>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(
                  "Reset the goose family?\n\nThis will permanently delete all your geese, eggs, goslings and grown-up offspring. The two original geese will return. Continue?",
                )) {
                  clearRoster();
                  window.location.reload();
                }
              }}
              className="min-h-9 px-3 py-1 text-[10px] uppercase tracking-widest rounded-sm border border-destructive/60 bg-background/60 text-destructive hover:bg-destructive/20"
              title="Permanently remove all family members"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => setChangelogOpen(true)}
              className="min-h-9 px-3 py-1 text-[10px] uppercase tracking-widest rounded-sm border border-border bg-background/60 text-muted-foreground hover:text-foreground hover:border-primary transition-colors ml-3"
              title="View changelog"
            >
              v{APP_VERSION}
            </button>
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
            </div>
          )}
        </div>
      </StageProvider>
      {changelogOpen && <ChangelogModal onClose={() => setChangelogOpen(false)} />}
    </div>
  );
};

export default Cracktro;
