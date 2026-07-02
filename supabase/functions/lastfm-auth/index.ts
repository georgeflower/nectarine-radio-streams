import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { crypto as stdCrypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";

const API_KEY = Deno.env.get("LASTFM_API_KEY")!;
const API_SECRET = Deno.env.get("LASTFM_API_SECRET")!;
const API_ROOT = "https://ws.audioscrobbler.com/2.0/";

const toHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

async function md5(s: string): Promise<string> {
  const buf = await stdCrypto.subtle.digest("MD5", new TextEncoder().encode(s));
  return toHex(buf);
}

function keyMeta(k: string | undefined) {
  if (!k) return { present: false };
  return {
    present: true,
    len: k.length,
    prefix: k.slice(0, 4),
    suffix: k.slice(-4),
  };
}

async function signedCall(params: Record<string, string>) {
  const all: Record<string, string> = { ...params, api_key: API_KEY };
  const sigBase = Object.keys(all)
    .sort()
    .map((k) => `${k}${all[k]}`)
    .join("") + API_SECRET;
  const api_sig = await md5(sigBase);
  const body = new URLSearchParams({ ...all, api_sig, format: "json" });
  const res = await fetch(API_ROOT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const meta = { apiKey: keyMeta(API_KEY), apiSecret: keyMeta(API_SECRET) };

  try {
    const { token, diag } = await req.json().catch(() => ({}));

    // Diagnostic ping: returns config metadata (no secrets leaked) so the
    // client can verify the edge function has matching credentials loaded.
    if (diag === true) {
      return new Response(JSON.stringify({ ok: true, meta }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!token || typeof token !== "string") {
      return new Response(JSON.stringify({ error: "missing token", meta }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!API_KEY || !API_SECRET) {
      console.error("[lastfm-auth] Missing LASTFM_API_KEY / LASTFM_API_SECRET secrets", meta);
      return new Response(
        JSON.stringify({ error: "server misconfigured: missing Last.fm secrets", meta }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await signedCall({ method: "auth.getSession", token });
    if (data?.session?.key) {
      return new Response(
        JSON.stringify({
          sessionKey: data.session.key,
          username: data.session.name,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.warn("[lastfm-auth] auth.getSession failed", {
      lastfmMessage: data?.message,
      lastfmError: data?.error,
      apiKeyMeta: meta.apiKey,
    });
    return new Response(
      JSON.stringify({
        error: data?.message || "auth failed",
        lastfmError: data?.error ?? null,
        meta,
        raw: data,
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[lastfm-auth] exception", e);
    return new Response(JSON.stringify({ error: String(e), meta }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
