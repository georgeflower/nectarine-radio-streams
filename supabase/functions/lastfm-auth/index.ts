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
  try {
    const { token } = await req.json();
    if (!token || typeof token !== "string") {
      return new Response(JSON.stringify({ error: "missing token" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await signedCall({ method: "auth.getSession", token });
    if (data?.session?.key) {
      return new Response(JSON.stringify({
        sessionKey: data.session.key,
        username: data.session.name,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: data?.message || "auth failed", raw: data }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
