import React, { useCallback, useEffect, useRef, useState } from "react";
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
import Visualizer, { useAudioLevel, useBpm, type VisualizerStyle } from "@/components/Visualizer";
import BeatOverlay from "@/components/BeatOverlay";
import { setBpm } from "@/lib/gooseBeat";
import Cracktro from "@/components/Cracktro";
import ChangelogModal, { APP_VERSION } from "@/components/ChangelogModal";
import Flag from "@/components/Flag";
import { renderWithSmileys } from "@/lib/smileys";
import { renderBBCode } from "@/lib/bbcode";
import { getCachedInfo, requestInfo, subscribe as subscribeEntities } from "@/lib/entityCache";
import { hydrateCloudLexiconOnce } from "@/lib/gooseLexiconCloud";

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

type ThemeId = "legacy" | "nectalift" | "nostalgia";
const THEMES: { id: ThemeId; label: string; attr: string | null }[] = [
  { id: "nostalgia", label: "Blue blue", attr: "workbench" },
  { id: "legacy", label: "CRT", attr: null },
  { id: "nectalift", label: "B & W", attr: "gem" },
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
  const [tick, setTick] = useState(0);
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
  const [bpmDebugOpen, setBpmDebugOpen] = useState(false);
  const [cracktroOpen, setCracktroOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [seekCount, setSeekCount] = useState(0);

  useEffect(() => {
    try {
      localStorage.setItem(VIZ_STORAGE_KEY, vizStyle);
    } catch {
      // ignore
    }
  }, [vizStyle]);

  useEffect(() => {
    void hydrateCloudLexiconOnce();
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
    const target = fontScale * 16;
    // Cap font-size so frames never exceed viewport width on small screens.
    // ~22 root-em units of width keeps panels readable without horizontal overflow.
    document.documentElement.style.fontSize = `min(${target}px, calc(100vw / 22))`;
    try {
      localStorage.setItem("nectarine-font-scale", String(fontScale));
    } catch {
      // ignore
    }
    return () => {
      document.documentElement.style.fontSize = "";
    };
  }, [fontScale]);

  const adjustFont = (delta: number) =>
    setFontScale((s) => Math.min(1.6, Math.max(0.7, Math.round((s + delta) * 10) / 10)));

  const [theme, setTheme] = useState<ThemeId>(() => {
    try {
      const v = localStorage.getItem(THEME_STORAGE_KEY) as ThemeId | null;
      if (v && THEMES.some((t) => t.id === v)) return v;
    } catch {
      // ignore
    }
    return "legacy";
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
    const id = window.setInterval(refreshAll, AUTO_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [refreshAll]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const now = playlist.now;
  const timeLeft = now ? computeTimeLeft(now.playstart, now.lengthSec) : "-";
  const trackKey = now
    ? `${now.artist ?? ""}||${now.song ?? ""}||${now.playstart ?? ""}||${seekCount}`
    : `seek-${seekCount}`;
  const {
    bpm,
    beatIndex,
    beatCount,
    status: bpmStatus,
    beatTimes,
    windowMs,
    lastComputeAt,
    lastBass,
    period,
    phaseErrorMs,
    confidence,
  } = useBpm(analyser, true, trackKey);
  void tick;

  // Publish BPM to the lightweight shared store so non-React renderers
  // (e.g. the parked BoingBall) can sync small animations to the beat.
  useEffect(() => {
    if (bpm > 0) setBpm(bpm);
  }, [bpm]);

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
        <header className="flex flex-col gap-3 mb-5 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
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
            <button
              type="button"
              onClick={() => setScanlines((s) => !s)}
              aria-pressed={scanlines}
              title="Toggle CRT scanlines"
              className="min-h-11 px-2 py-2 text-xs uppercase tracking-widest rounded-sm border border-border bg-card/60 text-foreground hover:opacity-90 touch-manipulation"
            >
              Scanlines: {scanlines ? "On" : "Off"}
            </button>
            <select
              value={vizStyle}
              onChange={(e) => setVizStyle(e.target.value as VisualizerStyle)}
              aria-label="Visualizer style"
              className="min-h-11 px-2 py-2 text-xs uppercase tracking-widest rounded-sm border border-border bg-card/60 text-foreground hover:opacity-90 touch-manipulation flex-1 min-w-0 md:flex-none"
            >
              {VIZ_STYLES.map((s) => (
                <option key={s} value={s}>
                  {s}
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
              title="Fullscreen cracktro with sinus scroller"
            >
              ▶ Fullscreen
            </button>
            <button
              onClick={refreshAll}
              className="min-h-11 px-3 py-2 bg-primary text-primary-foreground uppercase text-xs tracking-widest rounded-sm hover:opacity-90 transition-opacity touch-manipulation shrink-0"
              style={{ boxShadow: "var(--glow-primary)" }}
            >
              Refresh
            </button>
          </div>
        </header>

        <div className="mb-4">
          <AudioPlayer
            streams={streams}
            currentTrack={now}
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
                    <div className="mt-3 flex items-center gap-3 flex-wrap">
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">BPM</span>
                      <span
                        className="neon-accent font-bold tabular-nums text-sm min-w-[2.5ch] inline-block"
                        title="Detected tempo from bass kicks"
                      >
                        {bpm > 0 ? bpm : "--"}
                      </span>
                      <div
                        className="flex items-center gap-1"
                        role="img"
                        aria-label={`Beat grid, step ${beatIndex + 1} of 4`}
                      >
                        {[0, 1, 2, 3].map((i) => {
                          const active = bpm > 0 && i === beatIndex;
                          return (
                            <span
                              key={i}
                              className="block rounded-sm border border-border transition-all duration-75"
                              style={{
                                width: "0.85rem",
                                height: "0.85rem",
                                background: active ? "hsl(var(--primary))" : "hsl(var(--muted) / 0.4)",
                                boxShadow: active ? `0 0 ${6 + audioLevel * 16}px hsl(var(--primary) / 0.9)` : "none",
                                transform: active ? "scale(1.15)" : "scale(1)",
                              }}
                            />
                          );
                        })}
                      </div>
                      {(() => {
                        const dot =
                          bpmStatus === "locked"
                            ? "hsl(var(--primary))"
                            : bpmStatus === "detecting"
                              ? "#facc15"
                              : bpmStatus === "listening"
                                ? "#38bdf8"
                                : bpmStatus === "silent"
                                  ? "hsl(var(--muted-foreground))"
                                  : "#ef4444";
                        const label =
                          bpmStatus === "locked"
                            ? `locked (${bpm})`
                            : bpmStatus === "detecting"
                              ? "detecting…"
                              : bpmStatus === "listening"
                                ? "listening…"
                                : bpmStatus === "silent"
                                  ? "silent (no audio energy)"
                                  : "no audio";
                        return (
                          <span
                            className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground"
                            title={`BPM status: ${label}`}
                          >
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: dot,
                                boxShadow: `0 0 6px ${dot}`,
                              }}
                            />
                            {label}
                          </span>
                        );
                      })()}
                      <button
                        type="button"
                        onClick={() => setBpmDebugOpen((v) => !v)}
                        className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                        aria-expanded={bpmDebugOpen}
                      >
                        {bpmDebugOpen ? "hide debug" : "debug"}
                      </button>
                    </div>
                    {bpmDebugOpen && (
                      <div className="mt-2 p-2 border border-border rounded bg-muted/20 text-[11px] font-mono leading-snug">
                        <div>
                          status: <span className="text-foreground">{bpmStatus}</span>
                        </div>
                        <div>
                          bpm: <span className="text-foreground">{bpm || "--"}</span> · period:{" "}
                          <span className="text-foreground">{Math.round(period)}ms</span>
                        </div>
                        <div>
                          confidence: <span className="text-foreground">{confidence.toFixed(2)}</span> · phase err:{" "}
                          <span className="text-foreground">
                            {phaseErrorMs >= 0 ? "+" : ""}
                            {Math.round(phaseErrorMs)}ms
                          </span>
                        </div>
                        <div>
                          window: <span className="text-foreground">{Math.round(windowMs / 1000)}s</span>
                        </div>
                        <div>
                          metronome ticks in window: <span className="text-foreground">{beatTimes.length}</span> (total{" "}
                          {beatCount})
                        </div>
                        <div>
                          last bass envelope: <span className="text-foreground">{lastBass.toFixed(3)}</span>
                        </div>
                        <div>
                          last compute:{" "}
                          <span className="text-foreground">
                            {lastComputeAt ? `${Math.round((performance.now() - lastComputeAt) / 1000)}s ago` : "—"}
                          </span>
                        </div>
                        <div className="mt-1">beat timestamps (ms, relative to now):</div>
                        <div className="text-foreground break-all">
                          {beatTimes.length === 0
                            ? "—"
                            : beatTimes.map((t) => `-${Math.round(performance.now() - t)}`).join(", ")}
                        </div>
                      </div>
                    )}
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
      </main>
    </div>
  );
};

export default Index;
