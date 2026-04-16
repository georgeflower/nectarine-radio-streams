import { ReactNode, useEffect, useState } from "react";
import { renderWithSmileys } from "./smileys";
import Flag from "@/components/Flag";
import {
  songUrl,
  artistUrl,
  userUrl,
  groupUrl,
  labelUrl,
  platformUrl,
  compilationUrl,
  themeUrl,
  faqUrl,
  threadUrl,
  forumUrl,
} from "./nectarine";
import { getCachedTitle, requestTitle, subscribe } from "./entityCache";

function EntityLink({
  kind,
  id,
  href,
  fallback,
}: {
  kind: "song" | "artist";
  id: string;
  href: string;
  fallback: string;
}) {
  const [title, setTitle] = useState<string | undefined>(() => getCachedTitle(kind, id));
  useEffect(() => {
    if (!id) return;
    if (!title) requestTitle(kind, id);
    const unsub = subscribe(() => {
      const t = getCachedTitle(kind, id);
      if (t) setTitle(t);
    });
    return unsub;
  }, [kind, id, title]);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary hover:underline"
    >
      {title || fallback}
    </a>
  );
}

// ─── BBCode renderer ───────────────────────────────────────────────────────────
// Supports formatting tags, links/media, and Scenestream entity references.
// Unknown / mismatched tags fall back to literal text. Smileys still render
// inside text leaves via renderWithSmileys.

type Node =
  | { type: "text"; value: string }
  | { type: "tag"; name: string; attr: string; children: Node[] };

const NAMED_COLORS = new Set([
  "red", "green", "blue", "brown", "cyan", "darkblue", "gold", "grey",
  "magenta", "orange", "pink", "purple", "white", "yellow", "black",
]);

const KNOWN_TAGS = new Set([
  "b", "i", "s", "big", "small", "size", "center", "color",
  "silly1", "silly2", "silly3", "silly4", "silly5",
  "code", "pre", "quote",
  "url", "email", "img", "yt",
  "song", "queue", "user", "artist", "group", "label", "platform",
  "compilation", "thread", "forum", "theme", "faq", "flag",
  "table", "tr", "th", "td",
  ...NAMED_COLORS,
]);

// Tokenize + parse into a node tree.
function parse(input: string): Node[] {
  const tokens: Array<
    | { kind: "text"; value: string }
    | { kind: "open"; name: string; attr: string; raw: string }
    | { kind: "close"; name: string; raw: string }
  > = [];
  const re = /\[(\/)?([a-zA-Z][a-zA-Z0-9]*)(?:=([^\]]*))?\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    if (m.index > last) tokens.push({ kind: "text", value: input.slice(last, m.index) });
    const isClose = m[1] === "/";
    const name = m[2].toLowerCase();
    const attr = m[3] ?? "";
    if (!KNOWN_TAGS.has(name)) {
      tokens.push({ kind: "text", value: m[0] });
    } else if (isClose) {
      tokens.push({ kind: "close", name, raw: m[0] });
    } else {
      tokens.push({ kind: "open", name, attr, raw: m[0] });
    }
    last = re.lastIndex;
  }
  if (last < input.length) tokens.push({ kind: "text", value: input.slice(last) });

  // Stack-based parse with mismatch fallback to literal.
  const root: Node[] = [];
  const stack: Array<{ name: string; attr: string; children: Node[]; raw: string }> = [];
  const top = () => (stack.length ? stack[stack.length - 1].children : root);

  for (const t of tokens) {
    if (t.kind === "text") {
      top().push({ type: "text", value: t.value });
    } else if (t.kind === "open") {
      stack.push({ name: t.name, attr: t.attr, children: [], raw: t.raw });
    } else {
      // close
      const idx = [...stack].reverse().findIndex((s) => s.name === t.name);
      if (idx === -1) {
        top().push({ type: "text", value: t.raw });
      } else {
        const realIdx = stack.length - 1 - idx;
        // unwind stray opens as literal
        while (stack.length - 1 > realIdx) {
          const s = stack.pop()!;
          const parent = top();
          parent.push({ type: "text", value: s.raw });
          for (const c of s.children) parent.push(c);
        }
        const s = stack.pop()!;
        top().push({ type: "tag", name: s.name, attr: s.attr, children: s.children });
      }
    }
  }
  // Any unclosed opens become literal text + their children.
  while (stack.length) {
    const s = stack.pop()!;
    const parent = top();
    parent.push({ type: "text", value: s.raw });
    for (const c of s.children) parent.push(c);
  }
  return root;
}

function ExtA({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className ?? "text-primary hover:underline"}
    >
      {children}
    </a>
  );
}

function childrenText(nodes: Node[]): string {
  return nodes
    .map((n) => (n.type === "text" ? n.value : childrenText(n.children)))
    .join("");
}

function renderNodes(nodes: Node[], keyPrefix = ""): ReactNode[] {
  return nodes.map((n, i) => {
    const key = `${keyPrefix}${i}`;
    if (n.type === "text") {
      return <span key={key}>{renderWithSmileys(n.value)}</span>;
    }
    return renderTag(n, key);
  });
}

