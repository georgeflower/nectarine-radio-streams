import { useLastfm } from "@/lib/lastfm";

type Props = {
  /** Smaller pill style for the Cracktro settings row. */
  compact?: boolean;
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
