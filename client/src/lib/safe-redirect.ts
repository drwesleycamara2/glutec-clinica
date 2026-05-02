/**
 * Sanitize a `returnTo` URL coming from the query string or storage to prevent
 * open-redirect attacks. Only same-origin paths starting with a single `/`
 * (and not `//`) are allowed; anything else falls back to `/`.
 */
export function safeReturnTo(value: string | null | undefined, fallback: string = "/"): string {
  if (!value || typeof value !== "string") return fallback;

  const trimmed = value.trim();
  if (!trimmed) return fallback;

  // Must start with a single `/` and not `//` (protocol-relative)
  // and must not be a full URL (http:, https:, javascript:, data:, etc.)
  if (trimmed[0] !== "/" || trimmed[1] === "/" || trimmed[1] === "\\") return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return fallback;

  return trimmed;
}
