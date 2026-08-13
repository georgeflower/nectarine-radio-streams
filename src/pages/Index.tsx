import React, { useCallback, useEffect, useRef, useState } from "react";
import { useWakeLock } from "@/hooks/useWakeLock";
import {
  AUTO_REFRESH_INTERVAL_MS,
  ENDPOINTS,
  artistUrl,
  computeTimeLeft,
  fetchEndpoint,
  formatDuration,
  formatOnelinerTime,
  parseOneliners,
  parseOnline,
  parsePlaylist,
  parseStreams,
  parseXml,
  songUrl,
  platformUrl,
  userUrl,
  type Endpoint,
  type OnelinerEntry,
  type PlaylistData,
  type StreamSource,
} from "@/lib/nectarine";
import AudioPlayer from "@/components/AudioPlayer";
import Visualizer, { useAudioLevel, type VisualizerStyle } from "@/components/Visualizer";
import BeatOverlay from "@/components/BeatOverlay";
import PlaybackDiagnostics from "@/components/PlaybackDiagnostics";
import Cracktro from "@/components/Cracktro";
import ChangelogModal, { APP_VERSION } from "@/components/ChangelogModal";
import WhatsNewPopup from "@/components/WhatsNewPopup";
import Flag from "@/components/Flag";
import { renderWithSmileys } from "@/lib/smileys";
import { renderBBCode } from "@/lib/bbcode";
import { getCachedInfo, requestInfo, subscribe as subscribeEntities } from "@/lib/entityCache";

import LastfmButton from "@/components/LastfmButton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ReactivityDrawer from "@/components/ReactivityDrawer";
import PerformanceTipsModal from "@/components/PerformanceTipsModal";
import { handleLastfmCallback } from "@/lib/lastfm";

function SongRating({ songId }: { songId: string }) {
  const [info, setInfo] = useState(() => getCachedInfo("song", songId));
  useEffect(() => {
    if (!songId) return;
    setInfo(getCachedInfo("song", songId));
    requestInfo("song", songId);
    const unsub = subscribeEntities(() => {
      const next = getCachedInfo("song", songId);
      if (next) setInfo(next);
    });
    return unsub;
  }, [songId]);
  if (!info || info.rating === undefined) return null;
  return (
    <span
      className="text-xs text-muted-foreground"
      title={`${info.rating.toFixed(4)} from ${info.votes ?? 0} vote${info.votes === 1 ? "" : "s"}`}
    >
      ★ {info.rating.toFixed(2)}
      {info.votes !== undefined ? ` (${info.votes})` : ""}
    </span>
  );
}

function SongPlatform({ songId }: { songId: string }) {
  const [info, setInfo] = useState(() => getCachedInfo("song", songId));
  useEffect(() => {
    if (!songId) return;
    setInfo(getCachedInfo("song", songId));
    requestInfo("song", songId);
    const unsub = subscribeEntities(() => {
      const next = getCachedInfo("song", songId);
      if (next) setInfo(next);
    });
    return unsub;
  }, [songId]);
  if (!info?.platformId || !info?.platformName) return null;
  const href = platformUrl(info.platformId);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={`All songs on ${info.platformName}`}
      className="inline-block text-[10px] uppercase tracking-wider px-1.5 py-0.5 border border-border rounded-sm hover:border-primary hover:text-primary transition-colors align-middle"
    >
      {info.platformName}
    </a>
  );
}

