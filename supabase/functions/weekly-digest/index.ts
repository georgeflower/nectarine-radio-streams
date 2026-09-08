// Weekly listening report for the app owner: plays, loves, Last.fm sign-ins.
// Triggered by a weekly cron (with a shared secret) or by the in-app
// "Send digest now" test button (rate-limited, always to the configured owner).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createRawEmail, delta, renderDigestHtml, weekEnd, weekStart, type DigestData } from "./digest.ts";

const TEST_COOLDOWN_MS = 60 * 60 * 1000;
const GMAIL_SEND_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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

    const { data: stats, error: statsErr } = await supabase.rpc("weekly_digest_stats", { week_start: ws });
    if (statsErr) return json({ error: `stats failed: ${statsErr.message}` }, 500);

    const s = stats as Record<string, unknown>;
    const trend = (s.trend as { week_start: string; plays: number; listeners?: number }[]) ?? [];
    const top = (s.top_songs as { title: string; artists: string | null; plays: number }[]) ?? [];
    const busiest = s.busiest_day as { day: string; plays: number } | null;
    const countries = (s.countries as { country: string; listeners: number }[]) ?? [];

    const templateData: DigestData = {
      weekLabel: `${ws} – ${weekEnd(ws)}`,
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
      trend: trend.map((t) => ({ week: t.week_start, plays: Number(t.plays), listeners: Number(t.listeners ?? 0) })),
      listeners: Number(s.listeners ?? 0),
      listenersRaw: Number(s.listeners_raw ?? 0),
      listenersDelta: delta(Number(s.listeners ?? 0), Number(s.prev_listeners ?? 0)),
      countries: countries.map((c) => ({ country: String(c.country ?? "??"), listeners: Number(c.listeners ?? 0) })),
    };

    if (!recipient) {
      return json({ ok: false, error: "DIGEST_RECIPIENT_EMAIL is not configured", preview: templateData }, 200);
    }

    const lovableKey = Deno.env.get("LOVABLE_API_KEY") ?? "";
    const gmailKey = Deno.env.get("GOOGLE_MAIL_API_KEY") ?? "";
    if (!lovableKey || !gmailKey) {
      return json({ ok: false, error: "Gmail connection is not linked", preview: templateData }, 200);
    }

    const subject = `Necta weekly digest ${templateData.weekLabel}: ${templateData.plays} plays, ${templateData.loves} loves${isTest ? " (test)" : ""}`;
    const raw = createRawEmail(recipient, subject, renderDigestHtml(templateData));
    const res = await fetch(GMAIL_SEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": gmailKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) {
      const details = await res.text();
      console.error(`[weekly-digest] Gmail send failed [${res.status}]: ${details}`);
      return json({ ok: false, error: `Gmail send failed (${res.status})`, status: res.status, details }, res.status);
    }
    const sendRes = await res.json().catch(() => null);

    await supabase.from("digest_runs").insert({ week_start: ws, recipient, is_test: isTest });
    return json({ ok: true, week_start: ws, test: isTest, send: sendRes ?? null });
  } catch (e) {
    console.error("[weekly-digest] exception", e);
    return json({ error: String(e) }, 500);
  }
});
