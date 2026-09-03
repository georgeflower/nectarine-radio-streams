import { useEffect, useRef, useState } from "react";
import { useLastfm, setLoved, getLovedState } from "@/lib/lastfm";

/** Last.fm love toggle. Demoscene track names often do not match Last.fm's catalog. */
export function LoveButton({ songId, artist, track }: { songId: string; artist: string; track: string }) {
  const { session } = useLastfm();
  const [loved, setLovedState] = useState(false);
  const [busy, setBusy] = useState(false);
  const currentIdRef = useRef(songId);

  useEffect(() => {
    currentIdRef.current = songId;
    setLovedState(false);
    if (!session || !songId || !artist || !track) return;
    let cancelled = false;
    getLovedState(artist, track).then((r) => {
      if (cancelled || currentIdRef.current !== songId) return;
      if (r.ok) setLovedState(!!r.loved);
    });
    return () => {
      cancelled = true;
    };
  }, [session, songId, artist, track]);

  if (!session) return null;

  const disabled = !songId || !artist || !track || busy;
  const waiting = !songId || !artist || !track;

  const onClick = async () => {
    const next = !loved;
    setLovedState(next);
    setBusy(true);
    const res = await setLoved(artist, track, next);
    setBusy(false);
    if (!res.ok) {
      setLovedState(!next);
      const { toast } = await import("sonner");
      toast.error(res.message || "Last.fm love failed");
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
      aria-pressed={loved}
      aria-label={loved ? "Unlove on Last.fm" : "Love on Last.fm"}
      title={
        waiting
          ? "Waiting for track info before loving on Last.fm"
          : "Love this track on Last.fm. Note: demoscene track names often do not match Last.fm's catalog, so the loved track may point at a sparse Last.fm page."
      }
      className={`inline-block align-baseline w-[1em] text-center leading-none text-current ${
        waiting ? "opacity-25 cursor-not-allowed" : "cursor-pointer hover:opacity-80"
      } ${loved ? "" : "opacity-25"}`}
    >
      {loved ? "♥" : "♡"}
    </button>
  );
}