type ExtLinkProps = {
  href: string | null;
  children: React.ReactNode;
  className?: string;
};
const ExtLink = ({ href, children, className }: ExtLinkProps) => {
  if (!href) return <span className={className}>{children}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${className ?? ""} hover:underline hover:text-primary transition-colors`}
    >
      {children}
    </a>
  );
};

const VIZ_STYLES: VisualizerStyle[] = [
  "off",
  "starfield",
  "bars",
  "plasma",
  "oscilloscope",
  "tunnel",
  "rings",
  "particles",
];
const VIZ_STORAGE_KEY = "nectarine-viz";

type ThemeId =
  | "legacy"
  | "nectalift"
  | "nostalgia"
  | "goatgray"
  | "pony"
  | "orange"
  | "nostalgia-c"
  | "original"
  | "simple";
const THEMES: { id: ThemeId; label: string; attr: string | null }[] = [
  { id: "nostalgia", label: "Blue blue", attr: "workbench" },
  { id: "legacy", label: "CRT", attr: null },
  { id: "nectalift", label: "B & W", attr: "gem" },
  { id: "goatgray", label: "Goat Gray", attr: "goatgray" },
  { id: "pony", label: "Pony", attr: "pony" },
  { id: "orange", label: "Splash of Orange", attr: "orange" },
  { id: "nostalgia-c", label: "Nostalgia-C", attr: "nostalgia-c" },
  { id: "original", label: "Original", attr: "original" },
  { id: "simple", label: "Simple", attr: "simple" },
];
const THEME_STORAGE_KEY = "nectarine-theme";
const SCANLINES_STORAGE_KEY = "nectarine-scanlines";

const EMPTY_PLAYLIST: PlaylistData = { now: null, queue: [], history: [] };

const usePersistedBool = (key: string, initial: boolean): [boolean, React.Dispatch<React.SetStateAction<boolean>>] => {
  const [value, setValue] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(key);
      if (v === "1") return true;
      if (v === "0") return false;
    } catch {
      // ignore
    }
    return initial;
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, value ? "1" : "0");
    } catch {
      // ignore
    }
  }, [key, value]);
  return [value, setValue];
};

const Index = () => {
  const [playlist, setPlaylist] = useState<PlaylistData>(EMPTY_PLAYLIST);
  const [oneliners, setOneliners] = useState<OnelinerEntry[]>([]);
  const [users, setUsers] = useState<{ name: string; flag: string }[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [streams, setStreams] = useState<StreamSource[]>([]);
  const [status, setStatus] = useState("Loading API data...");
  const [streamsOpen, setStreamsOpen] = usePersistedBool("nectarine-streams-open", false);
  const [onelinerOpen, setOnelinerOpen] = usePersistedBool("nectarine-oneliner-open", true);
  const [onelinerExpanded, setOnelinerExpanded] = usePersistedBool("nectarine-oneliner-expanded", false);
  const [onlineOpen, setOnlineOpen] = usePersistedBool("nectarine-online-open", true);
  const [historyOpen, setHistoryOpen] = usePersistedBool("nectarine-history-open", true);
  const [nowOpen, setNowOpen] = usePersistedBool("nectarine-now-open", true);
  const [queueOpen, setQueueOpen] = usePersistedBool("nectarine-queue-open", true);
  
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [vizStyle, setVizStyle] = useState<VisualizerStyle>(() => {
    try {
      const v = localStorage.getItem(VIZ_STORAGE_KEY) as VisualizerStyle | null;
      if (v && VIZ_STYLES.includes(v)) return v;
    } catch {
      // ignore
    }
    return "starfield";
  });
  const inFlight = useRef(false);
  const audioLevel = useAudioLevel(analyser, vizStyle !== "off");
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [cracktroOpen, setCracktroOpen] = useState(false);
  const [perfTipsOpen, setPerfTipsOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [seekCount, setSeekCount] = useState(0);
  const [firefoxWarnDismissed, setFirefoxWarnDismissed] = useState(() => {
    try { return localStorage.getItem("nectarine-firefox-warn") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("nectarine-firefox-warn", firefoxWarnDismissed ? "1" : "0"); } catch {}
  }, [firefoxWarnDismissed]);
  const isFirefox = typeof navigator !== "undefined" && /Firefox/i.test(navigator.userAgent);
  useWakeLock();

  useEffect(() => {
    try {
      localStorage.setItem(VIZ_STORAGE_KEY, vizStyle);
    } catch {
      // ignore
    }
  }, [vizStyle]);

  useEffect(() => {
    void (async () => {
      const result = await handleLastfmCallback();
      if (!result) return;
      const { toast } = await import("sonner");
      if (result.ok) {
        toast.success(`Connected to Last.fm as ${result.session.username}`);
        return;
      }
      const errMsg = (result as { ok: false; error: string }).error;
      toast.error(`Last.fm auth failed: ${errMsg}`, {
        description: "Check the API key configuration or try reconnecting.",
        duration: 8000,
      });
    })();
    try {
      const seen = localStorage.getItem("changelog-seen-version");
      if (seen !== APP_VERSION) setWhatsNewOpen(true);
    } catch {
      // ignore
    }
  }, []);

  // Surface "new version available" events dispatched by main.tsx.
  useEffect(() => {
    const handler = async () => {
      const { toast } = await import("sonner");
      const { forceReloadForNewVersion } = await import("@/lib/versionCheck");
      toast("A new version is available", {
        description: "Reload to get the latest streams, fixes and features.",
        duration: 20_000,
        action: {
          label: "Reload now",
          onClick: () => { void forceReloadForNewVersion(); },
        },
      });
    };
    window.addEventListener("nectarine:update-available", handler as EventListener);
    return () => window.removeEventListener("nectarine:update-available", handler as EventListener);
  }, []);



  const [fontScale, setFontScale] = useState<number>(() => {
    try {
      const v = parseFloat(localStorage.getItem("nectarine-font-scale") || "");
      if (!isNaN(v) && v >= 0.7 && v <= 1.6) return v;
    } catch {
      // ignore
    }
    return 1;
  });

  useEffect(() => {
    // Font-scale is applied to <main> inline (see below) so header controls
    // keep their fixed size when the user presses A− / A+.
    try {
      localStorage.setItem("nectarine-font-scale", String(fontScale));
    } catch {
      // ignore
    }
  }, [fontScale]);
  const contentZoom = fontScale;

  const adjustFont = (delta: number) =>
    setFontScale((s) => Math.min(1.6, Math.max(0.7, Math.round((s + delta) * 10) / 10)));

  const [theme, setTheme] = useState<ThemeId>(() => {
    try {
      const v = localStorage.getItem(THEME_STORAGE_KEY) as ThemeId | null;
      if (v && THEMES.some((t) => t.id === v)) return v;
    } catch {
      // ignore
    }
    return "orange";
  });

  const [scanlines, setScanlines] = usePersistedBool(SCANLINES_STORAGE_KEY, false);

  useEffect(() => {
    const def = THEMES.find((t) => t.id === theme);
    if (def?.attr) document.documentElement.setAttribute("data-theme", def.attr);
    else document.documentElement.removeAttribute("data-theme");
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-scanlines", scanlines ? "on" : "off");
  }, [scanlines]);

  const loadEndpoint = useCallback(async (endpoint: Endpoint) => {
    try {
      const text = await fetchEndpoint(endpoint);
      const xml = parseXml(text);
      if (xml.querySelector("parsererror")) throw new Error("Invalid XML response");

      if (endpoint === "queue") setPlaylist(parsePlaylist(xml));
      if (endpoint === "oneliner") setOneliners(parseOneliners(xml));
      if (endpoint === "online") {
        const { users, total } = parseOnline(xml);
        setUsers(users);
        setUsersTotal(total);
      }
      if (endpoint === "streams") setStreams(parseStreams(xml));
    } catch (e) {
      console.error(`Failed to load ${endpoint}:`, e);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setStatus("Refreshing...");
    try {
      await Promise.all(ENDPOINTS.map(loadEndpoint));
      setStatus(`Last updated: ${new Date().toLocaleTimeString()}`);
    } catch {
      setStatus(`Refresh failed: ${new Date().toLocaleTimeString()}`);
    } finally {
      inFlight.current = false;
    }
  }, [loadEndpoint]);

  useEffect(() => {
    document.title = "Nectarine Demoscene Radio · Compact API View";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute(
        "content",
        "Compact viewer for the Nectarine demoscene radio API: now playing, queue, oneliner, online users and live streams.",
      );
    }
    refreshAll();
    const id = window.setInterval(() => {
      // Skip polling while the tab is hidden — nobody is looking at the panels.
      if (document.hidden) return;
      void refreshAll();
    }, AUTO_REFRESH_INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) void refreshAll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshAll]);

  const now = playlist.now;
  const trackKey = now
    ? `${now.artist ?? ""}||${now.song ?? ""}||${now.playstart ?? ""}||${seekCount}`
    : `seek-${seekCount}`;


  return (
    <div className="crt min-h-screen relative overflow-x-hidden">
      <Visualizer analyser={analyser} style={vizStyle} />
      <BeatOverlay analyser={analyser} enabled={vizStyle !== "off"} />
      {cracktroOpen && (
        <Cracktro
          analyser={analyser}
          style={vizStyle}
          artist={now?.artist ?? ""}
          title={now?.song ?? ""}
          songId={now?.songId}
          nowPlaying={now}
          onExit={() => setCracktroOpen(false)}
          onStyleChange={(s) => setVizStyle(s)}
          oneliners={oneliners}
          users={users}
          usersTotal={usersTotal}
          queue={playlist.queue}
          history={playlist.history}
        />
      )}
      {changelogOpen && <ChangelogModal onClose={() => setChangelogOpen(false)} />}
      {whatsNewOpen && (
        <WhatsNewPopup
          onClose={() => {
            try { localStorage.setItem("changelog-seen-version", APP_VERSION); } catch {}
            setWhatsNewOpen(false);
          }}
          onViewFull={() => {
            try { localStorage.setItem("changelog-seen-version", APP_VERSION); } catch {}
            setWhatsNewOpen(false);
            setChangelogOpen(true);
          }}
        />
      )}
      {diagnosticsOpen && <PlaybackDiagnostics onClose={() => setDiagnosticsOpen(false)} />}
      <PerformanceTipsModal open={perfTipsOpen} onClose={() => setPerfTipsOpen(false)} />
      <main
        className="mx-auto max-w-5xl px-3 sm:px-4 py-4 md:py-10 relative"
        style={{
          zIndex: 1,
          paddingTop: "max(1rem, var(--safe-top))",
          paddingBottom: "max(1rem, var(--safe-bottom))",
          paddingLeft: "max(0.75rem, var(--safe-left))",
          paddingRight: "max(0.75rem, var(--safe-right))",
        }}
      >
        {isFirefox && !firefoxWarnDismissed && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-sm border border-red-500/30 bg-red-950/20 text-red-400 text-xs uppercase tracking-wider">
            <span className="flex-1">Known performance issues with Firefox for the effects. For best performance change to Chrome, Edge or Safari.</span>
            <button
              type="button"
              onClick={() => setFirefoxWarnDismissed(true)}
              aria-label="Dismiss Firefox warning"
              className="shrink-0 hover:text-red-300 transition-colors"
            >
              ✕
            </button>
          </div>
        )}
        <header
          className="flex flex-col gap-3 mb-5 border-b border-border pb-4 md:flex-row md:items-center md:justify-between"
          style={{ fontSize: "16px" }}
        >
          <div>
            <h1 className="text-2xl md:text-3xl font-bold neon tracking-widest uppercase">▌Necta Compact View</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:justify-end w-full md:w-auto">
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as ThemeId)}
              aria-label="Theme"
              className="min-h-11 px-2 py-2 text-xs uppercase tracking-widest rounded-sm border border-border bg-card/60 text-foreground hover:opacity-90 touch-manipulation flex-1 min-w-0 md:flex-none"
            >
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <div
              className="flex items-center rounded-sm border border-border bg-card/60 shrink-0"
              role="group"
              aria-label="Text size"
            >
              <button
                type="button"
                onClick={() => adjustFont(-0.1)}
                disabled={fontScale <= 0.7}
                aria-label="Decrease text size"
                className="min-h-11 w-10 text-sm font-bold hover:opacity-90 disabled:opacity-40 touch-manipulation"
              >
                A−
              </button>
              <span className="px-2 text-[10px] uppercase tracking-widest text-muted-foreground tabular-nums">
                {Math.round(fontScale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => adjustFont(0.1)}
                disabled={fontScale >= 1.6}
                aria-label="Increase text size"
                className="min-h-11 w-10 text-sm font-bold hover:opacity-90 disabled:opacity-40 touch-manipulation"
              >
                A+
              </button>
            </div>
            <button
              type="button"
              onClick={() => setCracktroOpen(true)}
              className="min-h-11 px-3 py-2 uppercase text-xs tracking-widest rounded-sm border border-primary/60 bg-card/60 text-primary hover:bg-primary hover:text-primary-foreground transition-colors touch-manipulation shrink-0"
              title="Open cracktro scroller mode in a window"
            >
              ▶ Scroller Mode
            </button>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="min-h-11 px-3 py-2 uppercase text-xs tracking-widest rounded-sm border border-border bg-card/60 text-foreground hover:bg-card transition-colors touch-manipulation shrink-0"
                  title="More settings"
                  aria-label="Settings"
                >
                  ⚙ Settings
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-2 flex flex-col gap-2" style={{ fontSize: "16px" }}>
                <button
                  type="button"
                  onClick={() => setScanlines((s) => !s)}
                  aria-pressed={scanlines}
                  title="Toggle CRT scanlines"
                  className="min-h-10 px-2 py-2 text-xs uppercase tracking-widest rounded-sm border border-border bg-card/60 text-foreground hover:opacity-90 touch-manipulation text-left"
                >
                  Scanlines: {scanlines ? "On" : "Off"}
                </button>
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground px-1">Visualizer</label>
                <select
                  value={vizStyle}
                  onChange={(e) => setVizStyle(e.target.value as VisualizerStyle)}
                  aria-label="Visualizer style"
                  className="min-h-10 px-2 py-2 text-xs uppercase tracking-widest rounded-sm border border-border bg-card/60 text-foreground hover:opacity-90 touch-manipulation"
                >
                  {VIZ_STYLES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <ReactivityDrawer>
                  <button
                    type="button"
                    className="min-h-10 px-2 py-2 uppercase text-xs tracking-widest rounded-sm border border-border bg-card/60 text-foreground hover:bg-card transition-colors touch-manipulation text-left"
                    title="Tune audio reactivity per visualizer"
                  >
                    ♪ Reactivity…
                  </button>
                </ReactivityDrawer>
                <button
                  type="button"
                  onClick={() => setPerfTipsOpen(true)}
                  className="min-h-10 px-2 py-2 uppercase text-xs tracking-widest rounded-sm border border-border bg-card/60 text-foreground hover:bg-card transition-colors touch-manipulation text-left"
                  title="Performance tips and how to report issues"
                >
                  ⚡ Performance tips
                </button>
                <button
                  type="button"
                  onClick={() => setDiagnosticsOpen((v) => !v)}
                  className="min-h-10 px-2 py-2 uppercase text-xs tracking-widest rounded-sm border border-border bg-card/60 text-foreground hover:bg-card transition-colors touch-manipulation text-left"
                  aria-pressed={diagnosticsOpen}
                >
                  Diagnostics: {diagnosticsOpen ? "On" : "Off"}
                </button>
                <div className="pt-1 border-t border-border">
                  <LastfmButton />
                </div>
              </PopoverContent>
            </Popover>
            <button
              onClick={refreshAll}
              className="min-h-11 px-3 py-2 bg-primary text-primary-foreground uppercase text-xs tracking-widest rounded-sm hover:opacity-90 transition-opacity touch-manipulation shrink-0"
              style={{ boxShadow: "var(--glow-primary)" }}
            >
              Refresh
            </button>
          </div>
        </header>

        <div style={{ zoom: contentZoom } as React.CSSProperties}>
        <div className="mb-4">
          <AudioPlayer
            streams={streams}
            currentTrack={now}
            currentSongId={now?.songId}
            onAnalyserReady={setAnalyser}
            onSeek={() => setSeekCount((c) => c + 1)}
          />
        </div>

        <section className="grid gap-4 md:grid-cols-2 min-w-0" aria-label="Demovibes panels">
          <article
            className="panel md:order-2 min-w-0 overflow-hidden transition-shadow duration-100"
            style={{
              boxShadow:
                audioLevel > 0
                  ? `0 0 ${8 + audioLevel * 40}px hsl(var(--primary) / ${0.25 + audioLevel * 0.6})`
                  : undefined,
            }}
          >
            <button
              type="button"
              onClick={() => setNowOpen((o) => !o)}
              className="panel-heading w-full !mb-0 flex items-center justify-between text-left hover:opacity-90"
              aria-expanded={nowOpen}
            >
              <span>{nowOpen ? "▼" : "▶"} Currently Playing</span>
            </button>
            {nowOpen && (
              <div className="mt-3">
                {now ? (
                  <>
                    <p
                      className="text-lg font-bold neon break-words"
                      style={
                        audioLevel > 0
                          ? {
                              textShadow: `0 0 ${4 + audioLevel * 24}px hsl(var(--primary) / ${0.5 + audioLevel * 0.5}), 0 0 ${2 + audioLevel * 8}px hsl(var(--primary) / 0.8)`,
                            }
                          : undefined
                      }
                    >
                      <ExtLink href={songUrl(now.songId)}>{now.song}</ExtLink> <SongPlatform songId={now.songId} />{" "}
                      <SongRating songId={now.songId} />
                    </p>
                    <p className="text-sm text-muted-foreground mb-3">
                      by <ExtLink href={artistUrl(now.artistId)}>{now.artist}</ExtLink>
                    </p>
                    <p className="text-sm">
                      Requested By:{" "}
                      <ExtLink href={userUrl(now.requester)} className="text-foreground">
                        {now.requester}
                      </ExtLink>
                    </p>
                    <p className="text-sm">
                      Length: <span className="text-foreground">{formatDuration(now.lengthSec)}</span>
                    </p>
                    <p className="text-sm">
                      Time Left: <span className="text-foreground">{timeLeft}</span>
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">No track info yet…</p>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => setQueueOpen((o) => !o)}
              className="panel-heading mt-6 w-full !mb-0 flex items-center justify-between text-left hover:opacity-90"
              aria-expanded={queueOpen}
            >
              <span>{queueOpen ? "▼" : "▶"} Up Next</span>
              <span className="text-muted-foreground text-[10px]">{playlist.queue.length}</span>
            </button>
            {queueOpen && (
              <div className="mt-3">
                {playlist.queue.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Queue is empty.</p>
                ) : (
                  <ol className="space-y-1 text-sm list-decimal list-inside">
                    {playlist.queue.map((q, i) => (
                      <li key={`q-${i}`} className="break-words">
                        <ExtLink href={artistUrl(q.artistId)} className="neon-accent">
                          {q.artist}
                        </ExtLink>{" "}
                        — <ExtLink href={songUrl(q.songId)}>{q.song}</ExtLink> <SongPlatform songId={q.songId} />{" "}
                        <SongRating songId={q.songId} />{" "}
                        <span className="text-xs text-muted-foreground">
                          ({formatDuration(q.lengthSec)} · req{" "}
                          <ExtLink href={userUrl(q.requester)}>{q.requester}</ExtLink>)
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => setHistoryOpen((o) => !o)}
              className="panel-heading mt-6 w-full !mb-0 flex items-center justify-between text-left hover:opacity-90"
              aria-expanded={historyOpen}
            >
              <span>{historyOpen ? "▼" : "▶"} Recently Played</span>
              <span className="text-muted-foreground text-[10px]">{playlist.history.length}</span>
            </button>
            {historyOpen && (
              <div className="mt-3">
                {playlist.history.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No history.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {playlist.history.map((h, i) => (
                      <li key={`h-${i}`} className="break-words">
                        <ExtLink href={artistUrl(h.artistId)} className="neon-accent">
                          {h.artist}
                        </ExtLink>{" "}
                        — <ExtLink href={songUrl(h.songId)}>{h.song}</ExtLink> <SongPlatform songId={h.songId} />{" "}
                        <SongRating songId={h.songId} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </article>

          <article className="panel md:order-1 min-w-0 overflow-hidden">
            <button
              type="button"
              onClick={() => setOnelinerOpen((o) => !o)}
              className="panel-heading w-full !mb-0 flex items-center justify-between text-left hover:opacity-90"
              aria-expanded={onelinerOpen}
            >
              <span>{onelinerOpen ? "▼" : "▶"} Infamous OneLiner</span>
              <span className="flex items-center gap-2">
                {onelinerOpen && oneliners.length > 0 && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOnelinerExpanded((x) => !x);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        setOnelinerExpanded((x) => !x);
                      }
                    }}
                    className="text-primary text-[10px] uppercase tracking-widest hover:underline"
                  >
                    {onelinerExpanded ? "Collapse" : "Expand"}
                  </span>
                )}
                <span className="text-muted-foreground text-[10px]">{oneliners.length}</span>
              </span>
            </button>
            {onelinerOpen && (
              <>
                <div className={`space-y-2 mt-3 pr-1 ${onelinerExpanded ? "" : "max-h-72 overflow-y-auto"}`}>
                  {oneliners.length === 0 ? (
                    <p className="text-muted-foreground text-sm">Awaiting transmission…</p>
                  ) : (
                    oneliners.map((entry, i) => (
                      <article key={i} className="border-l-2 border-accent/60 pl-2 py-1">
                        <div className="flex items-baseline gap-2 text-xs">
                          <span className="neon-accent font-bold">
                            <Flag code={entry.flag} />
                            <ExtLink href={userUrl(entry.username)}>{entry.username}</ExtLink>
                          </span>
                          <span className="text-muted-foreground">({formatOnelinerTime(entry.time)})</span>
                        </div>
                        <p className="text-sm leading-snug mt-0.5 [overflow-wrap:anywhere] break-words">
                          {renderBBCode(entry.text)}
                        </p>
                      </article>
                    ))
                  )}
                </div>
                <p className="mt-3 text-xs">
                  <a
                    href="https://scenestream.net/demovibes/oneliner/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    » Oneliner History
                  </a>
                </p>
              </>
            )}

            <button
              type="button"
              onClick={() => setOnlineOpen((o) => !o)}
              className="panel-heading mt-6 w-full !mb-0 flex items-center justify-between text-left hover:opacity-90"
              aria-expanded={onlineOpen}
            >
              <span>{onlineOpen ? "▼" : "▶"} Who's Online?</span>
              <span className="text-muted-foreground text-[10px]">{usersTotal}</span>
            </button>
            {onlineOpen && (
              <div className="mt-3">
                <p className="text-sm">
                  There are a total of <span className="neon-accent font-bold">{usersTotal}</span> users online now:
                </p>
                <div className="text-sm mt-2 text-muted-foreground flex flex-wrap gap-x-2 gap-y-1 break-words">
                  {users.length > 0
                    ? users.map((u, i) => (
                        <span key={`${u.name}-${i}`} className="inline-flex items-center max-w-full break-all">
                          <Flag code={u.flag} />
                          <ExtLink href={userUrl(u.name)}>{u.name}</ExtLink>
                          {i < users.length - 1 ? "," : ""}
                        </span>
                      ))
                    : "-"}
                </div>
              </div>
            )}

            <div className="mt-6">
              <button
                type="button"
                onClick={() => setStreamsOpen((open) => !open)}
                className="panel-heading w-full !mb-0 flex items-center justify-between text-left hover:opacity-90"
                aria-expanded={streamsOpen}
              >
                <span>{streamsOpen ? "▼" : "▶"} Live Streams</span>
                <span className="text-muted-foreground text-[10px]">{streams.length}</span>
              </button>
              {streamsOpen && (
                <div className="mt-3">
                  {streams.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No streams listed.</p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {streams.map((s, i) => (
                        <li key={`s-${i}`}>
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline break-all"
                          >
                            ▶ {s.name || s.url}
                          </a>{" "}
                          <span className="text-xs text-muted-foreground">
                            {[s.bitrate && `${s.bitrate}kbps`, s.type].filter(Boolean).join(" · ")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </article>
        </section>

        <p className="text-xs text-muted-foreground mt-6 text-center" aria-live="polite">
          {status}
        </p>

        <footer className="mt-10 text-center text-xs text-muted-foreground">
          this is a compact viewer made by Qumran of the amazing Nectarine Demoscene Radio -{" "}
          <a
            className="text-primary hover:underline"
            href="https://scenestream.net/"
            target="_blank"
            rel="noopener noreferrer"
          >
            https://scenestream.net/
          </a>
          {" · "}
          <button
            type="button"
            onClick={() => setChangelogOpen(true)}
            className="text-primary hover:underline uppercase tracking-widest"
            title="View changelog"
          >
            v{APP_VERSION}
          </button>
        </footer>
        </div>
      </main>
    </div>
  );
};

export default Index;
