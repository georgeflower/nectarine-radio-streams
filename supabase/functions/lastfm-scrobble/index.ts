import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { crypto as stdCrypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";

const API_KEY = Deno.env.get("LASTFM_API_KEY")!;
const API_SECRET = Deno.env.get("LASTFM_API_SECRET")!;
const API_ROOT = "https://ws.audioscrobbler.com/2.0/";

const toHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");

async function md5(s: string): Promise<string> {
  const buf = await stdCrypto.subtle.digest("MD5", new TextEncoder().encode(s));
  return toHex(buf);
}

async function signedCall(params: Record<string, string>) {
  const all: Record<string, string> = { ...params, api_key: API_KEY };
  const sigBase = Object.keys(all).sort().map((k) => `${k}${all[k]}`).join("") + API_SECRET;
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
    const { action, sessionKey, artist, track, album, timestamp, duration, username } =
      await req.json();

    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    // getinfo is an unsigned public read and needs a username instead of a session key.
    const needsSession = action !== "getinfo";
    if (!action || !artist || !track || (needsSession && !sessionKey) ||
        (action === "getinfo" && !username)) {
      return json({ error: "missing fields" }, 400);
    }

    if (action === "getinfo") {
      const q = new URLSearchParams({
        method: "track.getInfo",
        api_key: API_KEY,
        artist: String(artist),
        track: String(track),
        username: String(username),
        autocorrect: "1",
        format: "json",
      });
      const res = await fetch(`${API_ROOT}?${q}`);
      return json(await res.json());
    }

    const params: Record<string, string> = {
      sk: String(sessionKey),
      artist: String(artist),
      track: String(track),
    };
    if (album) params.album = String(album);
    if (duration) params.duration = String(Math.floor(Number(duration)));

    if (action === "nowplaying") {
      params.method = "track.updateNowPlaying";
    } else if (action === "scrobble") {
      params.method = "track.scrobble";
      params.timestamp = String(timestamp ?? Math.floor(Date.now() / 1000));
    } else if (action === "love") {
      params.method = "track.love";
      delete params.album;
      delete params.duration;
    } else if (action === "unlove") {
      params.method = "track.unlove";
      delete params.album;
      delete params.duration;
    } else {
      return json({ error: "bad action" }, 400);
    }
    const data = await signedCall(params);
    return json(data);
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
