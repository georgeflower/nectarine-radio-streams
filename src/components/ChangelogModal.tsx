import React, { useEffect, useRef } from "react";

export const APP_VERSION = "0.7.8";

interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.7.8",
    date: "2026-08-16",
    changes: [
      "Added two small indicator lights in the Currently Playing heading: the first lights when the current track's now-playing is sent to Last.fm, the second when a scrobble is accepted",
      "The now-playing announcement now retries once if it fails, instead of being silently dropped",
      "Last.fm failures are no longer swallowed, so a broken connection is visible instead of showing up days later as an empty profile",
      "Added a toggle in the Playback Diagnostics panel to hide the Last.fm indicator lights",
      "Stream telemetry now records live-edge corrections, and old telemetry rows are pruned automatically after 90 days",
      "Fixed a redundant metadata request on every track change",
      "An available update is now offered again if the first notification is missed",
    ],
  },
  {
    version: "0.7.7",
    date: "2026-08-14",
    changes: [
      "Fixed playback suddenly jumping back several minutes to a track that already played: a stream that ends now forces a fresh reconnect at the live edge instead of resuming from the start of the buffered audio",
      "Added a live-edge watchdog that quietly catches playback up when it drifts behind the live stream, with a gentle speed-up for small drift and a seek for large drift",
      "Buffered streaming hardened: old audio is trimmed proactively, failed buffer appends now retry instead of silently stalling, the connection keeps reading while paused so the server does not drop it, and the replayed burst after a reconnect is skipped",
      "Last.fm now-playing is announced when you press play in the middle of a track, instead of staying silent until the next song",
      "Listening-time telemetry no longer counts paused time, so stream reliability figures reflect actual playback",
      "Network-change logging now reports the decision actually taken, rather than a separate heuristic",
    ],
  },
  {
    version: "0.7.6",
    date: "2026-08-13",
    changes: [
      "Fixed frozen track title and artist on car Bluetooth displays: metadata polling now continues while audio plays in the background instead of stopping when the app is hidden",
      "Fixed background listening only scrobbling one track per session, caused by the same paused-polling bug",
      "Track changes now update instantly — a refresh is scheduled for the moment the current track is due to end, rather than waiting out the 30-second interval",
      "Background polling while hidden is now a single lightweight request instead of four, and stops entirely when playback is paused",
      "Removed unused seek-tracking state and a leftover unused import",
    ],
  },
  {
    version: "0.7.5",
    date: "2026-08-13",
    changes: [
      "Made playback resilient to VPN-induced connection resets: direct HTTPS streams on desktop bypass the proxy, repeated MEDIA_ERR_NETWORK errors trigger failover, and direct streams rank higher",
      "Last.fm scrobbling reliability fixes: the API key is now served from the edge function, paused time is excluded from scrobble duration, and the final track of a session is scrobbled on page close",
      "Stopped scrobbling tracks that were never actually heard, and guarded now-playing updates so they only fire while audio is running",
      "Isolated the one-second 'Time Left' countdown so it no longer re-renders the entire page every second",
      "XML refresh now pauses while the tab is hidden and resumes immediately when the tab becomes visible",
      "Removed unused react-router dependency and cleaned up stale scene-era persistence and tests",
    ],
  },
  {
    version: "0.7.4",
    date: "2026-07-31",
    changes: [
      "Anonymous stream failure telemetry: connect, error, stall, failover and network-handover events are logged to the cloud to find flaky streams",
      "Playback now survives wifi ↔ mobile data handovers: real media errors and connection changes trigger an immediate forced reconnect",
      "Stream failover enabled on mobile, with a cooldown so a failing stream is not retried straight away",
      "Streams are now ranked to always aim for 192 kbps, with unreliable streams pushed to the bottom",
      "Chronically failing streams (5+ observations, under 50% success) are automatically deprioritised",
      "New Stream reliability section in the playback diagnostics panel: connects, failures, success rate and average seconds played before failure, with manual refresh",
    ],
  },
  {
    version: "0.7.3",
    date: "2026-07-23",
    changes: [
      "Fixed Last.fm scrobbling for tracks shorter than 240s: previous track is now scrobbled on track change if it reached 30–1800 seconds of play time",
      "Fixed production version polling on the published site by removing the blanket .lovable.app preview-host check",
      "Added cold-start freshness check that reloads once if a stale build is detected on launch, with a session-scoped guard to prevent infinite reload loops",
      "Tuned default reactivity values for Tunnel, Bars, Oscilloscope, Rings, and Particles visualizers based on the latest screenshots",
    ],
  },
  {
    version: "0.7.2",
    date: "2026-07-07",
    changes: [
      "Rapture Mode: master toggle in the cracktro settings that controls both geese and procreation at once",
      "Cracktro settings reorganized: Geese section renamed to Rapture Mode, Goose Stats moved in, Boing and Diag moved to More",
      "Removed purple nebula shimmer glow from the starfield visualizer for a cleaner look",
      "Six new themes inspired by scenestream demovibes: Goat Gray, Pony, Splash of Orange, Nostalgia-C, Original, and Simple",
      "Plasma visualizer default reactivity tuned to match the featured screenshot",
    ],
  },
  {
    version: "0.7.1",
    date: "2026-07-03",
    changes: [
      "Starfield visualizer: audio-reactive comets with gradient tails, nebula shimmer, and treble-driven sparkle bursts",
      "Bass reactivity shifted to low-mids for tighter sync with kick drums",
      "Adaptive low-power quality mode: auto-downgrades rendering tier when FPS drops, upgrades when smooth",
      "Quality tiers (high / medium / low) scale star/particle counts, glow, and effect complexity automatically",
      "Audio reactivity tuning: side drawer with tunable frequency ranges (bass/low-mid/mid/treble), beat and sparkle thresholds, and master intensity",
      "Per-visualizer overrides: bass/mid/treble gain, motion and glow intensity for each mode with a one-click reset",
      "Firefox performance warning banner and cracktro scroller notice",
      "Settings persisted per browser; reset-to-defaults button",
      "Added Performance tips modal with browser recommendations, reactivity tuning guidance, and issue reporting links",
      "Performance tips modal and reactivity drawer open without dimming the page behind them",
      "Per-mode effect controls in the reactivity drawer: tune comets and sparkles (starfield), bar count/decay/hue spread (bars), plasma cell size/color speed/complexity, oscilloscope thickness/amplitude/trail, tunnel slices/sides/curve/twist, ring count/length/speed, and particle kick/friction/count",
      "Reactivity settings accessible from scroller mode (Visuals → Effect row) and open correctly in both windowed and fullscreen",
      "Reactivity settings persist across the main player and scroller mode (saved automatically to this browser)",
      "Calmer default starfield reactivity (fewer comets, sparser stars & sparkles)",
    ],
  },
  {
    version: "0.7.0",
    date: "2026-07-02",
    changes: [
      "What's New popup: demoscene-styled animated announcement on every version bump with neon border, glitch title, and marquee strip",
      "PWA version check: detects stale cached bundles and auto-reloads with service-worker/cache purge",
      "Playback diagnostics panel: draggable overlay showing reconnect log, stall counters, and current playback mode",
      "Last.fm diagnostic mode: verify API key alignment between frontend and edge function without exposing secrets",
      "Mobile live-edge reload: force fresh stream after long backgrounding to prevent stale audio resumes",
      "Font scaling fixed: A−/A+ now applies CSS zoom to all content while keeping the header at fixed size",
      "Main menu settings popover: Scanlines, Visualizer, Diagnostics, and Last.fm tucked into a single ⚙ button",
      "Cracktro settings reorganized into Visuals · Geese · Panels · More sections with vertical dividers",
    ],
  },
  {
    version: "0.6.9",
    date: "2026-07-01",
    changes: [
      "Detailed reconnect logging: 100-entry ring buffer with platform-tagged timestamps for every stall, resume, and recovery attempt",
      "Robust mobile stall detection using actual media clock progress instead of timer heuristics",
      "Soft resume on mobile: same-source play() call avoids full reconnect storms on brief stalls",
      "Forced MediaSession setPositionState to clear bogus 6:42 duration displays on live streams",
      "Prioritized HTTPS stream sources on mobile to reduce proxy-induced disconnects",
      "AudioPlayer stabilized: deduplicated playUrl calls, swallowed benign AbortErrors, 8-second MSE buffering grace on desktop",
    ],
  },
  {
    version: "0.6.8",
    date: "2026-07-01",
    changes: [
      "Main menu decluttered: Scanlines, Visualizer style, Diagnostics and Last.fm moved into a ⚙ Settings popover",
      "Font size A−/A+ now scales only the main content; header buttons stay fixed size",
      "Cracktro settings bar reorganized into Visuals · Geese · Panels · More sections with vertical dividers",
      "Removed Scene Eras feature and all related state / persistence / UI",
    ],
  },
  {
    version: "0.6.7",
    date: "2026-06-30",
    changes: [
      "Last.fm scrobbling: connect/disconnect from main page and Cracktro settings; now-playing + scrobble at 50% / 240s",
      "Mobile background playback fixed: skip Web Audio routing and MSE on phones so iOS/Android keep playing when backgrounded",
      "Auto-resume watchdog re-kicks playback on visibility / pageshow / network-online / focus",
      "Stall timer paused while tab is hidden to avoid false reconnect storms",
      "Allow up to 200% pinch zoom on mobile; Cracktro defaults to windowed mode with 'Fullscreen ⤢' toggle",
      "Renamed launch button to 'Scroller Mode'",
      "Security: bumped @supabase/supabase-js and react-router-dom; removed unused recharts / lodash transitives",
    ],
  },
  {
    version: "0.6.6",
    date: "2026-06-24",
    changes: [
      "MediaSession artwork fallback now uses the app icon when no song screenshot is available",
      "Removed platform-icon fallback from lockscreen artwork",
    ],
  },
  {
    version: "0.6.5",
    date: "2026-06-24",
    changes: [
      "Lockscreen artwork on iOS / Android via MediaSession API",
      "Two-step screenshot resolution: song page -> screenshot page (IDs no longer assumed equal)",
      "GIF screenshots proxied through wsrv.nl as PNG for iOS compatibility",
    ],
  },
  {
    version: "0.6.4",
    date: "2026-06-22",
    changes: [
      "Goose Amiga / Atari platform banter on track change (skips every second consecutive same-platform track)",
      "Periodic 'Have you seen Rapture?' goose routine every 10 minutes",
      "Mobile screen wake lock keeps display active while the app is open",
    ],
  },
  {
    version: "0.6.3",
    date: "2026-06-13",
    changes: [
      "Reworked BPM detection with multi-band tempogram for accuracy across chiptune, breakbeat and ambient",
      "Added subtle cracktro audio controls (play / stop / stream) that fade in on mouse movement",
      "Added tutorial hints pointing to settings and ball-shelf click interaction",
      "Improved favicon: transparent background and larger tab icon",
    ],
  },
  {
    version: "0.6.2",
    date: "2026-06-10",
    changes: [
      "Updated favicon with cream nectarine accent",
      "Fixed Boing ball shelf return after parking",
      "Fixed canvas shadowBlur to use glow() for wider browser support",
    ],
  },
  {
    version: "0.6.1",
    date: "2026-06-08",
    changes: [
      "Unified sim and non-sim goose behavior using non-sim as baseline",
      "One-time localStorage migration forces goose life sim on for returning users",
      "Fixed goose procreation flow (egg → gosling → adult)",
      "Procreation defaults to OFF; toggle available in Cracktro settings",
      "Parked Boing ball stays parked until manually unparked",
    ],
  },
  {
    version: "0.6.0",
    date: "2026-06-07",
    changes: [
      "Added goose procreation: geese lay eggs, hatch goslings and grow a family",
      "Brown goose variant added (separate toggle)",
      "Boing ball shelf park/unpark: manually park the ball on a shelf",
      "Made ball-parking fully manual (no auto-park timer)",
      "Restored classic goose interactions alongside simulation mode",
      "Egg hatch timer set to 3 minutes",
    ],
  },
  {
    version: "0.5.3",
    date: "2026-06-04",
    changes: [
      "Throttled goose ball-play restarts to prevent constant replays",
      "Biased goose dialogue toward underused lines for more variety",
      "Set CRT-era startup defaults for theme and cracktro controls",
      "Fixed malformed JSX in Cracktro era/exit HUD block",
    ],
  },
  {
    version: "0.5.2",
    date: "2026-06-04",
    changes: [
      "Added 500 demoscene goose dialogue pairs for idle chatter",
      "Wired rule-based goose lexicon chatter into dialogue system",
      "Optional long-session scene eras (intro → warmed → party → veteran)",
      "Cracktro scroller made time-based (frame-rate independent)",
      "FPS diagnostics counter with low-performance goose commentary",
      "Enhanced bird collision mechanics and resting duration",
    ],
  },
  {
    version: "0.5.1",
    date: "2026-06-04",
    changes: [
      "Added in-stage top-left Cracktro exit button (auto-hides with chrome)",
      "Exit button hides when settings chrome is hidden",
      "Removed Cracktro windowed fallback on fullscreen exit",
      "Enabled default visual widgets on cracktro startup",
    ],
  },
  {
    version: "0.5.0",
    date: "2026-06-04",
    changes: [
      "Reworked geese gameplay to physics-based bumping",
      "Added goose snack-break cycle: beak bag & eating states",
      "Scaled goose/ball scene with viewport size",
      "Cracktro settings are collapsed by default, expand on click",
      "Fixed goose landing: nearest-perch snacking + stamina-driven resting",
      "Re-anchored perched geese to live perch geometry on resize",
      "Fixed geese sitting during active ball-play sessions",
    ],
  },
  {
    version: "0.4.2",
    date: "2026-06-04",
    changes: [
      "Fixed geese ball game physics",
    ],
  },
  {
    version: "0.4.1",
    date: "2026-06-03",
    changes: [
      "7 requestAnimationFrame/render optimisations across visualizer, cracktro, and UI",
      "Shared analyser frequency data frames across rAF hooks",
    ],
  },
  {
    version: "0.4.0",
    date: "2026-05-28",
    changes: [
      "Added flying goose character with full physics and perching",
      "Added Amiga Boing Ball physics simulation",
      "Geese play ball — kick & fetch game mechanics",
      "Goose social dialogue and speech bubbles",
    ],
  },
  {
    version: "0.3.0",
    date: "2026-05-20",
    changes: [
      "Fullscreen cracktro mode with animated sinus scroller",
      "Multiple scroller modes: Sinus, Bouncy, Zoomer, Wobble, Copper, Vector",
      "Multiple font skins: XM, Amiga, Atari, C64, Default",
      "Floating draggable panels in cracktro: Oneliner, Online, Queue, History, Roster",
      "Song rating chatter from geese on track change",
      "Auto fullscreen request on cracktro open",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-05-10",
    changes: [
      "Multiple visualizer styles: Starfield, Bars, Plasma, Oscilloscope, Tunnel, Rings, Particles",
      "Beat overlay synced to audio",
      "BPM detection from audio (bass kick analysis)",
      "Beat grid display in Now Playing panel",
      "Themes: CRT, Blue blue (Workbench), B&W (Gem)",
      "CRT scanlines toggle",
      "Font size adjustment controls",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-04-28",
    changes: [
      "Core UI panel layout: Now Playing, Queue, History, Oneliner, Online, Live Streams",
      "Collapsible sections with persisted open/closed state",
      "Nectarine radio API integration with auto-refresh",
      "BBCode rendering for oneliner messages",
      "Country flags for users",
      "Links to Nectarine profiles (songs, artists, users, platforms)",
      "Media Session API integration for OS-level playback controls",
    ],
  },
  {
    version: "0.0.1",
    date: "2026-04-17",
    changes: [
      "Initial release",
      "Audio player with multi-stream support, failover and retry logic",
      "Proxied stream playback via Supabase edge function",
      "MSE (Media Source Extensions) buffered stream support",
      "Volume control with vertical slider",
      "Now Playing metadata display",
    ],
  },
];

interface ChangelogModalProps {
  onClose: () => void;
}

const ChangelogModal: React.FC<ChangelogModalProps> = ({ onClose }) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[10000]"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-lg mx-4 bg-background border border-border rounded-sm shadow-lg flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <span className="text-xs uppercase tracking-widest font-bold text-foreground">
            Changelog{" "}
            <span className="neon-accent">· v{APP_VERSION}</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors ml-4 text-base leading-none"
            aria-label="Close changelog"
          >
            ✕
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {CHANGELOG.map((entry) => (
            <div key={entry.version}>
              <div className="flex items-baseline gap-3 mb-1.5">
                <span className="neon-accent text-xs uppercase tracking-widest font-bold">
                  v{entry.version}
                </span>
                <span className="text-[10px] text-muted-foreground tracking-widest uppercase">
                  {entry.date}
                </span>
              </div>
              <ul className="flex flex-col gap-0.5 pl-3">
                {entry.changes.map((change, i) => (
                  <li key={i} className="text-xs text-muted-foreground before:content-['—'] before:mr-2 before:text-border">
                    {change}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ChangelogModal;
