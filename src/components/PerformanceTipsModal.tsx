import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
};

const REPORT_EMAIL = "compact.demosceneplayer@georgeflower.mozmail.com";
const REPORT_GITHUB = "https://github.com/georgeflower/nectarine-radio-streams";

const PerformanceTipsModal = ({ open, onClose }: Props) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="perf-tips-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-sm border border-primary/60 bg-card p-5 text-sm"
        style={{ boxShadow: "var(--glow-primary)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2
            id="perf-tips-title"
            className="text-primary uppercase tracking-widest text-sm"
          >
            ⚡ Performance tips &amp; reporting
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-h-8 min-w-8 px-2 text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <section className="mb-4">
          <h3 className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
            Best browsers
          </h3>
          <p className="text-foreground/90">
            Use <strong>Chrome</strong>, <strong>Edge</strong>, or{" "}
            <strong>Safari</strong> for smooth visuals. Firefox has known
            slowdowns with canvas glow/shadow effects.
          </p>
        </section>

        <section className="mb-4">
          <h3 className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
            If effects feel slow
          </h3>
          <ul className="list-disc pl-5 space-y-1 text-foreground/90">
            <li>
              Open <span className="text-primary">⚙ Settings → ♪ Reactivity…</span>{" "}
              and lower <em>Master intensity</em>, <em>Motion</em> and{" "}
              <em>Glow / effect intensity</em> per mode.
            </li>
            <li>
              Switch <span className="text-primary">Visualizer</span> to a lighter
              style: <em>bars</em>, <em>oscilloscope</em>, or <em>off</em>.
            </li>
            <li>
              Turn off <em>Scanlines</em> from the settings popover.
            </li>
            <li>
              The visualizer auto-downgrades quality when FPS drops — closing
              other heavy tabs helps it recover faster.
            </li>
            <li>
              Reduce text size (A−) if the page itself feels sluggish.
            </li>
          </ul>
        </section>

        <section className="mb-4">
          <h3 className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
            Stream keeps reconnecting?
          </h3>
          <ul className="list-disc pl-5 space-y-1 text-foreground/90">
            <li>
              VPNs (including Proton VPN) can reset long-lived audio streams.
              Try disconnecting the VPN or switching to a direct HTTPS mirror
              in the stream selector.
            </li>
            <li>
              On mobile, keep the app in the foreground or use the media controls
              on the lock screen; background audio may be paused by the OS.
            </li>
          </ul>
        </section>

        <section>
          <h3 className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
            Report issues
          </h3>
          <ul className="list-disc pl-5 space-y-1 text-foreground/90">
            <li>
              Email:{" "}
              <a
                href={`mailto:${REPORT_EMAIL}`}
                className="text-primary hover:underline break-all"
              >
                {REPORT_EMAIL}
              </a>
            </li>
            <li>
              GitHub:{" "}
              <a
                href={REPORT_GITHUB}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline break-all"
              >
                georgeflower/nectarine-radio-streams
              </a>
            </li>
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Please include your browser, OS, and which visualizer mode you were
            using.
          </p>
        </section>
      </div>
    </div>
  );
};

export default PerformanceTipsModal;
