// Streaming CORS proxy for audio streams (Shoutcast/Icecast).
// Allows MediaElementSource to be non-tainted so AnalyserNode gets real PCM data.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Expose-Headers":
    "content-length, content-range, accept-ranges, content-type",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
};

const ALLOWED_HOSTS = new Set([
  "nectarine.ers35.net",
  "necta.burn.net",
  "nectarine.inversi0n.org",
  "nectarine.shakeme.info",
  "scenestream.io",
  "nectarine.from-de.com",
  "pmaster.no",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const target = url.searchParams.get("url");
    if (!target) {
      return new Response(JSON.stringify({ error: "Missing url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let upstream: URL;
    try {
      upstream = new URL(target);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["http:", "https:"].includes(upstream.protocol)) {
      return new Response(JSON.stringify({ error: "Bad protocol" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!ALLOWED_HOSTS.has(upstream.hostname)) {
      return new Response(JSON.stringify({ error: "Host not allowed" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Forward Range so seeking/resume works for any seekable streams
    const fwdHeaders: HeadersInit = {
      "User-Agent": "Mozilla/5.0 (compatible; NectarineProxy/1.0)",
      Accept: "*/*",
    };
    const range = req.headers.get("range");
    if (range) (fwdHeaders as Record<string, string>).Range = range;

    const upstreamResp = await fetch(upstream.toString(), {
      method: req.method,
      headers: fwdHeaders,
    });

    const respHeaders = new Headers(corsHeaders);
    const ct = upstreamResp.headers.get("content-type");
    if (ct) respHeaders.set("Content-Type", ct);
    const cl = upstreamResp.headers.get("content-length");
    if (cl) respHeaders.set("Content-Length", cl);
    const cr = upstreamResp.headers.get("content-range");
    if (cr) respHeaders.set("Content-Range", cr);
    const ar = upstreamResp.headers.get("accept-ranges");
    if (ar) respHeaders.set("Accept-Ranges", ar);
    respHeaders.set("Cache-Control", "no-store");

    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      headers: respHeaders,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
