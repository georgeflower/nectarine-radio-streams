// Records every request that actually leaves for scenestream.net, plus the
// ones our own database served instead. Fire-and-forget: never blocks or
// breaks the caller.
import { createClient } from "npm:@supabase/supabase-js@2";

export type UpstreamEndpoint =
  | "queue" | "oneliner" | "online" | "streams"
  | "song" | "artist" | "group" | "compilation" | "user" | "other";
export type UpstreamOutcome = "fetched" | "cache" | "claimed" | "error";
export type UpstreamSource = "xml-proxy" | "song-refresh";

const PRUNE_PROBABILITY = 0.01;
const RETENTION_DAYS = 30;

export function endpointOf(path: string): UpstreamEndpoint {
  const head = path.split("/")[0];
  switch (head) {
    case "queue":
    case "oneliner":
    case "online":
    case "streams":
    case "song":
    case "artist":
    case "group":
    case "compilation":
    case "user":
      return head;
    default:
      return "other";
  }
}

export function entityIdOf(path: string): string | null {
  const parts = path.split("/");
  return parts.length > 1 && parts[1] ? parts[1] : null;
}

export function logUpstream(entry: {
  endpoint: UpstreamEndpoint;
  entityId?: string | null;
  outcome: UpstreamOutcome;
  source: UpstreamSource;
  status?: number | null;
}): void {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const work = (async () => {
      const { error } = await supabase.from("upstream_fetches").insert({
        endpoint: entry.endpoint,
        entity_id: entry.entityId ?? null,
        outcome: entry.outcome,
        source: entry.source,
        status: entry.status ?? null,
      });
      if (error) console.error("upstream ledger insert failed", error.message);
      if (Math.random() < PRUNE_PROBABILITY) {
        const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
        await supabase.from("upstream_fetches").delete().lt("created_at", cutoff);
      }
    })();
    // Keep the isolate alive until the write lands, without awaiting it.
    const waiter = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
    if (waiter?.waitUntil) waiter.waitUntil(work);
    else void work.catch(() => {});
  } catch (e) {
    console.error("upstream ledger error", e instanceof Error ? e.message : e);
  }
}
