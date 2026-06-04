import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useStageSize } from "@/lib/stage";

type Props = {
  id: string;
  title: string;
  defaultX: number;
  defaultY: number;
  defaultW?: number;
  defaultH?: number;
  onClose: () => void;
  children: ReactNode;
};

type Pos = { x: number; y: number; w: number; h: number };

const STORAGE_PREFIX = "cracktro-window-";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

const FloatingWindow = ({ id, title, defaultX, defaultY, defaultW = 280, defaultH = 260, onClose, children }: Props) => {
  const [pos, setPos] = useState<Pos>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + id);
      if (raw) {
        const v = JSON.parse(raw) as Partial<Pos>;
        return {
          x: typeof v.x === "number" ? v.x : defaultX,
          y: typeof v.y === "number" ? v.y : defaultY,
          w: typeof v.w === "number" ? v.w : defaultW,
          h: typeof v.h === "number" ? v.h : defaultH,
        };
      }
    } catch {
      // ignore
    }
    return { x: defaultX, y: defaultY, w: defaultW, h: defaultH };
  });

  // Clamp on mount + window resize so panels never sit off-screen.
  useEffect(() => {
    const clampToViewport = () => {
      setPos((p) => ({
        ...p,
        x: clamp(p.x, 0, Math.max(0, window.innerWidth - p.w)),
        y: clamp(p.y, 0, Math.max(0, window.innerHeight - 40)),
      }));
    };
    clampToViewport();
    window.addEventListener("resize", clampToViewport);
    return () => window.removeEventListener("resize", clampToViewport);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(pos));
    } catch {
      // ignore
    }
  }, [id, pos]);

  const dragRef = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { ox: e.clientX, oy: e.clientY, px: pos.x, py: pos.y };
  }, [pos.x, pos.y]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const { ox, oy, px, py } = dragRef.current;
    const nx = clamp(px + (e.clientX - ox), 0, Math.max(0, window.innerWidth - pos.w));
    const ny = clamp(py + (e.clientY - oy), 0, Math.max(0, window.innerHeight - 40));
    setPos((p) => ({ ...p, x: nx, y: ny }));
  }, [pos.w]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    dragRef.current = null;
  }, []);

  return (
    <div
      className="absolute bg-card/85 border border-border rounded-sm backdrop-blur-md shadow-lg flex flex-col overflow-hidden"
      style={{
        left: pos.x,
        top: pos.y,
        width: pos.w,
        maxHeight: "60vh",
        zIndex: 12,
      }}
    >
      <div
        data-goose-perch="window"
        className="flex items-center justify-between px-2 py-1 border-b border-border bg-background/60 cursor-move select-none touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground truncate">
          {title}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title}`}
          className="text-xs px-2 leading-none text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>
      </div>
      <div className="p-2 overflow-y-auto text-xs text-foreground/90">
        {children}
      </div>
    </div>
  );
};

export default FloatingWindow;
