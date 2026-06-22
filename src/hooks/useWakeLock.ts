import { useEffect, useRef } from "react";

/**
 * Keeps the mobile screen awake while the component is mounted
 * using the Screen Wake Lock API. Re-acquires the lock when the
 * tab becomes visible again (browsers release it on hide).
 */
export function useWakeLock(enabled = true) {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    const request = async () => {
      if (!enabledRef.current) return;
      try {
        const lock = await (navigator as any).wakeLock.request("screen");
        wakeLockRef.current = lock;
        lock.addEventListener("release", () => {
          wakeLockRef.current = null;
        });
      } catch {
        // wake lock may be denied (battery saver, iframe, etc.) — silently ignore
      }
    };

    const release = () => {
      const lock = wakeLockRef.current;
      if (lock) {
        lock.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        release();
      } else {
        void request();
      }
    };

    void request();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      release();
    };
  }, []);
}
