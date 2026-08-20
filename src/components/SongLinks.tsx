import { useEffect, useState } from "react";
import { getCachedInfo, requestInfo, subscribe } from "@/lib/entityCache";

type LinkRow = {
  source_id: string;
  source_name: string | null;
  url: string | null;
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

const readLinks = (songId: string): LinkRow[] =>
  (getCachedInfo("song", songId)?.links ?? []).map((l) => ({
    source_id: l.sourceId,
    source_name: l.sourceName,
    url: l.url,
  }));

const SongLinks = ({ songId, isNowPlaying = false }: { songId: string; isNowPlaying?: boolean }) => {
  const [rows, setRows] = useState<LinkRow[]>(() => readLinks(songId));

  useEffect(() => {
    setRows(readLinks(songId));
    requestInfo("song", songId, isNowPlaying ? "now" : "background");
    return subscribe(() => setRows(readLinks(songId)));
  }, [songId, isNowPlaying]);


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
          className="text-xs uppercase tracking-[0.15em] text-foreground hover:opacity-80 py-2 -my-2 inline-block"
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
          className="text-xs uppercase tracking-[0.15em] text-foreground hover:opacity-80 py-2 -my-2 inline-block"
        >
          {r.source_name ?? r.source_id}
        </a>
      ))}
    </p>
  );
};

export default SongLinks;
