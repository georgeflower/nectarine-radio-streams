import { useCallback, useEffect, useRef, useState } from "react";
import {
  API_ROOT,
  AUTO_REFRESH_INTERVAL_MS,
  buildStars,
  discoverEndpoints,
  fetchText,
  formatOnelinerTime,
  parseNowPlaying,
  parseOneliners,
  parseUsersDoc,
  parseXml,
  toTitle,
  xmlToPretty,
  type NowPlaying,
  type OnelinerEntry,
} from "@/lib/nectarine";

type EndpointState = { content: string; ok: boolean };

const EMPTY_NOW: NowPlaying = {
  title: "-",
  artist: "-",
  requestedBy: "-",
  timeLeft: "-",
  rating: "-",
  votes: "-",
  numericRating: 0,
};

const Index = () => {
  const [now, setNow] = useState<NowPlaying>(EMPTY_NOW);
  const [oneliners, setOneliners] = useState<OnelinerEntry[]>([]);
  const [users, setUsers] = useState<string[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [sections, setSections] = useState<Record<string, EndpointState>>({});
  const [status, setStatus] = useState("Loading API data...");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const inFlight = useRef(false);

  const loadEndpoint = useCallback(async (endpoint: string) => {
    try {
      const text = await fetchText(`${API_ROOT}${endpoint}`);
      const xml = parseXml(text);
      if (xml.querySelector("parsererror")) throw new Error("Invalid XML response");

      const pretty = xmlToPretty(xml);
      setSections((s) => ({ ...s, [endpoint]: { content: pretty, ok: true } }));

      if (endpoint === "now_playing.xml") setNow(parseNowPlaying(xml));
      if (endpoint === "oneliner.xml") setOneliners(parseOneliners(xml));
      if (endpoint === "users.xml") {
        const { users, total } = parseUsersDoc(xml);
        setUsers(users);
        setUsersTotal(total);
      }
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
      const endpoints = await discoverEndpoints();
      setOpenSections((prev) => {
        const next = { ...prev };
        for (const e of endpoints) if (!(e in next)) next[e] = true;
        return next;
      });
      await Promise.all(endpoints.map(loadEndpoint));
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
        "Compact viewer for the Nectarine demoscene radio API: now playing, oneliner, users online and raw XML feeds.",
      );
    }
    refreshAll();
    const id = window.setInterval(refreshAll, AUTO_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [refreshAll]);

  const ratingText =
    now.rating === "-"
      ? "Rating: -"
      : now.votes === "-"
        ? `Rating: ${now.rating}`
        : `Rating: ${now.rating} (${now.votes} Votes)`;

  return (
    <div className="crt min-h-screen">
      <main className="mx-auto max-w-5xl px-4 py-6 md:py-10">
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

        <section className="grid gap-4 md:grid-cols-2" aria-label="Demovibes panels">
          {/* LEFT: Oneliner + Online */}
          <article className="panel">
            <h2 className="panel-heading">▶ Infamous OneLiner</h2>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {oneliners.length === 0 ? (
                <p className="text-muted-foreground text-sm">Awaiting transmission…</p>
              ) : (
                oneliners.map((entry, i) => (
                  <article key={i} className="border-l-2 border-accent/60 pl-2 py-1">
                    <div className="flex items-baseline gap-2 text-xs">
                      <a
                        href="https://scenestream.net/demovibes/oneliner/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="neon-accent font-bold hover:underline"
                      >
                        {entry.username}
                      </a>
                      <span className="text-muted-foreground">
                        ({formatOnelinerTime(entry.time)})
                      </span>
                    </div>
                    <p className="text-sm leading-snug mt-0.5 break-words">{entry.text}</p>
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
              {users.length > 0 ? users.join(", ") : "-"}
            </p>
          </article>

          {/* RIGHT: Now Playing */}
          <article className="panel">
            <h2 className="panel-heading">▶ Currently Playing</h2>
            <p className="text-lg font-bold neon break-words">{now.title}</p>
            <p className="text-sm text-muted-foreground mb-3">by {now.artist}</p>

            <p className="text-sm">Requested By: <span className="text-foreground">{now.requestedBy}</span></p>
            <p className="text-sm">Time Left: <span className="text-foreground">{now.timeLeft}</span></p>

            <p
              className="text-2xl tracking-widest mt-3 neon-accent"
              aria-label="Track rating"
            >
              {buildStars(now.numericRating)}
            </p>
            <p className="text-xs text-muted-foreground">{ratingText}</p>

            <div className="flex flex-wrap gap-2 mt-4">
              <a
                href="https://scenestream.net/demovibes/streams/"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-primary text-primary-foreground uppercase text-xs tracking-widest rounded-sm"
                style={{ boxShadow: "var(--glow-primary)" }}
              >
                ▶ Listen
              </a>
              <a
                href="https://scenestream.net/demovibes/streams/"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 border border-border text-xs uppercase tracking-widest rounded-sm hover:border-primary transition-colors"
              >
                Streams
              </a>
              <a
                href="https://scenestream.net/demovibes/queue/random/favorites/"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 border border-accent/60 text-accent text-xs uppercase tracking-widest rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                ♥ Queue Random Fav
              </a>
            </div>

            <h3 className="panel-heading mt-6">▶ Important Links</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a className="text-primary hover:underline" href="https://discord.gg/DxNAxsZ" target="_blank" rel="noopener noreferrer">
                  » Discord Chat
                </a>
              </li>
              <li>
                <a className="text-primary hover:underline" href="https://matrix.to/#/#scenestream:matrix.org" target="_blank" rel="noopener noreferrer">
                  » Matrix Chat (bridged to Discord)
                </a>
              </li>
              <li>
                <a className="text-primary hover:underline" href="https://scenestream.net/demovibes/forum/" target="_blank" rel="noopener noreferrer">
                  » Bug Reporting Thread
                </a>
                <p className="text-xs text-muted-foreground">Please report any bugs to this forum thread!</p>
              </li>
              <li>
                <a className="text-primary hover:underline" href="https://scenestream.net/demovibes/forum/" target="_blank" rel="noopener noreferrer">
                  » Correct DB Info
                </a>
                <p className="text-xs text-muted-foreground">Song, artist, etc. corrections go here instead.</p>
              </li>
              <li>
                <a className="text-primary hover:underline" href="https://scenestream.net/demovibes/forum/" target="_blank" rel="noopener noreferrer">
                  » Report Broken Tunes
                </a>
                <p className="text-xs text-muted-foreground">Broken tunes can be reported here.</p>
              </li>
            </ul>
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
            const open = openSections[endpoint] ?? true;
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
                  <span className="text-muted-foreground">{endpoint}</span>
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
