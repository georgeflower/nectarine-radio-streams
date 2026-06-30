import { useEffect, useRef, useState } from "react";
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

const PlaybackDiagnostics = ({ onClose }: Props) => {
  const [cfg, setCfg] = useState<WatchdogConfig>(getWatchdogConfig());
  const [diag, setDiag] = useState<WatchdogDiagnostics>(getWatchdogDiagnostics());
  const [, force] = useState(0);

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
