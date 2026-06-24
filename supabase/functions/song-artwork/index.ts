// Scrapes scenestream.net for a song's screenshot URL.
// Used to populate the OS lockscreen / notification artwork via MediaSession.
//
// Two-step lookup: the song page (/demovibes/song/{songId}/) contains a link
// to its screenshot page (/demovibes/screenshot/{screenshotId}/) — the IDs do
// NOT match. We follow that link to grab the actual screenshot image.

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

// Route an image URL through wsrv.nl so GIF screenshots are delivered as
// static PNGs (iOS MediaSession will not render animated GIF artwork).
function toPng(src: string, size = 512): string {
  const u = src.replace(/^https?:\/\//i, "");
  return `https://wsrv.nl/?url=${encodeURIComponent(u)}&output=png&n=-1&w=${size}&h=${size}&fit=contain&we`;
}

function findScreenshotImg(html: string): string | undefined {
  const m =
    html.match(/<img[^>]+class=["']screenshot["'][^>]+src=["']([^"']+)["']/i) ||
    html.match(/<img[^>]+src=["']([^"']+)["'][^>]+class=["']screenshot["']/i);
  return m ? absolutize(m[1]) : undefined;
}

function findScreenshotId(html: string): string | undefined {
  const m = html.match(/\/demovibes\/screenshot\/(\d+)\//);
  return m ? m[1] : undefined;
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

    // 1. Fetch the song page.
    const songResp = await fetch(`${BASE}/demovibes/song/${songId}/`, {
      headers: { Accept: "text/html,*/*" },
    });
    const songHtml = await songResp.text();

    const screenshotId = findScreenshotId(songHtml);

    // 2. If the song has a screenshot link, follow it to get the image.
    let rawScreenshot: string | undefined;
    if (screenshotId) {
      try {
        const ssResp = await fetch(
          `${BASE}/demovibes/screenshot/${screenshotId}/`,
          { headers: { Accept: "text/html,*/*" } },
        );
        const ssHtml = await ssResp.text();
        rawScreenshot = findScreenshotImg(ssHtml);
      } catch {
        /* ignore — no screenshot available */
      }
    }

    const screenshotUrl = rawScreenshot ? toPng(rawScreenshot, 512) : undefined;

    return new Response(
      JSON.stringify({ songId, screenshotId, screenshotUrl }),
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
