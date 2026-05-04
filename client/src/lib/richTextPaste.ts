const BASE_TEXT_STYLE = "font-family: Montserrat, sans-serif; font-size: 14px";

const FORBIDDEN_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "FORM",
  "SVG",
  "MATH",
  "LINK",
  "META",
  "BASE",
]);

const ALLOWED_TAGS = new Set([
  "A",
  "B",
  "BLOCKQUOTE",
  "BR",
  "DIV",
  "EM",
  "H1",
  "H2",
  "H3",
  "I",
  "LI",
  "OL",
  "P",
  "S",
  "SPAN",
  "STRIKE",
  "STRONG",
  "U",
  "UL",
]);

const TEXT_CONTAINER_TAGS = new Set([
  "A",
  "B",
  "DIV",
  "EM",
  "H1",
  "H2",
  "H3",
  "I",
  "LI",
  "P",
  "S",
  "SPAN",
  "STRIKE",
  "STRONG",
  "U",
]);

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function plainTextToHtml(text: string) {
  const normalized = String(text ?? "").replace(/\r\n/g, "\n");
  if (!normalized.trim()) return "";

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => {
      const html = paragraph
        .split("\n")
        .map((line) => escapeHtml(line))
        .join("<br>");
      return `<p><span style="${BASE_TEXT_STYLE}">${html}</span></p>`;
    })
    .join("");
}

function removeDangerousAttributes(element: Element) {
  Array.from(element.attributes).forEach((attribute) => {
    const name = attribute.name.toLowerCase();
    const value = attribute.value.trim().toLowerCase();
    if (name.startsWith("on")) {
      element.removeAttribute(attribute.name);
      return;
    }
    if (["href", "src", "xlink:href", "formaction", "action"].includes(name)) {
      if (/^(javascript|data|vbscript):/i.test(value)) {
        element.setAttribute(attribute.name, "#");
      }
      return;
    }
    if (name !== "href" && name !== "target" && name !== "rel") {
      element.removeAttribute(attribute.name);
    }
  });
}

function unwrapElement(element: Element) {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }
  parent.removeChild(element);
}

function wrapChildren(element: Element, tagName: string) {
  const wrapper = element.ownerDocument.createElement(tagName);
  while (element.firstChild) {
    wrapper.appendChild(element.firstChild);
  }
  element.appendChild(wrapper);
}

function styleIndicatesBold(style: CSSStyleDeclaration, rawStyle: string) {
  const weight = style.fontWeight || "";
  return /bold|bolder/i.test(weight) || Number.parseInt(weight, 10) >= 600 || /font-weight\s*:\s*(bold|bolder|[6-9]00)/i.test(rawStyle);
}

function styleIndicatesItalic(style: CSSStyleDeclaration, rawStyle: string) {
  return /italic|oblique/i.test(style.fontStyle || "") || /font-style\s*:\s*(italic|oblique)/i.test(rawStyle);
}

function styleIndicatesUnderline(style: CSSStyleDeclaration, rawStyle: string) {
  return /underline/i.test(style.textDecoration || style.textDecorationLine || "") || /text-decoration[^;]*underline/i.test(rawStyle);
}

function sanitizeElement(element: Element) {
  if (FORBIDDEN_TAGS.has(element.tagName)) {
    element.remove();
    return;
  }

  Array.from(element.children).forEach(sanitizeElement);

  if (!ALLOWED_TAGS.has(element.tagName)) {
    unwrapElement(element);
    return;
  }

  const rawStyle = element.getAttribute("style") || "";
  const style = (element as HTMLElement).style;
  const shouldWrapBold = !["B", "STRONG"].includes(element.tagName) && styleIndicatesBold(style, rawStyle);
  const shouldWrapItalic = !["I", "EM"].includes(element.tagName) && styleIndicatesItalic(style, rawStyle);
  const shouldWrapUnderline = element.tagName !== "U" && styleIndicatesUnderline(style, rawStyle);

  removeDangerousAttributes(element);

  if (shouldWrapUnderline) wrapChildren(element, "u");
  if (shouldWrapItalic) wrapChildren(element, "em");
  if (shouldWrapBold) wrapChildren(element, "strong");

  if (TEXT_CONTAINER_TAGS.has(element.tagName)) {
    element.setAttribute("style", BASE_TEXT_STYLE);
  }

  if (element.tagName === "A") {
    element.setAttribute("rel", "noopener noreferrer");
    element.setAttribute("target", "_blank");
  }
}

export function normalizeRichTextPaste(html?: string | null, text?: string | null) {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return plainTextToHtml(text || html || "");
  }

  const source = String(html || "").trim() || plainTextToHtml(String(text || ""));
  if (!source) return "";

  const doc = new DOMParser().parseFromString(`<body>${source}</body>`, "text/html");
  Array.from(doc.body.children).forEach(sanitizeElement);

  const result = doc.body.innerHTML.trim();
  return result || plainTextToHtml(String(text || ""));
}
