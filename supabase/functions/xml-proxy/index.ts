// Public proxy for scenestream.net demovibes XML API (no CORS upstream).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_PREFIXES = [
  "queue",
  "oneliner",
  "online",
  "streams",
  "artist/",
  "song/",
  "group/",
  "compilation/",
  "user/",
];

function isAllowed(path: string): boolean {
  if (path === "queue" || path === "oneliner" || path === "online" || path === "streams") {
    return true;
  }
  return ALLOWED_PREFIXES.some((p) => p.endsWith("/") && path.startsWith(p));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const rawPath = (url.searchParams.get("path") ?? "").trim();
    // strip leading/trailing slashes; only allow safe chars
    const path = rawPath.replace(/^\/+|\/+$/g, "");

    if (!path || !/^[A-Za-z0-9_\-/]+$/.test(path) || path.includes("..")) {
      return new Response(JSON.stringify({ error: "Invalid path" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isAllowed(path)) {
      return new Response(JSON.stringify({ error: "Path not allowed" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const upstream = `https://scenestream.net/demovibes/xml/${path}/`;
    const resp = await fetch(upstream, {
      headers: { Accept: "application/xml,text/xml,*/*" },
    });
    const body = await resp.text();

    return new Response(body, {
      status: resp.status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=10",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
