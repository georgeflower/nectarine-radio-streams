import { useSyncExternalStore } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Slider } from "@/components/ui/slider";
import {
  reactivityStore,
  resolveMode,
  DEFAULT_MODE,
  TUNABLE_STYLES,
  type BandName,
  type ModeReactivity,
} from "@/lib/reactivitySettings";
import type { VisualizerStyle } from "@/components/Visualizer";

const BAND_LABELS: Record<BandName, string> = {
  bass: "Bass",
  lowMid: "Low-mid",
  mid: "Mid",
  treble: "Treble",
};

type Row = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
};

const SliderRow = ({ label, value, min, max, step, suffix, onChange }: Row) => (
  <div className="flex flex-col gap-1">
    <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums text-foreground">
        {value.toFixed(step < 1 ? 2 : 0)}{suffix ?? ""}
      </span>
    </div>
    <Slider
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={(v) => onChange(v[0] ?? value)}
    />
  </div>
);

const BandRow = ({ band, range }: { band: BandName; range: [number, number] }) => (
  <div className="flex flex-col gap-1">
    <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
      <span>{BAND_LABELS[band]}</span>
      <span className="tabular-nums text-foreground">
        {Math.round(range[0])}–{Math.round(range[1])} Hz
      </span>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Slider
        value={[range[0]]}
        min={20}
        max={Math.max(20, range[1] - 10)}
        step={5}
        onValueChange={(v) => reactivityStore.setBand(band, 0, v[0] ?? range[0])}
      />
      <Slider
        value={[range[1]]}
        min={Math.min(20000, range[0] + 10)}
        max={20000}
        step={20}
        onValueChange={(v) => reactivityStore.setBand(band, 1, v[0] ?? range[1])}
      />
    </div>
  </div>
);

const ModePanel = ({ style }: { style: VisualizerStyle }) => {
  const settings = useSyncExternalStore(reactivityStore.subscribe, reactivityStore.get);
  const mode: ModeReactivity = resolveMode(style, settings);
  const isOverridden = !!settings.perMode[style];
  return (
    <div className="flex flex-col gap-3 py-2">
      <SliderRow
        label="Bass gain"
        value={mode.bassGain}
        min={0} max={3} step={0.05}
        suffix="x"
        onChange={(v) => reactivityStore.setModeField(style, "bassGain", v)}
      />
      <SliderRow
        label="Mid gain"
        value={mode.midGain}
        min={0} max={3} step={0.05}
        suffix="x"
        onChange={(v) => reactivityStore.setModeField(style, "midGain", v)}
      />
      <SliderRow
        label="Treble gain"
        value={mode.trebleGain}
        min={0} max={3} step={0.05}
        suffix="x"
        onChange={(v) => reactivityStore.setModeField(style, "trebleGain", v)}
      />
      <SliderRow
        label="Motion intensity"
        value={mode.motion}
        min={0} max={3} step={0.05}
        suffix="x"
        onChange={(v) => reactivityStore.setModeField(style, "motion", v)}
      />
      <SliderRow
        label="Glow / effect intensity"
        value={mode.glow}
        min={0} max={2.5} step={0.05}
        suffix="x"
        onChange={(v) => reactivityStore.setModeField(style, "glow", v)}
      />
      {isOverridden && (
        <button
          type="button"
          onClick={() => reactivityStore.resetMode(style)}
          className="self-start min-h-9 px-2 py-1 text-[10px] uppercase tracking-widest rounded-sm border border-border bg-card/60 text-foreground hover:bg-card"
        >
          Reset {style}
        </button>
      )}
    </div>
  );
};

type Props = {
  children: React.ReactNode; // trigger
};

const ReactivityDrawer = ({ children }: Props) => {
  const settings = useSyncExternalStore(reactivityStore.subscribe, reactivityStore.get);
  const g = settings.global;
  return (
    <Sheet>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="right" className="w-[380px] sm:w-[420px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="uppercase tracking-widest text-sm">Audio reactivity</SheetTitle>
        </SheetHeader>
        <div className="mt-4 flex flex-col gap-4">
          <section className="flex flex-col gap-3">
            <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Global</h3>
            <SliderRow
              label="Master intensity"
              value={g.masterIntensity}
              min={0.25} max={2.5} step={0.05}
              suffix="x"
              onChange={reactivityStore.setMaster}
            />
            <SliderRow
              label="Beat threshold"
              value={g.beatThreshold}
              min={1.05} max={2.5} step={0.05}
              suffix="x avg"
              onChange={reactivityStore.setBeatThreshold}
            />
            <SliderRow
              label="Sparkle threshold"
              value={g.sparkleThreshold}
              min={1.05} max={3} step={0.05}
              suffix="x avg"
              onChange={reactivityStore.setSparkleThreshold}
            />
            <div className="flex flex-col gap-3 pt-1">
              <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground">Frequency bands</h4>
              <BandRow band="bass" range={g.bandsHz.bass} />
              <BandRow band="lowMid" range={g.bandsHz.lowMid} />
              <BandRow band="mid" range={g.bandsHz.mid} />
              <BandRow band="treble" range={g.bandsHz.treble} />
            </div>
          </section>

          <section className="flex flex-col gap-1 border-t border-border pt-3">
            <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Per-mode overrides</h3>
            <Accordion type="single" collapsible>
              {TUNABLE_STYLES.map((s) => {
                const overridden = !!settings.perMode[s];
                return (
                  <AccordionItem key={s} value={s}>
                    <AccordionTrigger className="text-xs uppercase tracking-widest">
                      <span className="flex items-center gap-2">
                        {s}
                        {overridden && (
                          <span className="text-[9px] px-1 py-0.5 rounded-sm bg-primary/20 text-primary">
                            custom
                          </span>
                        )}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <ModePanel style={s} />
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </section>

          <div className="border-t border-border pt-3 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Saved to this browser
            </span>
            <button
              type="button"
              onClick={() => reactivityStore.resetAll()}
              className="min-h-9 px-3 py-1 text-xs uppercase tracking-widest rounded-sm border border-primary/60 bg-card/60 text-primary hover:bg-primary hover:text-primary-foreground"
            >
              Reset defaults
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ReactivityDrawer;
