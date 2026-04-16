import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AUTO_REFRESH_INTERVAL_MS,
  ENDPOINTS,
  computeTimeLeft,
  fetchEndpoint,
  formatDuration,
  formatOnelinerTime,
  parseOneliners,
  parseOnline,
  parsePlaylist,
  parseStreams,
  parseXml,
  type Endpoint,
  type OnelinerEntry,
  type PlaylistData,
  type StreamSource,
} from "@/lib/nectarine";
import AudioPlayer from "@/components/AudioPlayer";
import Visualizer, { type VisualizerStyle } from "@/components/Visualizer";
import Flag from "@/components/Flag";
import { renderWithSmileys } from "@/lib/smileys";

const VIZ_STYLES: VisualizerStyle[] = ["off", "starfield", "bars", "plasma", "oscilloscope"];
const VIZ_STORAGE_KEY = "nectarine-viz";

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

  useEffect(() => {
    try {
      localStorage.setItem(VIZ_STORAGE_KEY, vizStyle);
    } catch {
      // ignore
    }
  }, [vizStyle]);

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
  void tick;

  return (
    <div className="crt min-h-screen relative">
      <Visualizer analyser={analyser} style={vizStyle} />
      <main className="mx-auto max-w-5xl px-4 py-6 md:py-10 relative" style={{ zIndex: 1 }}>
        <header className="flex flex-col gap-3 mb-6 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold neon tracking-widest uppercase">
              ▌Nectarine API
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Demoscene Radio · Compact viewer
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
            <div
              className="flex items-center gap-1 border border-border rounded-sm p-0.5 bg-card/60"
              role="group"
              aria-label="Visualizer style"
            >
              {VIZ_STYLES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setVizStyle(s)}
                  className={`px-2 py-1 text-[10px] uppercase tracking-widest rounded-sm transition-opacity ${
                    vizStyle === s
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              onClick={refreshAll}
              className="px-4 py-2 bg-primary text-primary-foreground uppercase text-xs tracking-widest rounded-sm hover:opacity-90 transition-opacity"
              style={{ boxShadow: "var(--glow-primary)" }}
            >
              Refresh
            </button>
          </div>
        </header>

        <div className="mb-4">
          <AudioPlayer streams={streams} onAnalyserReady={setAnalyser} />
        </div>

        <section className="grid gap-4 md:grid-cols-2" aria-label="Demovibes panels">
          <article className="panel">
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
                    <p className="text-lg font-bold neon break-words">{now.song}</p>
                    <p className="text-sm text-muted-foreground mb-3">by {now.artist}</p>
                    <p className="text-sm">
                      Requested By: <span className="text-foreground">{now.requester}</span>
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
                        <span className="neon-accent">{q.artist}</span> — {q.song}{" "}
                        <span className="text-xs text-muted-foreground">
                          ({formatDuration(q.lengthSec)} · req {q.requester})
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
                        <span className="neon-accent">{h.artist}</span> — {h.song}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </article>

          <article className="panel">
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
                            {entry.username}
                          </span>
                          <span className="text-muted-foreground">({formatOnelinerTime(entry.time)})</span>
                        </div>
                        <p className="text-sm leading-snug mt-0.5 break-words">{renderWithSmileys(entry.text)}</p>
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
                <p className="text-sm mt-2 text-muted-foreground break-words">
                  {users.length > 0
                    ? users.map((u, i) => (
                        <span key={`${u.name}-${i}`} className="inline-block mr-2">
                          <Flag code={u.flag} />
                          {u.name}
                          {i < users.length - 1 ? "," : ""}
                        </span>
                      ))
                    : "-"}
                </p>
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
          Ported from{" "}
          <a
            className="text-primary hover:underline"
            href="https://github.com/georgeflower/nectarine-demoscene-radio"
            target="_blank"
            rel="noopener noreferrer"
          >
            nectarine-demoscene-radio
          </a>
          . Data: scenestream.net/demovibes
        </footer>
      </main>
    </div>
  );
};

export default Index;
