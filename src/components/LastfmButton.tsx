import { useLastfm } from "@/lib/lastfm";

type Props = { compact?: boolean };

const LastfmButton = ({ compact }: Props) => {
  const { session, login, logout } = useLastfm();
  const base =
    "min-h-9 px-3 py-1 text-[10px] uppercase tracking-widest rounded-sm border transition-colors touch-manipulation shrink-0";
  if (session) {
    return (
      <button
        type="button"
        onClick={() => {
          if (confirm(`Disconnect Last.fm (${session.username})?`)) logout();
        }}
        className={`${base} border-primary bg-primary/20 text-foreground hover:bg-primary/30`}
        title={`Connected to Last.fm as ${session.username}`}
      >
        {compact ? `♪ ${session.username}` : `Last.fm: ${session.username}`}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={login}
      className={`${base} border-border bg-card/60 text-muted-foreground hover:text-foreground`}
      title="Connect to Last.fm to scrobble your listening"
    >
      {compact ? "♪ Last.fm" : "Connect Last.fm"}
    </button>
  );
};

export default LastfmButton;