function renderTag(node: Extract<Node, { type: "tag" }>, key: string): ReactNode {
  const { name, attr, children } = node;
  const inner = () => renderNodes(children, key + "-");
  const text = () => childrenText(children).trim();

  if (NAMED_COLORS.has(name)) {
    return <span key={key} style={{ color: name }}>{inner()}</span>;
  }

  switch (name) {
    case "b": return <strong key={key}>{inner()}</strong>;
    case "i": return <em key={key}>{inner()}</em>;
    case "s": return <s key={key}>{inner()}</s>;
    case "big": return <span key={key} style={{ fontSize: "1.4em" }}>{inner()}</span>;
    case "small": return <span key={key} style={{ fontSize: "0.8em" }}>{inner()}</span>;
    case "size": {
      const n = Math.min(50, Math.max(6, parseInt(attr, 10) || 12));
      return <span key={key} style={{ fontSize: `${n}px` }}>{inner()}</span>;
    }
    case "center": return <div key={key} className="text-center">{inner()}</div>;
    case "color": {
      const c = attr.trim();
      const safe = /^#[0-9a-fA-F]{3,8}$/.test(c) || NAMED_COLORS.has(c.toLowerCase()) ? c : undefined;
      return <span key={key} style={safe ? { color: safe } : undefined}>{inner()}</span>;
    }
    case "silly1": return <span key={key} className="bb-silly1">{inner()}</span>;
    case "silly2": return <span key={key} className="bb-silly2">{inner()}</span>;
    case "silly3": return <span key={key} className="bb-silly3">{inner()}</span>;
    case "silly4": return <span key={key} className="bb-silly4">{inner()}</span>;
    case "silly5": return <span key={key} className="bb-silly5">{inner()}</span>;
    case "code": return <code key={key} className="font-mono bg-muted px-1 rounded-sm">{inner()}</code>;
    case "pre": return <pre key={key} className="font-mono bg-muted p-2 rounded-sm overflow-x-auto text-xs">{inner()}</pre>;
    case "quote": return (
      <blockquote key={key} className="border-l-2 border-border pl-2 my-1 text-muted-foreground">
        {attr ? <div className="text-xs opacity-70">{attr} said:</div> : null}
        {inner()}
      </blockquote>
    );
    case "url": {
      const href = (attr || text()).trim();
      if (!/^https?:\/\//i.test(href)) return <span key={key}>{inner()}</span>;
      return <ExtA key={key} href={href}>{attr ? inner() : href}</ExtA>;
    }
    case "email": {
      const addr = (attr || text()).trim();
      return <ExtA key={key} href={`mailto:${addr}`}>{attr ? inner() : addr}</ExtA>;
    }
    case "img": {
      const src = text();
      if (!/^https?:\/\//i.test(src)) return <span key={key}>{src}</span>;
      return <img key={key} src={src} alt="" loading="lazy" className="inline-block max-w-full max-h-64 align-middle" />;
    }
    case "yt": {
      const id = (attr ? text() : text()).trim();
      const label = attr ? attr : `▶ youtube/${id}`;
      if (!id) return <span key={key}>{label}</span>;
      return <ExtA key={key} href={`https://www.youtube.com/watch?v=${encodeURIComponent(id)}`}>{label}</ExtA>;
    }
    case "song": {
      const id = text();
      const href = songUrl(id);
      return href ? <ExtA key={key} href={href}>♪ song #{id}</ExtA> : <span key={key}>{id}</span>;
    }
    case "queue": {
      const id = text();
      const href = songUrl(id);
      return href ? (
        <ExtA key={key} href={href} className="text-primary hover:underline border border-border rounded-sm px-1 text-xs">
          ▶ queue #{id}
        </ExtA>
      ) : <span key={key}>{id}</span>;
    }
    case "user": {
      const name = text();
      const href = userUrl(name);
      return href ? <ExtA key={key} href={href}>{name}</ExtA> : <span key={key}>{name}</span>;
    }
    case "artist": {
      const id = text();
      const href = artistUrl(id);
      return href ? <ExtA key={key} href={href}>artist #{id}</ExtA> : <span key={key}>{id}</span>;
    }
    case "group": {
      const id = text();
      const href = groupUrl(id);
      return href ? <ExtA key={key} href={href}>group #{id}</ExtA> : <span key={key}>{id}</span>;
    }
    case "label": {
      const id = text();
      const href = labelUrl(id);
      return href ? <ExtA key={key} href={href}>label #{id}</ExtA> : <span key={key}>{id}</span>;
    }
    case "platform": {
      const v = text();
      const href = platformUrl(v);
      return href ? <ExtA key={key} href={href}>{v}</ExtA> : <span key={key}>{v}</span>;
    }
    case "compilation": {
      const v = text();
      const href = compilationUrl(v);
      return href ? <ExtA key={key} href={href}>compilation {v}</ExtA> : <span key={key}>{v}</span>;
    }
    case "thread": {
      const id = text();
      const href = threadUrl(id);
      return href ? <ExtA key={key} href={href}>thread #{id}</ExtA> : <span key={key}>{id}</span>;
    }
    case "forum": {
      const slug = text();
      const href = forumUrl(slug);
      return href ? <ExtA key={key} href={href}>forum/{slug}</ExtA> : <span key={key}>{slug}</span>;
    }
    case "theme": {
      const id = text();
      const href = themeUrl(id);
      return href ? <ExtA key={key} href={href}>theme #{id}</ExtA> : <span key={key}>{id}</span>;
    }
    case "faq": {
      const id = text();
      const href = faqUrl(id);
      return href ? <ExtA key={key} href={href}>FAQ #{id}</ExtA> : <span key={key}>{id}</span>;
    }
    case "flag": {
      const code = text();
      return <Flag key={key} code={code} />;
    }
    case "table": return <table key={key} className="border-collapse border border-border my-1 text-xs">{inner()}</table>;
    case "tr": return <tr key={key} className="border border-border">{inner()}</tr>;
    case "th": return <th key={key} className="border border-border px-1 py-0.5 bg-muted">{inner()}</th>;
    case "td": return <td key={key} className="border border-border px-1 py-0.5">{inner()}</td>;
    default:
      return <span key={key}>{inner()}</span>;
  }
}

export function renderBBCode(text: string): ReactNode[] {
  if (!text) return [];
  const tree = parse(text);
  return renderNodes(tree);
}
