/**
 * Lightweight HTML sanitizer for rich-text content stored in the database
 * (prescriptions, exam requests, atestados). Strips active content (scripts,
 * iframes, embed/object/form/svg/style/link/meta), inline event handlers
 * (`on*=...`), and dangerous URL schemes (`javascript:`, `data:`, `vbscript:`)
 * in `href`/`src`.
 *
 * Not a full WAF — assume input comes from a WYSIWYG editor with mostly
 * benign HTML. Goal: prevent stored XSS when one user injects markup that is
 * later rendered for another user.
 */

const FORBIDDEN_TAGS = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "svg",
  "math",
  "link",
  "meta",
  "base",
  "applet",
  "frame",
  "frameset",
];

function stripBlock(input: string, tag: string): string {
  const open = new RegExp(`<\\s*${tag}[\\s\\S]*?>`, "gi");
  const close = new RegExp(`<\\s*/\\s*${tag}\\s*>`, "gi");
  const block = new RegExp(`<\\s*${tag}[\\s\\S]*?<\\s*/\\s*${tag}\\s*>`, "gi");
  return input.replace(block, "").replace(open, "").replace(close, "");
}

export function sanitizeHtml(input: unknown): string {
  if (input == null) return "";
  let html = String(input);

  for (const tag of FORBIDDEN_TAGS) {
    html = stripBlock(html, tag);
  }

  // Remove inline event handlers ( onclick=, onerror=, etc.)
  html = html.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  // Strip dangerous URL schemes from href/src/xlink:href
  html = html.replace(
    /(\s(?:href|src|xlink:href|formaction|action))\s*=\s*("|')\s*(javascript|data|vbscript)\s*:[^"']*\2/gi,
    "$1=$2#$2",
  );

  // Strip <a href> / <area href> with javascript: / data: / vbscript: that may
  // have slipped through the more specific pattern above (covers attribute
  // values without quotes).
  html = html.replace(
    /(\s(?:href|src|xlink:href|formaction|action))\s*=\s*(javascript|data|vbscript)\s*:[^\s>]*/gi,
    "$1=#",
  );

  return html;
}
