import React, { useEffect } from "react";
import { CHANGELOG, APP_VERSION } from "./ChangelogModal";

interface Props {
  onClose: () => void;
  onViewFull: () => void;
}

const WhatsNewPopup: React.FC<Props> = ({ onClose, onViewFull }) => {
  const entry = CHANGELOG[0];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center px-3 sm:px-6"
      style={{ background: "rgba(0,0,0,0.78)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="whatsnew-title"
    >
      <style>{`
        @keyframes wn-pop-in {
          0%   { opacity: 0; transform: scale(0.85) rotate(-1.5deg); filter: blur(6px); }
          60%  { opacity: 1; transform: scale(1.03) rotate(0.4deg); filter: blur(0); }
          100% { opacity: 1; transform: scale(1) rotate(0); }
        }
        @keyframes wn-glitch {
          0%,100% { text-shadow: 0 0 0 transparent; transform: translate(0,0); }
          20% { text-shadow: -2px 0 hsl(var(--primary)), 2px 0 hsl(var(--destructive)); transform: translate(1px,-1px); }
          40% { text-shadow: 2px 0 hsl(var(--primary)), -2px 0 hsl(var(--accent)); transform: translate(-1px,1px); }
          60% { text-shadow: -1px 0 hsl(var(--accent)), 1px 0 hsl(var(--destructive)); transform: translate(1px,0); }
          80% { text-shadow: 0 0 8px hsl(var(--primary) / 0.8); transform: translate(0,0); }
        }
        @keyframes wn-marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        @keyframes wn-border-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes wn-pulse-glow {
          0%,100% { text-shadow: 0 0 6px hsl(var(--primary) / 0.6), 0 0 18px hsl(var(--primary) / 0.35); }
          50%     { text-shadow: 0 0 14px hsl(var(--primary) / 0.9), 0 0 32px hsl(var(--primary) / 0.55); }
        }
        @keyframes wn-item-in {
          from { opacity: 0; transform: translateX(-6px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .wn-card {
          animation: wn-pop-in 480ms cubic-bezier(.2,.9,.25,1.2) both;
        }
        .wn-title {
          animation: wn-glitch 700ms steps(1,end) 1 both, wn-pulse-glow 2.6s ease-in-out 700ms infinite;
        }
        .wn-marquee-track {
          animation: wn-marquee 18s linear infinite;
        }
        .wn-border::before {
          content: "";
          position: absolute;
          inset: -2px;
          border-radius: inherit;
          padding: 2px;
          background: conic-gradient(from 0deg,
            hsl(var(--primary)),
            hsl(var(--accent)),
            hsl(var(--destructive)),
            hsl(var(--primary)));
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
                  mask-composite: exclude;
          animation: wn-border-spin 6s linear infinite;
          pointer-events: none;
          z-index: 0;
        }
        .wn-scanlines {
          background-image: repeating-linear-gradient(
            to bottom,
            hsl(var(--foreground) / 0.05) 0px,
            hsl(var(--foreground) / 0.05) 1px,
            transparent 1px,
            transparent 3px
          );
        }
        .wn-item { animation: wn-item-in 340ms ease-out both; }
        @media (prefers-reduced-motion: reduce) {
          .wn-card, .wn-title, .wn-marquee-track, .wn-border::before, .wn-item {
            animation: none !important;
          }
        }
      `}</style>

      <div
        className="wn-card wn-border relative w-full max-w-md bg-background border border-border rounded-sm shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Marquee strip */}
        <div className="relative overflow-hidden border-b border-border bg-muted/40 h-6 shrink-0 z-[1]">
          <div className="wn-marquee-track absolute inset-y-0 left-0 flex items-center whitespace-nowrap text-[10px] tracking-[0.35em] uppercase font-bold text-primary">
            {Array.from({ length: 2 }).map((_, i) => (
              <span key={i} className="px-4 shrink-0">
                ★ NEW RELEASE ★ FRESH DROP ★ DEMOSCENE RADIO ★ v{APP_VERSION} ★ NEW RELEASE ★ FRESH DROP ★ DEMOSCENE RADIO ★ v{APP_VERSION} ★
              </span>
            ))}
          </div>
        </div>

        {/* Header */}
        <div className="relative z-[1] px-5 pt-4 pb-3 border-b border-border flex items-start justify-between gap-3 wn-scanlines">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-1">
              What's new
            </div>
            <h2
              id="whatsnew-title"
              className="wn-title text-2xl sm:text-3xl font-black uppercase tracking-widest text-primary leading-none"
            >
              v{APP_VERSION}
            </h2>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-2">
              {entry.date}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Dismiss"
            className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none min-w-[44px] min-h-[44px] flex items-center justify-center -mr-2 -mt-2"
          >
            ✕
          </button>
        </div>

        {/* Changes */}
        <div className="relative z-[1] overflow-y-auto px-5 py-4 wn-scanlines">
          <ul className="flex flex-col gap-1.5">
            {entry.changes.map((change, i) => (
              <li
                key={i}
                className="wn-item text-xs sm:text-sm text-foreground flex gap-2"
                style={{ animationDelay: `${300 + i * 70}ms` }}
              >
                <span className="text-primary shrink-0 font-bold">▸</span>
                <span className="text-muted-foreground">{change}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="relative z-[1] px-5 py-4 border-t border-border bg-muted/20 flex flex-col sm:flex-row gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={onViewFull}
            className="flex-1 min-h-[44px] px-4 text-xs uppercase tracking-widest font-bold border border-border bg-background hover:bg-muted hover:border-primary hover:text-primary transition-colors rounded-sm"
          >
            [ Full Changelog ]
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[44px] px-4 text-xs uppercase tracking-widest font-bold bg-primary text-primary-foreground hover:brightness-110 transition rounded-sm shadow-[0_0_20px_hsl(var(--primary)/0.45)]"
          >
            [ Let's Go ]
          </button>
        </div>
      </div>
    </div>
  );
};

export default WhatsNewPopup;
