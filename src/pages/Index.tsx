import { useCallback, useEffect, useRef, useState } from "react";
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
  toTitle,
  xmlToPretty,
  type Endpoint,
  type OnelinerEntry,
  type PlaylistData,
  type StreamSource,
} from "@/lib/nectarine";
import AudioPlayer from "@/components/AudioPlayer";
import Visualizer, { type VisualizerStyle } from "@/components/Visualizer";
import Flag from "@/components/Flag";
import { renderWithSmileys } from "@/lib/smileys";

const VIZ_STYLES: VisualizerStyle[] = ["starfield", "bars", "plasma"];
const VIZ_STORAGE_KEY = "nectarine-viz";

type EndpointState = { content: string; ok: boolean };

const EMPTY_PLAYLIST: PlaylistData = { now: null, queue: [], history: [] };

const Index = () => {
  const [playlist, setPlaylist] = useState<PlaylistData>(EMPTY_PLAYLIST);
  const [oneliners, setOneliners] = useState<OnelinerEntry[]>([]);
  const [users, setUsers] = useState<{ name: string; flag: string }[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [streams, setStreams] = useState<StreamSource[]>([]);
  const [sections, setSections] = useState<Record<string, EndpointState>>({});
  const [status, setStatus] = useState("Loading API data...");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
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

      setSections((s) => ({ ...s, [endpoint]: { content: xmlToPretty(xml), ok: true } }));

      if (endpoint === "queue") setPlaylist(parsePlaylist(xml));
      if (endpoint === "oneliner") setOneliners(parseOneliners(xml));
      if (endpoint === "online") {
        const { users, total } = parseOnline(xml);
        setUsers(users);
        setUsersTotal(total);
      }
      if (endpoint === "streams") setStreams(parseStreams(xml));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSections((s) => ({
        ...s,
        [endpoint]: { content: `Failed to load ${endpoint}: ${msg}`, ok: false },
      }));
    }
  }, []);

  const refreshAll = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setStatus("Refreshing...");
    try {
      setOpenSections((prev) => {
        const next = { ...prev };
        for (const e of ENDPOINTS) if (!(e in next)) next[e] = false;
        return next;
      });
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

  // tick each second to update "Time Left"
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const now = playlist.now;
  const timeLeft = now ? computeTimeLeft(now.playstart, now.lengthSec) : "-";
  // reference tick so React re-renders for the timer
  void tick;

  return (
    <div className="crt min-h-screen relative">
      <Visualizer analyser={analyser} />
      <main className="mx-auto max-w-5xl px-4 py-6 md:py-10 relative" style={{ zIndex: 1 }}>
        <header className="flex items-center justify-between mb-6 border-b border-border pb-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold neon tracking-widest uppercase">
              ▌Nectarine API
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Demoscene Radio · Compact viewer
            </p>
          </div>
          <button
            onClick={refreshAll}
            className="px-4 py-2 bg-primary text-primary-foreground uppercase text-xs tracking-widest rounded-sm hover:opacity-90 transition-opacity"
            style={{ boxShadow: "var(--glow-primary)" }}
          >
            Refresh
          </button>
        </header>

        <div className="mb-4">
          <AudioPlayer streams={streams} onAnalyserReady={setAnalyser} />
        </div>

        <section className="grid gap-4 md:grid-cols-2" aria-label="Demovibes panels">
          {/* LEFT: Now Playing + Up Next + History */}
          <article className="panel">
            <h2 className="panel-heading">▶ Currently Playing</h2>
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

            <h3 className="panel-heading mt-6">▶ Up Next</h3>
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

            <h3 className="panel-heading mt-6">▶ Recently Played</h3>
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
          </article>

          {/* RIGHT: Oneliner + Online + Streams */}
          <article className="panel">
            <h2 className="panel-heading">▶ Infamous OneLiner</h2>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
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
                      <span className="text-muted-foreground">
                        ({formatOnelinerTime(entry.time)})
                      </span>
                    </div>
                    <p className="text-sm leading-snug mt-0.5 break-words">
                      {renderWithSmileys(entry.text)}
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

            <h3 className="panel-heading mt-6">▶ Who's Online?</h3>
            <p className="text-sm">
              There are a total of{" "}
              <span className="neon-accent font-bold">{usersTotal}</span> users online now:
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

            <h3 className="panel-heading mt-6">▶ Live Streams</h3>
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
          </article>
        </section>

        <p
          className="text-xs text-muted-foreground mt-6 text-center"
          aria-live="polite"
        >
          {status}
        </p>

        <section className="mt-6 space-y-2" aria-label="All API sections">
          <h2 className="panel-heading !border-0 !mb-2">▶ Raw XML Feeds (debug)</h2>
          {Object.keys(sections).length === 0 && (
            <p className="text-xs text-muted-foreground">No endpoints loaded yet.</p>
          )}
          {Object.entries(sections).map(([endpoint, s]) => {
            const open = openSections[endpoint] ?? false;
            return (
              <div key={endpoint} className="panel !p-0 overflow-hidden">
                <button
                  type="button"
                  onClick={() =>
                    setOpenSections((p) => ({ ...p, [endpoint]: !open }))
                  }
                  className="w-full flex items-center justify-between px-4 py-2 text-left text-xs uppercase tracking-widest hover:bg-secondary/40"
                >
                  <span className={s.ok ? "text-primary" : "text-destructive"}>
                    {open ? "▼" : "▶"} {toTitle(endpoint)}
                  </span>
                  <span className="text-muted-foreground">{endpoint}/</span>
                </button>
                {open && (
                  <pre className="text-[11px] leading-snug px-4 py-3 border-t border-border bg-background/40 overflow-x-auto max-h-80">
                    {s.content}
                  </pre>
                )}
              </div>
            );
          })}
        </section>

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
