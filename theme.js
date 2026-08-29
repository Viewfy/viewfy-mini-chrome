// Shared host-theme tokens. Loaded as a classic content script (before the
// site adapters) and as a <script> in the toolbar popup so both surfaces
// apply the same contract. Assigns onto globalThis.__vfThemeKit.
//
// Adapters call resolve({ scheme, accent, sample, palettes }). field.js and
// popup.js call apply(el, tokens). Viewfy cream is the failure default.

(() => {
  const VIEWFY = {
    scheme: "light",
    bg: "#F8F5F1",
    surface: "#FFFFFF",
    surface2: "#F3F0EB",
    fg: "#171717",
    muted: "#737373",
    muted2: "#A3A3A3",
    border: "#E5E5E5",
    borderSoft: "rgba(0,0,0,.06)",
    accent: "#6EB5FF",
    accent50: "#F3F9FF",
    accent200: "#C5E1FF",
    accent700: "#3D648C",
  };

  const CSS_KEYS = {
    bg: "--bg",
    surface: "--surface",
    surface2: "--surface-2",
    fg: "--fg",
    muted: "--muted",
    muted2: "--muted-2",
    border: "--border",
    borderSoft: "--border-soft",
    accent: "--accent",
    accent50: "--accent-50",
    accent200: "--accent-200",
    accent700: "--accent-700",
  };

  const hex = (n) => n.toString(16).padStart(2, "0");
  const toHex = ({ r, g, b }) => `#${hex(r)}${hex(g)}${hex(b)}`;

  const parseHex = (s) => {
    const m = String(s).trim().match(/^#([\da-f]{3,8})$/i);
    if (!m) return null;
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    const n = parseInt(h.slice(0, 6), 16);
    const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
  };

  const parseRgb = (s) => {
    const m = String(s).trim().match(/^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)(?:\s*[/,]\s*([\d.]+%?))?\s*\)$/i);
    if (!m) return null;
    const a = m[4] == null ? 1 : String(m[4]).endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: +m[1], g: +m[2], b: +m[3], a: Number.isFinite(a) ? a : 1 };
  };

  let paint;
  const parseColor = (s) => {
    if (s == null) return null;
    const t = String(s).trim();
    if (!t || /^(transparent|none|inherit|initial|unset|currentcolor)$/i.test(t)) return null;
    const fast = parseHex(t) || parseRgb(t);
    if (fast) return fast.a < 0.12 ? null : fast;
    try {
      if (!paint) {
        const c = typeof OffscreenCanvas !== "undefined"
          ? new OffscreenCanvas(1, 1)
          : (typeof document !== "undefined" ? document.createElement("canvas") : null);
        paint = c?.getContext?.("2d", { willReadFrequently: true }) || null;
      }
      if (!paint) return null;
      paint.clearRect(0, 0, 1, 1);
      paint.fillStyle = "#000";
      paint.fillStyle = t;
      const a = paint.fillStyle;
      paint.fillStyle = "#fff";
      paint.fillStyle = t;
      const b = paint.fillStyle;
      if (a === "#000000" && b === "#ffffff") return null;
      return parseHex(a) || parseRgb(a);
    } catch {
      return null;
    }
  };

  const lin = (c) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };

  const lum = (c) => {
    const p = typeof c === "string" ? parseColor(c) : c;
    if (!p) return null;
    return 0.2126 * lin(p.r) + 0.7152 * lin(p.g) + 0.0722 * lin(p.b);
  };

  const contrast = (a, b) => {
    const la = lum(a), lb = lum(b);
    if (la == null || lb == null) return 0;
    const hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  };

  const mix = (a, b, t) => {
    const pa = parseColor(a), pb = parseColor(b);
    if (!pa || !pb) return null;
    return toHex({
      r: Math.round(pa.r + (pb.r - pa.r) * t),
      g: Math.round(pa.g + (pb.g - pa.g) * t),
      b: Math.round(pa.b + (pb.b - pa.b) * t),
    });
  };

  const schemeOf = (bg) => {
    const L = lum(bg);
    if (L == null) return "";
    return L < 0.45 ? "dark" : "light";
  };

  const accentTokens = (accent, scheme) => {
    const a = parseColor(accent) ? accent : VIEWFY.accent;
    const wash = scheme === "dark" ? "#000000" : "#FFFFFF";
    const ink = scheme === "dark" ? "#FFFFFF" : "#000000";
    return {
      accent: a,
      accent50: mix(a, wash, scheme === "dark" ? 0.82 : 0.90) || (scheme === "dark" ? "#1A1A1A" : "#F3F9FF"),
      accent200: mix(a, wash, scheme === "dark" ? 0.55 : 0.68) || (scheme === "dark" ? "#2A2A2A" : "#C5E1FF"),
      accent700: mix(a, ink, scheme === "dark" ? 0.28 : 0.38) || (scheme === "dark" ? "#C5E1FF" : "#3D648C"),
    };
  };

  const palette = (scheme, accent) => {
    const sch = scheme === "dark" ? "dark" : "light";
    const acc = accentTokens(accent, sch);
    if (sch === "dark") {
      return {
        scheme: "dark",
        bg: "#111111",
        surface: "#1A1A1A",
        surface2: "#262626",
        fg: "#F5F5F5",
        muted: "#A3A3A3",
        muted2: "#737373",
        border: "#404040",
        borderSoft: "rgba(255,255,255,.08)",
        ...acc,
      };
    }
    return {
      scheme: "light",
      bg: "#F7F7F7",
      surface: "#FFFFFF",
      surface2: "#F0F0F0",
      fg: "#171717",
      muted: "#737373",
      muted2: "#A3A3A3",
      border: "#E5E5E5",
      borderSoft: "rgba(0,0,0,.06)",
      ...acc,
    };
  };

  const cssVar = (el, name) => {
    if (typeof getComputedStyle !== "function" || !el) return "";
    const v = getComputedStyle(el).getPropertyValue(name).trim();
    return v && !/^(initial|inherit|unset|none)$/i.test(v) ? v : "";
  };

  const sampleVars = (map, el) => {
    const root = el || (typeof document !== "undefined" ? document.documentElement : null);
    if (!root || !map) return {};
    const out = {};
    for (const [k, names] of Object.entries(map)) {
      for (const n of (Array.isArray(names) ? names : [names])) {
        const v = cssVar(root, n);
        if (v && parseColor(v)) { out[k] = v; break; }
      }
    }
    return out;
  };

  const sampleComputed = (el) => {
    if (typeof getComputedStyle !== "function") return {};
    const node = el || (typeof document !== "undefined" && (document.documentElement || document.body));
    if (!node) return {};
    const cs = getComputedStyle(node);
    const out = {};
    const bg = parseColor(cs.backgroundColor);
    const fg = parseColor(cs.color);
    if (bg) out.bg = cs.backgroundColor;
    if (fg) out.fg = cs.color;
    return out;
  };

  const htmlScheme = () => {
    if (typeof document === "undefined") return "";
    const html = document.documentElement;
    const body = document.body;
    const bits = [
      html.className,
      html.getAttribute("data-theme"),
      html.getAttribute("data-color-mode"),
      html.getAttribute("data-color-scheme"),
      html.getAttribute("theme"),
      html.getAttribute("color-scheme"),
      html.style?.colorScheme,
      body?.className,
      body?.getAttribute("data-theme"),
    ].filter(Boolean).join(" ");
    if (/__fb-dark-mode|theme-dark|theme--dark|dark-mode|darkmode|lights-?out/i.test(bits)) return "dark";
    if (/__fb-light-mode|theme-light|theme--light|light-mode/i.test(bits)) return "light";
    if (/(^|[\s"'])dark([\s"']|$)/i.test(bits)) return "dark";
    if (/(^|[\s"'])light([\s"']|$)/i.test(bits)) return "light";
    const cs = typeof getComputedStyle === "function" ? getComputedStyle(html).colorScheme : "";
    if (/\bdark\b/.test(cs) && !/\blight\b/.test(cs)) return "dark";
    if (/\blight\b/.test(cs) && !/\bdark\b/.test(cs)) return "light";
    return "";
  };

  const merge = (base, extra) => {
    const out = { ...base };
    if (!extra) return out;
    for (const [k, v] of Object.entries(extra)) {
      if (v == null || v === "") continue;
      out[k] = v;
    }
    return out;
  };

  const clamp = (tokens, fallback) => {
    const bg = parseColor(tokens?.bg);
    const fg = parseColor(tokens?.fg);
    if (bg && fg && contrast(bg, fg) >= 4.5) return tokens;
    return fallback || palette(tokens?.scheme || "light", tokens?.accent);
  };

  const resolve = (spec = {}) => {
    const root = spec.root || (typeof document !== "undefined" ? document.documentElement : null);
    const sampled = spec.sample ? sampleVars(spec.sample, root) : {};
    let computed = {};
    if (spec.computed !== false && root) {
      computed = sampleComputed(root);
      if (!computed.bg && typeof document !== "undefined" && document.body && document.body !== root) {
        computed = { ...sampleComputed(document.body), ...computed };
      }
    }
    const look = spec.scheme || htmlScheme() || schemeOf(sampled.bg || computed.bg) || "light";
    const cssScheme = look === "dim" ? "dark" : (look === "dark" ? "dark" : "light");
    const accent = sampled.accent || spec.accent;
    const base = spec.palettes?.[look] || spec.palettes?.[cssScheme] || palette(cssScheme, accent);
    const filled = merge(accentTokens(base.accent || accent, cssScheme), base);
    const merged = merge(filled, { ...computed, ...sampled, scheme: cssScheme });
    const washFrom = sampled.accent || (!sampled.accent && accent ? accent : "");
    if (washFrom) Object.assign(merged, accentTokens(washFrom, cssScheme), { accent: washFrom });
    return clamp(merged, { ...filled, scheme: cssScheme });
  };

  const generic = () => resolve({ computed: true });

  const apply = (el, tokens) => {
    const t = merge(VIEWFY, tokens || {});
    const scheme = t.scheme === "dark" ? "dark" : "light";
    t.scheme = scheme;
    if (!el?.style?.setProperty) return t;
    for (const [k, css] of Object.entries(CSS_KEYS)) {
      if (t[k]) el.style.setProperty(css, t[k]);
    }
    const onFg = scheme === "dark" ? (t.bg || "#111111") : "#FFFFFF";
    const fgHover = mix(t.fg, scheme === "dark" ? "#000000" : "#FFFFFF", 0.14)
      || (scheme === "dark" ? "#D4D4D4" : "#262626");
    el.style.setProperty("--on-fg", t.onFg || onFg);
    el.style.setProperty("--fg-hover", t.fgHover || fgHover);
    el.style.setProperty("--scheme", scheme);
    el.style.setProperty("--tip-bg", t.surface || t.bg);
    el.style.setProperty("--tip-fg", t.fg);
    el.style.setProperty("--success", t.success || "#10B981");
    el.style.setProperty("--danger", scheme === "dark" ? "#F87171" : "#EF4444");
    el.style.setProperty("--danger-fg", scheme === "dark" ? "#FECACA" : "#DC2626");
    el.style.setProperty("--danger-bg", scheme === "dark" ? "#3F1D1D" : "#FEF2F2");
    el.style.setProperty("--danger-border", scheme === "dark" ? "#7F1D1D" : "#FECACA");
    if (scheme === "dark") {
      el.style.setProperty("--shadow-1", "0 1px 2px rgba(0,0,0,.4)");
      el.style.setProperty("--shadow-2", "0 10px 20px -8px rgba(0,0,0,.45)");
      el.style.setProperty("--shadow-3", "0 30px 50px -20px rgba(0,0,0,.6)");
      el.style.setProperty("--shadow-ring", "0 0 0 1px rgba(255,255,255,.08)");
      el.style.setProperty("--tip-shadow", "0 6px 16px -6px rgba(0,0,0,.6)");
      el.style.setProperty("--btn-shadow", "0 10px 24px -10px rgba(0,0,0,.7)");
    } else {
      el.style.setProperty("--shadow-1", "0 1px 2px rgba(18,16,12,.06)");
      el.style.setProperty("--shadow-2", "0 10px 20px -8px rgba(18,16,12,.10)");
      el.style.setProperty("--shadow-3", "0 30px 50px -20px rgba(18,16,12,.28)");
      el.style.setProperty("--shadow-ring", "0 0 0 1px rgba(0,0,0,.05)");
      el.style.setProperty("--tip-shadow", "0 6px 16px -6px rgba(18,16,12,.5)");
      el.style.setProperty("--btn-shadow", "0 10px 24px -10px rgba(18,16,12,.7)");
    }
    el.style.colorScheme = scheme;
    if (el.dataset) el.dataset.scheme = scheme;
    return t;
  };

  globalThis.__vfThemeKit = {
    VIEWFY,
    parseColor,
    lum,
    contrast,
    mix,
    schemeOf,
    accentTokens,
    palette,
    sampleVars,
    sampleComputed,
    htmlScheme,
    merge,
    clamp,
    resolve,
    generic,
    apply,
  };
  globalThis.__vfThemeDefault = VIEWFY;
  globalThis.__vfThemeApply = apply;
  globalThis.__vfThemeResolve = resolve;
  globalThis.__vfThemeGeneric = generic;
})();
