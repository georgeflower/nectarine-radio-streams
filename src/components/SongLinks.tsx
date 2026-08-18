import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type LinkRow = {
  source_id: string;
  source_name: string | null;
  url: string | null;
};

const cache = new Map<string, LinkRow[]>();

const fetchLinks = async (songId: string): Promise<LinkRow[]> => {
  const { data, error } = await supabase
    .from("song_links")
    .select("source_id, source_name, url")
    .eq("song_id", songId);
  if (error) throw error;
  return (data ?? []) as LinkRow[];
};

const modArchiveDownload = (rows: LinkRow[]): string | null => {
  const row = rows.find((r) => r.source_id === "10" && r.url);
  if (!row?.url) return null;
  try {
    const id = new URL(row.url).searchParams.get("query");
    if (!id || !/^\d+$/.test(id)) return null;
    return `https://api.modarchive.org/downloads.php?moduleid=${id}`;
  } catch {
    return null;
  }
};

const SongLinks = ({ songId }: { songId: string }) => {
  const [rows, setRows] = useState<LinkRow[]>(() => cache.get(songId) ?? []);

  useEffect(() => {
    let cancelled = false;
    const cached = cache.get(songId);
    setRows(cached ?? []);
    if (cached && cached.length > 0) return;

    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const run = async (isRetry: boolean) => {
      try {
        const data = await fetchLinks(songId);
        if (cancelled) return;
        if (data.length === 0 && !isRetry) {
          retryTimer = setTimeout(() => void run(true), 3000);
          return;
        }
        cache.set(songId, data);
        setRows(data);
      } catch {
        // supplementary info — never surface errors
      }
    };

    void run(false);
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [songId]);

  const valid = rows.filter((r) => !!r.url);
  if (valid.length === 0) return null;

  const download = modArchiveDownload(valid);
  const sorted = [...valid].sort((a, b) =>
    (a.source_name ?? a.source_id).localeCompare(b.source_name ?? b.source_id),
  );

  return (
    <p className="text-sm mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-muted-foreground text-[10px] uppercase tracking-[0.25em]">Extra Resources</span>
      {download && (
        <a
          href={download}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs uppercase tracking-[0.15em] text-foreground hover:opacity-80"
        >
          ⬇ Download
        </a>
      )}
      {sorted.map((r) => (
        <a
          key={`${r.source_id}-${r.url}`}
          href={r.url as string}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs uppercase tracking-[0.15em] text-foreground hover:opacity-80"
        >
          {r.source_name ?? r.source_id}
        </a>
      ))}
    </p>
  );
};

export default SongLinks;
