// Developer-only HUD for the cracktro goose ecosystem. Shows live per-goose
// state, perch claims, active collision vectors, and every life-cycle
// counter/timer with its governing rule. Toggle via Shift+D or ?gooseDebug=1.

import { useEffect, useRef, useState } from "react";
import {
  GOOSE_COLLISION,
  getAllPerchClaims,
  getDebugCounters,
  getFamilySnapshot,
  getGoosePositions,
} from "@/lib/gooseSocial";

const STORAGE_KEY = "cracktro-goose-debug";

// Mirror the GooseFamily constants here for display (kept in lock-step manually).
const RULES = {
  MAX_LIVE_EGGS: 4,
  MAX_GOSLINGS: 8,
  MAX_TOTAL_ADULTS: 8,
  GROW_UP_MS: 8 * 60_000,
  ADULT_LIFE_BEFORE_DEATH_MS: 5 * 60_000,
  MOURNING_DURATION_MS: 45_000,
  HATCH_WINDOW: [18_000, 32_000] as const,
};

function fmtMs(ms: number): string {
  if (!isFinite(ms) || ms <= 0) return "0s";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${s % 60}s`;
}
function fmtAgo(at: number, now: number): string {
  if (!at) return "—";
  return `${fmtMs(now - at)} ago`;
}

const useDebugFlag = () => {
  const [on, setOn] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    if (new URLSearchParams(window.location.search).get("gooseDebug") === "1") return true;
    try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey && (e.key === "D" || e.key === "d") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // Avoid hijacking text inputs.
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        setOn((prev) => {
          const next = !prev;
          try { localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch { /* ignore */ }
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return on;
};

const GooseDebugOverlay = () => {
  const on = useDebugFlag();
  const [, setTick] = useState(0);
  const rafRef = useRef<number>(0);
  useEffect(() => {
    if (!on) return;
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      // 10 Hz polling — enough for a HUD, doesn't tax the cracktro RAF.
      if (t - last > 100) { last = t; setTick((n) => (n + 1) % 1_000_000); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    rafRef.current = raf;
    return () => cancelAnimationFrame(raf);
  }, [on]);

  if (!on) return null;
  const now = Date.now();
  const family = getFamilySnapshot();
  const counters = getDebugCounters();
  const perches = getAllPerchClaims();
  const originals = getGoosePositions();

  // Per-goose rows.
  type Row = {
    id: string; kind: string; color: string;
    mode: string; activity?: string;
    x: number; y: number; dir: number;
    tx?: number; ty?: number;
    perch?: string;
    avoidMs?: number;
  };
  const rows: Row[] = [];
  if (originals?.white) rows.push({
    id: "original-white", kind: "original", color: "white",
    mode: "?", x: originals.white.x, y: originals.white.y, dir: 1,
  });
  if (originals?.brown) rows.push({
    id: "original-brown", kind: "original", color: "brown",
    mode: "?", x: originals.brown.x, y: originals.brown.y, dir: 1,
  });
  for (const a of family?.adults ?? []) {
    const claim = perches.find((p) => p.id.includes(a.rosterId));
    rows.push({
      id: a.id, kind: a.isDying ? "adult†" : "adult", color: a.color,
      mode: a.mode, activity: a.activity,
      x: a.x, y: a.y, dir: a.dir,
      tx: a.targetX, ty: a.targetY,
      perch: claim ? `${claim.id}@${Math.round(claim.anchorX)}` : undefined,
      avoidMs: a.avoidUntil && a.avoidUntil > now ? a.avoidUntil - now : 0,
    });
  }
  for (const g of family?.goslings ?? []) {
    rows.push({
      id: g.id, kind: "gosling", color: g.variant,
      mode: "ground", x: g.x, y: g.y, dir: g.dir,
      tx: g.targetX, ty: g.targetY,
    });
  }

  // Collision pairs (within 1.5 × personalSpacePx).
  const psp = GOOSE_COLLISION.personalSpacePx;
  type Pair = { a: Row; b: Row; dist: number };
  const pairs: Pair[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const dx = rows[i].x - rows[j].x;
      const dy = rows[i].y - rows[j].y;
      const d = Math.hypot(dx, dy);
      if (d < psp * 1.5) pairs.push({ a: rows[i], b: rows[j], dist: d });
    }
  }

  // Eggs / goslings derived stats.
  const eggs = family?.eggs ?? [];
  const nextHatch = eggs.length > 0
    ? Math.min(...eggs.map((e) => e.hatchAt)) - now
    : 0;
  const lastEggLaid = eggs.length > 0 ? Math.max(...eggs.map((e) => e.laidAt)) : 0;
  const goslingsArr = family?.goslings ?? [];
  const oldestGosling = goslingsArr.length > 0
    ? now - Math.min(...goslingsArr.map((g) => g.bornAt))
    : 0;
  const nextGrowUpIn = goslingsArr.length > 0
    ? Math.max(0, RULES.GROW_UP_MS - oldestGosling)
    : 0;
  const adults = family?.adults ?? [];
  const totalAdults = adults.length + (originals?.white ? 1 : 0) + (originals?.brown ? 1 : 0);
  const nextDeathIn = adults
    .filter((a) => a.diesAt)
    .reduce((acc, a) => Math.min(acc, (a.diesAt ?? Infinity) - now), Infinity);
  const mourningRemaining = family?.mourningUntil && family.mourningUntil > now
    ? family.mourningUntil - now
    : 0;

  const panelStyle: React.CSSProperties = {
    position: "fixed", top: 8, right: 8, zIndex: 9999,
    maxHeight: "calc(100vh - 16px)", overflowY: "auto",
    width: 460, padding: 10,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 10, lineHeight: 1.35,
    color: "#e6f1ff",
    background: "rgba(8, 12, 24, 0.92)",
    border: "1px solid rgba(120, 180, 255, 0.4)",
    borderRadius: 6,
    pointerEvents: "auto",
  };
  const h: React.CSSProperties = { fontWeight: 700, color: "#7fd2ff", marginTop: 8, marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.6, fontSize: 9 };
  const td: React.CSSProperties = { padding: "1px 4px", whiteSpace: "nowrap" };
  const dim: React.CSSProperties = { color: "#9aa9bd" };

  return (
    <>
      {/* On-stage collision vector lines */}
      <svg
        style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9998 }}
        width="100%" height="100%"
      >
        {pairs.map((p, i) => (
          <line
            key={i}
            x1={p.a.x} y1={p.a.y} x2={p.b.x} y2={p.b.y}
            stroke={p.dist < psp ? "#ff4d6d" : "#ffd166"}
            strokeWidth={1} strokeDasharray={p.dist < psp ? "" : "3 3"}
            opacity={0.85}
          />
        ))}
      </svg>

      <div style={panelStyle}>
        <div style={{ fontWeight: 800, color: "#fff", fontSize: 11 }}>
          GOOSE DEBUG · Shift+D to toggle
        </div>
        <div style={dim}>
          rules: personalSpace={psp}px · bumpCooldown={GOOSE_COLLISION.bumpCooldownMs}ms · perchSpace={GOOSE_COLLISION.perchPersonalSpacePx}px
        </div>

        <div style={h}>Geese ({rows.length})</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "#9ec6ff" }}>
              <th style={{ ...td, textAlign: "left" }}>id</th>
              <th style={{ ...td, textAlign: "left" }}>kind</th>
              <th style={{ ...td, textAlign: "left" }}>mode</th>
              <th style={{ ...td, textAlign: "right" }}>x,y</th>
              <th style={{ ...td, textAlign: "right" }}>tgt</th>
              <th style={{ ...td, textAlign: "left" }}>perch</th>
              <th style={{ ...td, textAlign: "right" }}>avoid</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={td}>{r.id.slice(0, 14)}</td>
                <td style={td}>{r.kind}/{r.color.slice(0, 6)}</td>
                <td style={td}>
                  {r.mode}{r.activity ? `·${r.activity}` : ""}
                </td>
                <td style={{ ...td, textAlign: "right" }}>{Math.round(r.x)},{Math.round(r.y)}</td>
                <td style={{ ...td, textAlign: "right" }}>
                  {r.tx != null ? `${Math.round(r.tx)},${Math.round(r.ty ?? 0)}` : "—"}
                </td>
                <td style={td}>{r.perch ?? "—"}</td>
                <td style={{ ...td, textAlign: "right", color: r.avoidMs ? "#ffb86b" : "#556" }}>
                  {r.avoidMs ? `${r.avoidMs}ms` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={h}>Collisions (within {Math.round(psp * 1.5)}px)</div>
        {pairs.length === 0 ? <div style={dim}>none</div> : pairs.map((p, i) => (
          <div key={i} style={{ color: p.dist < psp ? "#ff7a90" : "#ffd47a" }}>
            {p.a.id.slice(0, 10)} ↔ {p.b.id.slice(0, 10)}  dist={p.dist.toFixed(1)}{p.dist < psp ? "  OVERLAP" : ""}
          </div>
        ))}
        <div style={dim}>session bumps: {counters.counters.bumps} · last {fmtAgo(counters.counters.lastBumpAt, now)}</div>

        <div style={h}>Perch claims ({perches.length})</div>
        {perches.length === 0 ? <div style={dim}>none</div> : perches.map((p) => (
          <div key={p.id}>{p.id} @ x={Math.round(p.anchorX)}</div>
        ))}

        <div style={h}>Eggs / Goslings / Adults</div>
        <div>eggs: <b>{eggs.length}</b>/{RULES.MAX_LIVE_EGGS} · last laid {fmtAgo(lastEggLaid, now)} · next hatch in {fmtMs(nextHatch)}</div>
        <div style={dim}>rule: hatch window {RULES.HATCH_WINDOW[0]/1000}-{RULES.HATCH_WINDOW[1]/1000}s</div>
        <div>goslings: <b>{goslingsArr.length}</b>/{RULES.MAX_GOSLINGS} · oldest {fmtMs(oldestGosling)} · next grow-up in {fmtMs(nextGrowUpIn)}</div>
        <div style={dim}>rule: GROW_UP_MS={fmtMs(RULES.GROW_UP_MS)}</div>
        <div>adults: <b>{adults.length}</b> (total incl. originals: {totalAdults}/{RULES.MAX_TOTAL_ADULTS}) · next death in {isFinite(nextDeathIn) ? fmtMs(nextDeathIn) : "—"}</div>
        <div style={dim}>rule: ADULT_LIFE_BEFORE_DEATH_MS={fmtMs(RULES.ADULT_LIFE_BEFORE_DEATH_MS)}</div>

        <div style={h}>Mourning · Deaths</div>
        <div>active: <b>{mourningRemaining > 0 ? "yes" : "no"}</b> · remaining {fmtMs(mourningRemaining)} · rituals session: {counters.counters.mournings} · last {fmtAgo(counters.counters.lastMourningAt, now)}</div>
        <div style={dim}>rule: MOURNING_DURATION_MS={fmtMs(RULES.MOURNING_DURATION_MS)}</div>
        <div>deaths session: <b>{counters.counters.deaths}</b> · last {fmtAgo(counters.counters.lastDeathAt, now)}</div>

        <div style={h}>Reproduction / Snack / Ball</div>
        <div>last reproduction {fmtAgo(counters.lastReproductionAt, now)} · cooldown {fmtMs(Math.max(0, counters.reproductionCooldownMs - (now - counters.lastReproductionAt)))} (rule {fmtMs(counters.reproductionCooldownMs)})</div>
        <div>earliest next clutch: {counters.reproductionEarliestAt ? fmtMs(Math.max(0, counters.reproductionEarliestAt - now)) : "—"}</div>
        <div>last brood end {fmtAgo(counters.lastBroodEndAt, now)} · post-hatch settle {fmtMs(counters.postHatchSettleMs)}</div>
        <div>last fly-away {fmtAgo(counters.lastFlyAwayAt, now)} · cooldown {fmtMs(Math.max(0, counters.flyAwayCooldownMs - (now - counters.lastFlyAwayAt)))} (rule {fmtMs(counters.flyAwayCooldownMs)})</div>
        <div>last ball play {fmtAgo(counters.lastBallPlayAt, now)} · cooldown {fmtMs(Math.max(0, counters.ballPlayCooldownMs - (now - counters.lastBallPlayAt)))} (rule {fmtMs(counters.ballPlayCooldownMs)})</div>
      </div>
    </>
  );
};

export default GooseDebugOverlay;
