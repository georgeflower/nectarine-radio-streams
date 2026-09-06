import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  currentJunebulaColor,
  getISOWeek,
  hexToHslTriplet,
  junebulaCssVars,
  JUNEBULA_COLORS,
  JUNEBULA_VAR_NAMES,
  ODD_WEEK,
  EVEN_WEEK,
  type JunebulaColor,
  type JunebulaColorName,
} from "@/lib/junebula";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface Row {
  parity: "odd" | "even";
  dayIndex: number;
  color: JunebulaColor;
}

function buildRows(): Row[] {
  const rows: Row[] = [];
  for (const parity of ["odd", "even"] as const) {
    const table = parity === "odd" ? ODD_WEEK : EVEN_WEEK;
    table.forEach((name, dayIndex) => {
      rows.push({ parity, dayIndex, color: { name, ...JUNEBULA_COLORS[name] } });
    });
  }
  return rows;
}

const ROWS = buildRows();

const Swatch = ({ hex, label }: { hex: string; label: string }) => (
  <div className="flex items-center gap-2">
    <span
      className="inline-block h-6 w-6 shrink-0 rounded-sm border border-border"
      style={{ backgroundColor: hex }}
      aria-hidden
    />
    <div className="leading-tight">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-mono text-sm">{hex}</div>
      <div className="font-mono text-[11px] text-muted-foreground">{hexToHslTriplet(hex)}</div>
    </div>
  </div>
);

const Junebula = () => {
  // Live "now" — refreshed every 60s and on visibility, mirroring Index.tsx.
  const [now, setNow] = useState<JunebulaColor>(() => currentJunebulaColor());
  const [weekNo, setWeekNo] = useState(() => getISOWeek(new Date()));
  // Selection: null = follow live rotation; otherwise parity+dayIndex preview.
  const [sel, setSel] = useState<{ parity: "odd" | "even"; dayIndex: number } | null>(null);

  useEffect(() => {
    const apply = () => {
      const d = new Date();
      setNow(currentJunebulaColor(d));
      setWeekNo(getISOWeek(d));
    };
    const timer = window.setInterval(apply, 60000);
    const onVis = () => {
      if (document.visibilityState === "visible") apply();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const active = useMemo<JunebulaColor>(() => {
    if (!sel) return now;
    const table = sel.parity === "odd" ? ODD_WEEK : EVEN_WEEK;
    const name: JunebulaColorName = table[sel.dayIndex];
    return { name, ...JUNEBULA_COLORS[name] };
  }, [sel, now]);

  // Apply the selected colour to the document so the page itself shows it.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", "junebula");
    const vars = junebulaCssVars(active);
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    return () => {
      root.removeAttribute("data-theme");
      for (const name of JUNEBULA_VAR_NAMES) root.style.removeProperty(name);
    };
  }, [active]);

  const todayParity = weekNo % 2 === 1 ? "odd" : "even";
  const todayDayIndex = (new Date().getDay() + 6) % 7;

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-wide" style={{ textShadow: "var(--glow-primary)" }}>
              juN3bula
            </h1>
            <p className="text-sm text-muted-foreground">
              14-day rotating colour system · week {weekNo} ({todayParity}) · today is{" "}
              <span className="text-foreground">{now.name}</span>
            </p>
          </div>
          <Link to="/" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
            ← back to radio
          </Link>
        </header>

        {/* Live theme switcher */}
        <section className="mb-6 rounded-md border border-border bg-card p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Live theme switcher
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSel(null)}
              className={`min-h-11 rounded-sm border px-3 font-mono text-sm ${
                sel === null ? "border-primary bg-secondary" : "border-border text-muted-foreground"
              }`}
            >
              Now · {now.name}
            </button>
            {ROWS.map((r) => {
              const isSel = sel?.parity === r.parity && sel?.dayIndex === r.dayIndex;
              return (
                <button
                  key={`${r.parity}-${r.dayIndex}`}
                  type="button"
                  onClick={() => setSel({ parity: r.parity, dayIndex: r.dayIndex })}
                  className={`min-h-11 rounded-sm border px-3 font-mono text-sm ${
                    isSel ? "border-primary bg-secondary" : "border-border text-muted-foreground"
                  }`}
                  title={`${r.parity} week · ${DAY_NAMES[r.dayIndex]}`}
                >
                  <span
                    className="mr-2 inline-block h-3 w-3 rounded-full align-middle"
                    style={{ backgroundColor: r.color.main }}
                  />
                  {r.color.name}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Showing <span className="text-foreground">{active.name}</span>
            {sel ? " (preview)" : " (live rotation — re-evaluates every 60 s)"}. The whole page re-colours with the
            selection.
          </p>
        </section>

        {/* Rotation table */}
        <section className="rounded-md border border-border bg-card">
          <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-4 gap-y-3 p-4 sm:grid-cols-[auto_auto_1fr_auto_auto]">
            {ROWS.map((r) => {
              const isToday = r.parity === todayParity && r.dayIndex === todayDayIndex;
              return (
                <div key={`${r.parity}-${r.dayIndex}`} className="contents">
                  <div className="font-mono text-[11px] uppercase text-muted-foreground">{r.parity}</div>
                  <div className="hidden font-mono text-sm sm:block">
                    {DAY_NAMES[r.dayIndex]}
                    {isToday && <span className="ml-2 text-xs text-primary">◀ today</span>}
                  </div>
                  <div className={`font-mono text-sm ${isToday ? "text-primary" : ""}`}>
                    {r.color.name}
                    {isToday && <span className="ml-2 text-xs sm:hidden">◀ today</span>}
                  </div>
                  <Swatch hex={r.color.main} label="main" />
                  <Swatch hex={r.color.accent} label="accent" />
                </div>
              );
            })}
          </div>
        </section>

        <p className="mt-4 text-xs text-muted-foreground">
          Base stays fixed: page #0c0c0c · panels #141414 · insets #0b0b0b. Borders, headings and glow use{" "}
          <span className="text-foreground">main</span>; body text uses the brighter{" "}
          <span className="text-foreground">accent</span> for contrast. HSL values are the CSS custom-property
          triplets.
        </p>
      </div>
    </main>
  );
};

export default Junebula;
