// Scrapes scenestream.net screenshot page for a song to extract
// the song's screenshot URL and/or its platform-icon URL.
// Used to populate the OS lockscreen / notification artwork via MediaSession.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BASE = "https://scenestream.net";

function absolutize(src: string): string {
  if (/^https?:\/\//i.test(src)) return src;
  if (src.startsWith("/")) return `${BASE}${src}`;
  return `${BASE}/${src}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const url = new URL(req.url);
    const songId = (url.searchParams.get("songId") ?? "").trim();
    if (!/^\d+$/.test(songId)) {
      return new Response(JSON.stringify({ error: "Invalid songId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const upstream = `${BASE}/demovibes/screenshot/${songId}/`;
    const resp = await fetch(upstream, { headers: { Accept: "text/html,*/*" } });
    const html = await resp.text();

    const screenshotMatch =
      html.match(/<img[^>]+class=["']screenshot["'][^>]+src=["']([^"']+)["']/i) ||
      html.match(/<img[^>]+src=["']([^"']+)["'][^>]+class=["']screenshot["']/i);

    const platformMatch =
      html.match(/<img[^>]+class=["']platform_icon["'][^>]+src=["']([^"']+)["']/i) ||
      html.match(/<img[^>]+src=["']([^"']+)["'][^>]+class=["']platform_icon["']/i);

    const screenshotUrl = screenshotMatch ? absolutize(screenshotMatch[1]) : undefined;
    const platformIconUrl = platformMatch ? absolutize(platformMatch[1]) : undefined;

    return new Response(
      JSON.stringify({ songId, screenshotUrl, platformIconUrl }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
        },
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
