import { useBeat } from "@/components/Visualizer";

type Props = {
  analyser: AnalyserNode | null;
  enabled?: boolean;
};

/**
 * Full-screen overlay that flashes a vignette + scales a centered ring on each
 * detected kick. Purely visual, doesn't block pointer events.
 */
const BeatOverlay = ({ analyser, enabled = true }: Props) => {
  const beat = useBeat(analyser, enabled);

  if (!enabled) return null;

  const vignetteAlpha = beat * 0.35;
  const ringScale = 0.85 + beat * 0.5;
  const ringAlpha = beat * 0.55;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 2 }}
    >
      {/* edge flash vignette */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at center, transparent 55%, hsl(var(--primary) / ${vignetteAlpha}) 100%)`,
          mixBlendMode: "screen",
          transition: "opacity 60ms linear",
        }}
      />
      {/* center pulse ring */}
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: "min(80vw, 80vh)",
          height: "min(80vw, 80vh)",
          transform: `translate(-50%, -50%) scale(${ringScale})`,
          border: `2px solid hsl(var(--primary) / ${ringAlpha})`,
          borderRadius: "9999px",
          boxShadow: `0 0 ${beat * 80}px hsl(var(--primary) / ${beat * 0.6})`,
          transition: "transform 80ms ease-out, border-color 80ms linear",
          mixBlendMode: "screen",
        }}
      />
      {/* corner ticks */}
      <div
        className="absolute inset-4"
        style={{
          opacity: beat,
          background:
            "linear-gradient(to right, hsl(var(--primary)) 0 24px, transparent 24px) top left/24px 2px no-repeat," +
            "linear-gradient(to bottom, hsl(var(--primary)) 0 24px, transparent 24px) top left/2px 24px no-repeat," +
            "linear-gradient(to left, hsl(var(--primary)) 0 24px, transparent 24px) top right/24px 2px no-repeat," +
            "linear-gradient(to bottom, hsl(var(--primary)) 0 24px, transparent 24px) top right/2px 24px no-repeat," +
            "linear-gradient(to right, hsl(var(--primary)) 0 24px, transparent 24px) bottom left/24px 2px no-repeat," +
            "linear-gradient(to top, hsl(var(--primary)) 0 24px, transparent 24px) bottom left/2px 24px no-repeat," +
            "linear-gradient(to left, hsl(var(--primary)) 0 24px, transparent 24px) bottom right/24px 2px no-repeat," +
            "linear-gradient(to top, hsl(var(--primary)) 0 24px, transparent 24px) bottom right/2px 24px no-repeat",
          transition: "opacity 80ms linear",
        }}
      />
    </div>
  );
};

export default BeatOverlay;
