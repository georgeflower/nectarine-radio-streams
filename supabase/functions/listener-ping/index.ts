// Once-a-day listener ping: records (day, browser id, country, salted network
// hash) so the weekly digest can count unique listeners per country.
// The IP address is never stored; only a weekly-salted hash of IP + UA.
// Always answers 200 so it can never disturb playback.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const ok = (body: Record<string, unknown> = { ok: true }) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const COUNTRY_HEADERS = ["cf-ipcountry", "x-vercel-ip-country", "x-country", "x-appengine-country", "fly-region-country"];

const isoWeekKey = (d: Date): string => {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const y = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${week}`;
};

const sha256Hex = async (s: string): Promise<string> => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
};

const clientIp = (req: Request): string | null => {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? req.headers.get("cf-connecting-ip");
};

const isPrivateIp = (ip: string) =>
  /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i.test(ip);

async function lookupCountry(req: Request, ip: string | null): Promise<string> {
  for (const h of COUNTRY_HEADERS) {
    const v = req.headers.get(h)?.trim().toUpperCase();
    if (v && /^[A-Z]{2}$/.test(v) && v !== "XX" && v !== "T1") return v;
  }
  if (!ip || isPrivateIp(ip)) return "??";
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/country/`, {
      signal: ctrl.signal,
      headers: { "User-Agent": "necta-compact/1.0 (weekly listener stats)" },
    });
    clearTimeout(timer);
    if (!res.ok) return "??";
    const text = (await res.text()).trim().toUpperCase();
    return /^[A-Z]{2}$/.test(text) ? text : "??";
  } catch {
    return "??";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return ok({ ok: false });

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const clientId = typeof body.client_id === "string" ? body.client_id.trim() : "";
    if (clientId.length < 8 || clientId.length > 100 || !/^[\w.-]+$/.test(clientId)) return ok({ ok: false });
    const platform = typeof body.platform === "string" ? body.platform.slice(0, 30) : null;

    const now = new Date();
    const day = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" }); // YYYY-MM-DD
    const ip = clientIp(req);
    const ua = req.headers.get("user-agent") ?? "";
    const salt = `${Deno.env.get("DIGEST_CRON_SECRET") ?? "necta"}|${isoWeekKey(now)}`;
    const netHash = ip ? await sha256Hex(`${salt}|${ip}|${ua}`) : null;
    const country = await lookupCountry(req, ip);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: existing } = await supabase
      .from("listener_days").select("id, country").eq("day", day).eq("client_id", clientId).maybeSingle();

    if (existing) {
      await supabase.from("listener_days").update({
        last_seen_at: now.toISOString(),
        net_hash: netHash,
        ...(existing.country === "??" && country !== "??" ? { country } : {}),
      }).eq("id", existing.id);
    } else {
      const { error } = await supabase.from("listener_days").insert({
        day, client_id: clientId, net_hash: netHash, country, platform,
      });
      if (error && !/duplicate/i.test(error.message)) console.error("listener-ping insert failed", error.message);
    }
    return ok({ ok: true, country });
  } catch (e) {
    console.error("listener-ping error", e instanceof Error ? e.message : e);
    return ok({ ok: false });
  }
});
