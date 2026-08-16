import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAudioControlState, subscribeAudioControl } from "@/lib/cracktroUi";
import {
  fetchStreamReliability,
  getNetChangeCounts,
  type StreamReliabilityRow,
} from "@/lib/streamTelemetry";
import { isShortRunner, isUnreliable, rankStreams, reliabilityScore } from "@/lib/streamRanking";
import type { StreamSource } from "@/lib/nectarine";
import {
  DEFAULT_WATCHDOG_CONFIG,
  getWatchdogConfig,
  getWatchdogDiagnostics,
  resetWatchdogConfig,
  setWatchdogConfig,
  subscribeWatchdogConfig,
  subscribeWatchdogDiagnostics,
  type WatchdogConfig,
  type WatchdogDiagnostics,
} from "@/lib/playbackWatchdog";
import {
  isLastfmStatusVisible,
  setLastfmStatusVisible,
  subscribeLastfmStatusVisible,
} from "@/lib/lastfm";

type Props = { onClose: () => void };

const STORAGE_POS = "playback-diag-pos-v1";

const fmtTime = (t: number | null): string => {
  if (!t) return "—";
  const delta = Math.floor((Date.now() - t) / 1000);
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ${delta % 60}s ago`;
  return `${Math.floor(delta / 3600)}h ago`;
};

const NumField = ({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix: string;
}) => (
  <label className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
    <span className="truncate">{label}</span>
    <span className="flex items-center gap-1">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="w-16 h-7 px-1 text-right bg-background/60 border border-border rounded-sm text-foreground text-[11px]"
      />
      <span>{suffix}</span>
    </span>
  </label>
);

const pct = (n: number): string => `${Math.round(n * 100)}%`;

const PlaybackDiagnostics = ({ onClose }: Props) => {
  const [rows, setRows] = useState<StreamReliabilityRow[]>([]);
  const [relLoading, setRelLoading] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(
    () => getAudioControlState().selectedUrl,
  );

  useEffect(
    () => subscribeAudioControl(() => setSelectedUrl(getAudioControlState().selectedUrl)),
    [],
  );

  const loadReliability = useCallback(async (forceRefresh = false) => {
    setRelLoading(true);
    try {
      const data = await fetchStreamReliability(forceRefresh);
      setRows(Array.isArray(data) ? data.filter((r) => !!r?.stream_url) : []);
    } catch {
      setRows([]);
    } finally {
      setRelLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReliability(false);
  }, [loadReliability]);

  const relMap = useMemo(() => {
    const m = new Map<string, StreamReliabilityRow>();
    for (const r of rows) if (r.stream_url) m.set(r.stream_url, r);
    return m;
  }, [rows]);

  const rankedRows = useMemo(() => {
    const asStreams: StreamSource[] = rows.map((r) => ({
      name: r.stream_name ?? r.stream_url ?? "stream",
      url: r.stream_url ?? "",
      bitrate: r.bitrate === null || r.bitrate === undefined ? "" : String(r.bitrate),
      type: "",
    }));
    return rankStreams(asStreams, relMap, { isMobile: false, needsProxy: () => false }).map(
      (s) => ({ stream: s, row: relMap.get(s.url) }),
    );
  }, [rows, relMap]);

  const [cfg, setCfg] = useState<WatchdogConfig>(getWatchdogConfig());
  const [diag, setDiag] = useState<WatchdogDiagnostics>(getWatchdogDiagnostics());
  const [, force] = useState(0);
  const netCounts = getNetChangeCounts();


  useEffect(() => {
    const u1 = subscribeWatchdogConfig(setCfg);
    const u2 = subscribeWatchdogDiagnostics(setDiag);
    const t = window.setInterval(() => force((n) => n + 1), 1000);
    return () => {
      u1();
      u2();
      window.clearInterval(t);
    };
  }, []);

  // Draggable position
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_POS);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return { x: 16, y: 80 };
  });
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_POS, JSON.stringify(pos)); } catch { /* ignore */ }
  }, [pos]);

  const onDragStart = (e: React.PointerEvent) => {
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onDragMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setPos({
      x: Math.max(0, e.clientX - dragRef.current.dx),
      y: Math.max(0, e.clientY - dragRef.current.dy),
    });
  };
  const onDragEnd = () => { dragRef.current = null; };

  const set = (patch: Partial<WatchdogConfig>) => setWatchdogConfig(patch);

  return (
    <div
      className="fixed z-[120] bg-card/95 border border-border rounded-sm shadow-lg text-foreground"
      style={{ left: pos.x, top: pos.y, width: 280, fontFamily: "monospace" }}
    >
      <div
        className="flex items-center justify-between px-2 py-1 border-b border-border bg-background/40 cursor-move select-none"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        <span className="text-[10px] uppercase tracking-widest">Playback Diag</span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs px-1 hover:text-primary"
          aria-label="Close diagnostics"
        >
          ✕
        </button>
      </div>

      <div className="p-2 space-y-2">
        <div className="text-[10px] leading-relaxed">
          <div><span className="text-muted-foreground">Platform:</span> <b>{diag.platform}</b></div>
          <div><span className="text-muted-foreground">Mode:</span> <b>{diag.playbackMode}</b></div>
          <div><span className="text-muted-foreground">Last resume:</span> {fmtTime(diag.lastResumeAt)} <span className="text-muted-foreground">({diag.resumeCount})</span></div>
          <div><span className="text-muted-foreground">Last reconnect:</span> {fmtTime(diag.lastReconnectAt)} <span className="text-muted-foreground">({diag.reconnectCount})</span></div>
          <div><span className="text-muted-foreground">Last stall:</span> {fmtTime(diag.lastStallAt)}</div>
          <div><span className="text-muted-foreground">Last visibility:</span> {fmtTime(diag.lastVisibilityAt)}</div>
          <div className="truncate"><span className="text-muted-foreground">Last event:</span> {diag.lastEvent ?? "—"}</div>
          <div>
            <span className="text-muted-foreground">Net changes:</span> {netCounts.handovers} handover
            <span className="text-muted-foreground"> · {netCounts.flaps} same-net flap</span>
          </div>
        </div>

        <div className="border-t border-border pt-2 space-y-1">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Live edge</div>
          <div className="text-[10px] leading-relaxed">
            <div>
              <span className="text-muted-foreground">Buffer depth:</span> {diag.bufferDepthSec.toFixed(1)}s
              <span className="text-muted-foreground"> · rate {diag.playbackRate.toFixed(2)}x</span>
            </div>
            <div>
              <span className="text-muted-foreground">Live seeks:</span> {diag.liveSeekCount}
              <span className="text-muted-foreground"> · last </span>
              {diag.lastLiveSeekAt ? fmtTime(diag.lastLiveSeekAt) : "none"}
            </div>
            <div className="text-muted-foreground">
              Buffer depth sits near the 30s MSE target by design — watch for spikes above it, not the steady value.
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-2 space-y-1">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Last.fm</div>
          <label className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span className="truncate">Show activity lights</span>
            <input
              type="checkbox"
              checked={lastfmVisible}
              onChange={(e) => {
                setLastfmStatusVisible(e.target.checked);
                setLastfmVisible(e.target.checked);
              }}
              className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
            />
          </label>
        </div>

        <div className="border-t border-border pt-2 space-y-1">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Stall timeout</div>
          <NumField label="iOS" value={cfg.iosStallTimeoutSec} onChange={(n) => set({ iosStallTimeoutSec: n })} min={3} max={120} suffix="s" />
          <NumField label="Android" value={cfg.androidStallTimeoutSec} onChange={(n) => set({ androidStallTimeoutSec: n })} min={3} max={120} suffix="s" />
          <NumField label="Desktop" value={cfg.desktopStallTimeoutSec} onChange={(n) => set({ desktopStallTimeoutSec: n })} min={3} max={120} suffix="s" />
        </div>

        <div className="border-t border-border pt-2 space-y-1">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Visibility resume delay</div>
          <NumField label="iOS" value={cfg.iosVisibilityResumeDelayMs} onChange={(n) => set({ iosVisibilityResumeDelayMs: n })} min={0} max={5000} step={50} suffix="ms" />
          <NumField label="Android" value={cfg.androidVisibilityResumeDelayMs} onChange={(n) => set({ androidVisibilityResumeDelayMs: n })} min={0} max={5000} step={50} suffix="ms" />
          <NumField label="Desktop" value={cfg.desktopVisibilityResumeDelayMs} onChange={(n) => set({ desktopVisibilityResumeDelayMs: n })} min={0} max={5000} step={50} suffix="ms" />
        </div>

        <div className="border-t border-border pt-2 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Stream reliability
            </span>
            <button
              type="button"
              onClick={() => void loadReliability(true)}
              disabled={relLoading}
              className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded-sm border border-border hover:border-primary disabled:opacity-50"
            >
              {relLoading ? "…" : "Refresh"}
            </button>
          </div>
          {rankedRows.length === 0 ? (
            <div className="text-[10px] text-muted-foreground">No data yet</div>
          ) : (
            <div className="space-y-1">
              {rankedRows.map(({ stream, row }) => {
                const connects = Number(row?.connects) || 0;
                const failures = Number(row?.failures) || 0;
                const bad = isUnreliable(row);
                const current = stream.url === selectedUrl;
                const avg = row?.avg_played_sec_before_failure;
                return (
                  <div
                    key={stream.url}
                    className={`text-[10px] leading-tight px-1 py-0.5 rounded-sm border ${
                      current ? "border-primary bg-primary/10" : "border-transparent"
                    } ${bad ? "text-destructive" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate">
                        {current ? "▶ " : ""}
                        {stream.name}
                      </span>
                      <span className="text-muted-foreground shrink-0">
                        {stream.bitrate ? `${stream.bitrate}k` : "?"}
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      ok {connects} · fail {failures} · {pct(reliabilityScore(row))} · avg{" "}
                      {avg === null || avg === undefined ? "—" : `${Math.round(Number(avg))}s`}
                      {bad ? (isShortRunner(row) ? " · short-run" : " · unreliable") : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-1 border-t border-border">
          <button
            type="button"
            onClick={() => {
              resetWatchdogConfig();
              setCfg({ ...DEFAULT_WATCHDOG_CONFIG });
            }}
            className="text-[10px] uppercase tracking-widest px-2 py-1 rounded-sm border border-border hover:border-primary"
          >
            Reset defaults
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlaybackDiagnostics;
