// Weekly listening report for the app owner: plays, loves, Last.fm sign-ins.
// Triggered by a weekly cron (with a shared secret) or by the in-app
// "Send digest now" test button (rate-limited, always to the configured owner).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const TZ = "Europe/Stockholm";
const TEST_COOLDOWN_MS = 60 * 60 * 1000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Calendar date (YYYY-MM-DD) in Stockholm for a given instant. */
function localDate(d: Date): { y: number; m: number; d: number; dow: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dowMap: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return { y: Number(get("year")), m: Number(get("month")), d: Number(get("day")), dow: dowMap[get("weekday")] ?? 0 };
}

const iso = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.toISOString().slice(0, 10);
};

/** Monday of the current Stockholm week, minus `weeksBack` weeks. */
export function weekStart(now: Date, weeksBack: number): string {
  const l = localDate(now);
  const t = new Date(Date.UTC(l.y, l.m - 1, l.d));
  t.setUTCDate(t.getUTCDate() - l.dow - weeksBack * 7);
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function delta(cur: number, prev: number): string {
  if (prev === 0) return cur === 0 ? "±0" : "new";
  const pct = Math.round(((cur - prev) / prev) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const cronSecret = Deno.env.get("DIGEST_CRON_SECRET") ?? "";
  const recipient = Deno.env.get("DIGEST_RECIPIENT_EMAIL") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const body = await req.json().catch(() => ({}));
    const isTest = body?.test === true;
    const provided = req.headers.get("x-digest-secret") ?? "";
    const authorized = cronSecret.length > 0 && provided === cronSecret;

    if (!isTest && !authorized) return json({ error: "unauthorized" }, 401);

    if (isTest) {
      // Public test path: only ever mails the configured owner, at most hourly.
      const since = new Date(Date.now() - TEST_COOLDOWN_MS).toISOString();
      const { count } = await supabase
        .from("digest_runs")
        .select("id", { count: "exact", head: true })
        .eq("is_test", true)
        .gte("sent_at", since);
      if ((count ?? 0) > 0) return json({ error: "A test digest was sent less than an hour ago." }, 429);
    }

    const now = new Date();
    const ws = isTest ? weekStart(now, 0) : weekStart(now, 1);

    if (!isTest) {
      const { data: done } = await supabase
        .from("digest_runs").select("id").eq("week_start", ws).eq("is_test", false).maybeSingle();
      if (done) return json({ ok: true, skipped: "already sent", week_start: ws });
    }

    const { data: stats, error: statsErr } = await supabase
      .schema("private").rpc("weekly_digest_stats", { week_start: ws });
    if (statsErr) return json({ error: `stats failed: ${statsErr.message}` }, 500);

    const s = stats as Record<string, unknown>;
    const trend = (s.trend as { week_start: string; plays: number }[]) ?? [];
    const top = (s.top_songs as { title: string; artists: string | null; plays: number }[]) ?? [];
    const busiest = s.busiest_day as { day: string; plays: number } | null;

    const templateData = {
      weekLabel: `${ws} – ${iso(...(((d) => [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()] as [number, number, number])(new Date(Date.parse(ws) + 6 * 86400000))))}`,
      isTest,
      plays: Number(s.plays ?? 0),
      playsDelta: delta(Number(s.plays ?? 0), Number(s.prev_plays ?? 0)),
      uniqueSongs: Number(s.unique_songs ?? 0),
      loves: Number(s.loves ?? 0),
      unloves: Number(s.unloves ?? 0),
      lovesDelta: delta(Number(s.loves ?? 0), Number(s.prev_loves ?? 0)),
      logins: Number(s.logins ?? 0),
      loginsDelta: delta(Number(s.logins ?? 0), Number(s.prev_logins ?? 0)),
      busiestDay: busiest ? `${busiest.day} (${busiest.plays} plays)` : "—",
      topSongs: top.map((t) => ({ title: t.title, artists: t.artists ?? "", plays: Number(t.plays) })),
      trend: trend.map((t) => ({ week: t.week_start, plays: Number(t.plays) })),
    };

    if (!recipient) {
      return json({ ok: false, error: "DIGEST_RECIPIENT_EMAIL is not configured", preview: templateData }, 200);
    }

    const { data: sendRes, error: sendErr } = await supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName: "weekly-digest",
        recipientEmail: recipient,
        idempotencyKey: isTest ? `weekly-digest-test-${Date.now()}` : `weekly-digest-${ws}`,
        templateData,
      },
    });
    if (sendErr) {
      console.error("[weekly-digest] send failed", sendErr.message);
      return json({ ok: false, error: `send failed: ${sendErr.message}`, preview: templateData }, 502);
    }

    await supabase.from("digest_runs").insert({ week_start: ws, recipient, is_test: isTest });
    return json({ ok: true, week_start: ws, test: isTest, send: sendRes ?? null });
  } catch (e) {
    console.error("[weekly-digest] exception", e);
    return json({ error: String(e) }, 500);
  }
});
