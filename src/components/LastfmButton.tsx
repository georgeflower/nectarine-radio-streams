import { useEffect, useState } from "react";
import {
  getLastfmActivity,
  isLastfmStatusVisible,
  subscribeLastfmActivity,
  subscribeLastfmStatusVisible,
  useLastfm,
  type LastfmActivity,
} from "@/lib/lastfm";

type Props = {
  /** Smaller pill style for the Cracktro settings row. */
  compact?: boolean;
};

const announceLabel: Record<LastfmActivity["announce"], string> = {
  idle: "Now playing not sent",
  sending: "Sending now playing",
  ok: "Now playing sent",
  failed: "Now playing failed",
};

const scrobbleLabel: Record<LastfmActivity["scrobble"], string> = {
  idle: "No scrobble pending",
  pending: "Scrobble pending",
  ok: "Scrobble accepted by Last.fm",
  failed: "Scrobble failed",
};

const lightClass = (state: string): string => {
  if (state === "ok") return "bg-primary";
  if (state === "failed") return "bg-destructive";
  if (state === "sending" || state === "pending")
    return "bg-muted-foreground/25 motion-safe:animate-pulse";
  return "bg-muted-foreground/25";
};

const ActivityLights = () => {
  const [visible, setVisible] = useState(isLastfmStatusVisible);
  const [activity, setActivity] = useState<LastfmActivity>(getLastfmActivity);

  useEffect(() => subscribeLastfmStatusVisible(setVisible), []);
  useEffect(() => subscribeLastfmActivity(setActivity), []);

  if (!visible) return null;

  const label = `${announceLabel[activity.announce]} · ${scrobbleLabel[activity.scrobble]}`;
  const glow = { boxShadow: "var(--glow-primary)" };

  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className="flex items-center gap-[3px] shrink-0"
    >
      <span
        className={`w-1.5 h-1.5 rounded-[1px] ${lightClass(activity.announce)}`}
        style={activity.announce === "ok" ? glow : undefined}
      />
      <span
        className={`w-1.5 h-1.5 rounded-[1px] ${lightClass(activity.scrobble)}`}
        style={activity.scrobble === "ok" ? glow : undefined}
      />
    </span>
  );
};

const LastfmButton = ({ compact }: Props) => {
  const { session, login, logout } = useLastfm();

  const sizing = compact
    ? "min-h-9 px-3 py-1 text-[10px]"
    : "min-h-11 px-3 py-2 text-xs";
  const base = `${sizing} uppercase tracking-widest rounded-sm border transition-colors touch-manipulation shrink-0`;

  if (session) {
    return (
      <div className="flex items-center gap-1 shrink-0">
        <span
          className={`${sizing} uppercase tracking-widest rounded-sm border border-primary bg-primary/20 text-foreground flex items-center`}
          title={`Connected to Last.fm as ${session.username}`}
        >
          ♪ {session.username}
        </span>
        <ActivityLights />
        <button
          type="button"
          onClick={logout}
          className={`${base} border-border bg-card/60 text-muted-foreground hover:text-foreground hover:border-primary/60`}
          title="Disconnect Last.fm and stop scrobbling"
        >
          Disconnect Last.fm
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={login}
      className={`${base} border-primary/60 bg-card/60 text-primary hover:bg-primary hover:text-primary-foreground`}
      title="Connect to Last.fm to scrobble your listening"
    >
      Connect Last.fm
    </button>
  );
};

export default LastfmButton;
