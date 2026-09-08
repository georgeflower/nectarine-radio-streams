// Pure helpers for the weekly digest: week maths, deltas, HTML rendering,
// and Gmail raw-message encoding. No I/O here so it can be unit-tested.

const TZ = "Europe/Stockholm";

export type DigestData = {
  weekLabel: string;
  isTest: boolean;
  plays: number;
  playsDelta: string;
  uniqueSongs: number;
  loves: number;
  unloves: number;
  lovesDelta: string;
  logins: number;
  loginsDelta: string;
  busiestDay: string;
  topSongs: { title: string; artists: string; plays: number }[];
  trend: { week: string; plays: number }[];
};

function localDate(d: Date): { y: number; m: number; d: number; dow: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dowMap: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return { y: Number(get("year")), m: Number(get("month")), d: Number(get("day")), dow: dowMap[get("weekday")] ?? 0 };
}

/** Monday (YYYY-MM-DD) of the current Stockholm week, minus `weeksBack` weeks. */
export function weekStart(now: Date, weeksBack: number): string {
  const l = localDate(now);
  const t = new Date(Date.UTC(l.y, l.m - 1, l.d));
  t.setUTCDate(t.getUTCDate() - l.dow - weeksBack * 7);
  return t.toISOString().slice(0, 10);
}

export function weekEnd(ws: string): string {
  return new Date(Date.parse(ws) + 6 * 86400000).toISOString().slice(0, 10);
}

export function delta(cur: number, prev: number): string {
  if (prev === 0) return cur === 0 ? "±0" : "new";
  const pct = Math.round(((cur - prev) / prev) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function renderDigestHtml(d: DigestData): string {
  const stat = (label: string, value: string | number, sub?: string) =>
    `<td style="padding:12px 16px;border:1px solid #2a2a3a;background:#14141c;vertical-align:top">
      <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#9a9ab0">${esc(label)}</div>
      <div style="font-size:26px;font-weight:700;color:#ffb347;margin-top:4px">${esc(value)}</div>
      ${sub ? `<div style="font-size:12px;color:#9a9ab0;margin-top:2px">${esc(sub)}</div>` : ""}
    </td>`;

  const max = Math.max(1, ...d.trend.map((t) => t.plays));
  const trendRows = d.trend.map((t) =>
    `<tr>
      <td style="padding:4px 8px;color:#9a9ab0;font-size:12px;white-space:nowrap">${esc(t.week)}</td>
      <td style="padding:4px 8px;width:100%">
        <div style="background:#ffb347;height:10px;width:${Math.max(2, Math.round((t.plays / max) * 100))}%"></div>
      </td>
      <td style="padding:4px 8px;color:#e8e8f0;font-size:12px;text-align:right">${t.plays}</td>
    </tr>`).join("");

  const topRows = d.topSongs.length
    ? d.topSongs.map((s, i) =>
      `<tr>
        <td style="padding:6px 8px;color:#9a9ab0;font-size:12px">${i + 1}.</td>
        <td style="padding:6px 8px;color:#e8e8f0;font-size:13px">${esc(s.title)}${s.artists ? `<span style="color:#9a9ab0"> — ${esc(s.artists)}</span>` : ""}</td>
        <td style="padding:6px 8px;color:#ffb347;font-size:13px;text-align:right;white-space:nowrap">${s.plays} ${s.plays === 1 ? "play" : "plays"}</td>
      </tr>`).join("")
    : `<tr><td style="padding:6px 8px;color:#9a9ab0;font-size:13px">No plays this week.</td></tr>`;

  return `<!doctype html><html><body style="margin:0;background:#0b0b10;font-family:ui-monospace,Menlo,Consolas,monospace;color:#e8e8f0">
<div style="max-width:600px;margin:0 auto;padding:24px 16px">
  <div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#ffb347">Necta · weekly digest${d.isTest ? " · test" : ""}</div>
  <h1 style="font-size:20px;margin:6px 0 18px;color:#ffffff">Week ${esc(d.weekLabel)}</h1>
  <table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:separate;border-spacing:6px 6px">
    <tr>${stat("Plays", d.plays, `${d.playsDelta} vs last week`)}${stat("Unique songs", d.uniqueSongs)}</tr>
    <tr>${stat("Loves", d.loves, `${d.lovesDelta} vs last week${d.unloves ? ` · ${d.unloves} unloved` : ""}`)}${stat("Last.fm sign-ins", d.logins, `${d.loginsDelta} vs last week`)}</tr>
  </table>
  <p style="font-size:13px;color:#9a9ab0;margin:14px 0 20px">Busiest day: <span style="color:#e8e8f0">${esc(d.busiestDay)}</span></p>
  <h2 style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#9a9ab0;margin:0 0 6px">Top songs</h2>
  <table cellspacing="0" cellpadding="0" style="width:100%;border:1px solid #2a2a3a;background:#14141c">${topRows}</table>
  <h2 style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#9a9ab0;margin:22px 0 6px">Plays, last 4 weeks</h2>
  <table cellspacing="0" cellpadding="0" style="width:100%;border:1px solid #2a2a3a;background:#14141c">${trendRows}</table>
  <p style="font-size:11px;color:#5a5a70;margin-top:24px">Weeks run Monday–Sunday, Stockholm time.</p>
</div></body></html>`;
}

const b64 = (s: string) =>
  btoa(Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join(""));
const header = (v: string) => (/^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`);

/** Base64url-encoded RFC 2822 message for Gmail's messages.send. */
export function createRawEmail(to: string, subject: string, html: string): string {
  const email = [
    `To: ${to}`,
    `Subject: ${header(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    html,
  ].join("\r\n");
  return b64(email).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
