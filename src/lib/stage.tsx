import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Stage = the bounded play area inside which the cracktro lives.
 * In fullscreen mode it equals the viewport. In windowed mode it equals
 * the user-resizable window. Children read its dimensions instead of
 * `window.innerWidth/Height` so they reflow when the window is resized.
 */
const StageElementContext = createContext<HTMLElement | null>(null);

export const StageProvider = ({
  element,
  children,
}: {
  element: HTMLElement | null;
  children: ReactNode;
}) => (
  <StageElementContext.Provider value={element}>{children}</StageElementContext.Provider>
);

export const useStageElement = (): HTMLElement | null => useContext(StageElementContext);

const readSize = (el: HTMLElement | null) => ({
  width: el?.clientWidth ?? (typeof window !== "undefined" ? window.innerWidth : 1280),
  height: el?.clientHeight ?? (typeof window !== "undefined" ? window.innerHeight : 720),
});

export const useStageSize = (): { width: number; height: number } => {
  const el = useStageElement();
  const [size, setSize] = useState(() => readSize(el));
  useEffect(() => {
    const upd = () => setSize(readSize(el));
    upd();
    if (el) {
      const ro = new ResizeObserver(upd);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", upd);
    return () => window.removeEventListener("resize", upd);
  }, [el]);
  return size;
};
