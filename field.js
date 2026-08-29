(() => {
  // The product: a mascot badge that lives in the reply box. Reads the thread
  // when you focus the box (free, local). Drafts when you click the badge,
  // also free and local: Chrome's built-in model, no account, no server.
  // The draft goes straight into the box; click him again for another
  // version, or type a few words first and he rewrites from them.
  //
  // Same badge, tip, card, and positioning as the full Viewfy extension.
  // What's gone is everything that needs a server: sign-in, product picker,
  // scout drafts (held/prefill), and publish reporting.
  //
  // Closed shadow root: the host site's CSS can't reach in, ours can't leak
  // out. Card/tooltip tokens follow the host site (theme.js); mascot art
  // stays Viewfy.

  const HOST_ID = "viewfy-mini-host";

  // Character art. Listed in web_accessible_resources so the content
  // script may load it.
  const ART = {
    idle: chrome.runtime.getURL("assets/state-idle.png"),
    ready: chrome.runtime.getURL("assets/state-ready.png"),
    error: chrome.runtime.getURL("assets/state-error.png"),
    writing: chrome.runtime.getURL("assets/state-writing.png"), // 8-frame strip, 2048x256
    mark: chrome.runtime.getURL("assets/mark.png"),
  };
  Object.values(ART).forEach((src) => { new Image().src = src; }); // no flash on first swap

  // The mascot as vector (wobbly star from LogoLab + canonical deadpan face):
  // crisp at any DPR, zero image bytes, no web_accessible_resources.
  const MASCOT = `<svg viewBox="-4 -4 108 108" aria-hidden="true">
    <path d="M48.4 3 L62.9 34.7 L93.7 39.1 L67.6 57.1 L75.4 90.7 L48.6 70 L22.9 84.7 L29.7 55.4 L6.8 34.3 L39.1 33.8 Z"
          fill="#6EB5FF" stroke="#6EB5FF" stroke-width="17"
          stroke-linejoin="round" stroke-linecap="round" transform="rotate(-6 50 50)"/>
    <ellipse cx="38" cy="45" rx="5" ry="6" fill="#171717"/>
    <ellipse cx="62" cy="45" rx="5" ry="6" fill="#171717"/>
    <path d="M45 61 h10" stroke="#171717" stroke-width="4.5" stroke-linecap="round"/>
  </svg>`;

  const VARS = `--ease:cubic-bezier(.16,1,.3,1);--font:"Hanken Grotesk","DM Sans",-apple-system,system-ui,sans-serif;`
    + `--bg:#F8F5F1;--surface:#FFFFFF;--surface-2:#F3F0EB;--fg:#171717;--muted:#737373;--muted-2:#A3A3A3;`
    + `--border:#E5E5E5;--border-soft:rgba(0,0,0,.06);--accent:#6EB5FF;--accent-50:#F3F9FF;--accent-200:#C5E1FF;--accent-700:#3D648C;`
    + `--on-fg:#fff;--fg-hover:#262626;--scheme:light;--tip-bg:#FFFFFF;--tip-fg:#171717;`
    + `--danger:#EF4444;--danger-fg:#DC2626;--danger-bg:#FEF2F2;--danger-border:#FECACA;`
    + `--shadow-1:0 1px 2px rgba(18,16,12,.06);--shadow-2:0 10px 20px -8px rgba(18,16,12,.10);`
    + `--shadow-3:0 30px 50px -20px rgba(18,16,12,.28);--shadow-ring:0 0 0 1px rgba(0,0,0,.05);`
    + `--tip-shadow:0 6px 16px -6px rgba(18,16,12,.5);--btn-shadow:0 10px 24px -10px rgba(18,16,12,.7);`;

  const CSS = `
  :host { all: initial; color-scheme: var(--scheme, light); }
  * { box-sizing: border-box; }

  /* No plate, no ring: he stands on the page. The pose is the state. */
  .badge {
    position: absolute; width: 34px; height: 34px;
    display: grid; place-items: center; cursor: pointer;
    pointer-events: auto;
    overflow: hidden;
    filter: drop-shadow(0 1px 2px rgba(0,0,0,.30));
    transition: transform .2s var(--ease), filter .2s var(--ease);
    z-index: 2147483000;
  }
  .badge:hover { transform: scale(1.12); filter: drop-shadow(0 3px 6px rgba(0,0,0,.38)); }
  .badge:active { transform: scale(.97); }
  .badge .face, .badge svg, .badge .writer {
    grid-area: 1 / 1; width: 100%; height: 100%;
  }
  .badge .face, .badge svg { display: block; object-fit: contain; }

  /* Writing: an 8-frame strip stepped across, so he really writes. */
  .badge .writer { display: none; overflow: hidden; position: relative; }
  .badge .writer img {
    position: absolute; left: 0; top: 0; height: 100%; width: 800%;
    max-width: none; display: block;
    animation: write .9s steps(8) infinite;
  }
  .badge[data-state="thinking"] { cursor: default; }
  /* Idle art (big pencil) sits in the same grid cell. Hide every face
     layer, img or the SVG fallback, or it shows through the strip. */
  .badge[data-state="thinking"] .face,
  .badge[data-state="thinking"] > svg { display: none; }
  .badge[data-state="thinking"] .writer { display: block; }
  .badge:not([data-state="thinking"]) .writer { display: none !important; }
  .badge[data-state="ready"] { animation: pop .4s var(--ease); }

  @keyframes write { from { transform: translateX(0); } to { transform: translateX(-100%); } }
  @keyframes bob { 0%,100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-2px) rotate(2deg); } }
  @keyframes pop { 0% { transform: scale(.85); } 60% { transform: scale(1.08); } 100% { transform: scale(1); } }
  @media (prefers-reduced-motion: reduce) {
    .badge svg, .badge { animation: none !important; }
    .badge .writer img { animation-duration: 0s; }
  }


  /* He's talking: cream comic balloon, ink stroke, tail toward his face.
     Stays Viewfy even when the card follows the host. */
  .tip {
    position: fixed; background: #F8F5F1; color: #171717;
    border: 2.5px solid #171717;
    font: 700 12px/1.3 var(--font); letter-spacing: -.02em;
    padding: 8px 13px; border-radius: 22px 18px 20px 16px;
    width: max-content; min-width: 72px; max-width: 200px;
    white-space: nowrap;
    pointer-events: none; opacity: 0; transition: opacity .16s var(--ease);
    z-index: 2147483001;
    transform: rotate(-2deg); transform-origin: right center;
    filter: drop-shadow(2px 3px 0 #171717);
  }
  .tip::after {
    content: ""; position: absolute;
    width: 11px; height: 11px; background: #F8F5F1;
    border-right: 2.5px solid #171717; border-bottom: 2.5px solid #171717;
    right: -6px; top: 52%;
    transform: translateY(-50%) rotate(-40deg);
  }
  .tip[data-show="1"] { opacity: 1; }
  .tip[data-kind="err"] {
    white-space: normal; max-width: 176px; pointer-events: auto; cursor: pointer;
    padding: 9px 14px;
  }

  .card {
    position: absolute; width: 380px; max-width: calc(100vw - 24px);
    pointer-events: auto;
    background: var(--surface); color: var(--fg); border-radius: 16px;
    box-shadow: var(--shadow-1), var(--shadow-2), var(--shadow-3), var(--shadow-ring);
    font: 400 13px/1.55 var(--font); overflow: hidden;
    z-index: 2147483001; animation: pop .35s var(--ease);
  }
  .card header { display: flex; align-items: center; gap: 8px; padding: 11px 14px; border-bottom: 1px solid var(--border-soft); }
  .card header svg, .card header .mk { width: 18px; height: 18px; flex: none; }
  .card header .t { flex: 1; font-weight: 800; font-size: 12.5px; letter-spacing: -.025em; }
  .card header .x {
    cursor: pointer; color: var(--muted-2); font-size: 17px; line-height: 1;
    width: 22px; height: 22px; border-radius: 9999px; display: grid; place-items: center;
    transition: background .2s var(--ease), color .2s var(--ease);
  }
  .card header .x:hover { background: var(--surface-2); color: var(--fg); }
  .card .body { padding: 13px 14px 14px; }
  .card .lead { margin: 0 0 12px; color: var(--muted); font-size: 12.5px; }
  .card .lead b { color: var(--fg); font-weight: 700; }
  .card progress { display: block; width: 100%; margin: 0 0 11px; accent-color: var(--accent); }

  .row { display: flex; gap: 7px; align-items: center; }
  button {
    font: 600 12px/1 var(--font); letter-spacing: -.01em;
    padding: 9px 15px; border-radius: 9999px; cursor: pointer;
    border: 1px solid var(--border); background: var(--surface); color: var(--fg);
    transition: background .2s var(--ease), transform .12s var(--ease);
  }
  button:hover { background: var(--surface-2); }
  button:active { transform: scale(.98); }
  button:disabled { opacity: .55; cursor: default; }
  button.primary { background: var(--fg); border-color: var(--fg); color: var(--on-fg); box-shadow: var(--btn-shadow); }
  button.primary:hover { background: var(--fg-hover); }

  .foot {
    display: flex; align-items: center; gap: 6px; margin-top: 11px;
    font-size: 11px; color: var(--muted-2); letter-spacing: -.005em;
  }
  .foot .grow { flex: 1; }
  `;

  const BOOT = Date.now();
  globalThis.__vfFieldBoot = BOOT;
  const mine = () => globalThis.__vfFieldBoot === BOOT;

  let host, root, badge, tip, card;
  // True while the pointer is on him. place() re-asserts the tip from this,
  // the way it already re-asserts the error tip.
  let hovering = false;
  let field = null, thread = null, threadUrl = "";
  // `payload` is ONLY ever draft text. Errors live in `errorMsg`.
  let state = "idle", payload = "", errorMsg = "";
  // Versions for THIS thread. The next unused one is generated in the
  // background so a mascot click only swaps. No stepper UI.
  let versions = [];
  let versionAt = -1;
  let versionKey = "";
  let lastDirection = "";
  let prefetching = false;
  let writeSeq = 0;
  const VERS_MAX = 8;
  // Bumped on every navigation; async work compares its own copy and bails
  // when stale, so a write started on one thread cannot touch the next one.
  let gen = 0;

  // ---- thread identity ----
  // X status ids, and a path compare for the surfaces that have none (the
  // home composer, the compose sheet). Nothing else lives here.

  const xStatusId = (u) => (String(u || "").match(/\/status\/(\d{5,})/) || [])[1] || "";
  const sameThread = (a, b) => {
    const xa = xStatusId(a), xb = xStatusId(b);
    if (xa || xb) return !!xa && xa === xb;
    const path = (u) => {
      try { return new URL(u, location.origin).pathname.replace(/\/+$/, ""); } catch { return String(u || ""); }
    };
    return !!String(a || "") && path(a) === path(b);
  };
  const threadKey = (t) => t?.permalink || "";

  // ---- shell ----

  // Everything start() registers, so teardown can actually stop this copy.
  const cleanups = [];

  function teardown() {
    host?.remove();
    host = root = badge = tip = card = null;
    field = null;
    while (cleanups.length) {
      try { cleanups.pop()(); } catch {}
    }
  }

  // An orphaned content script (extension updated/reloaded underneath us) has
  // no runtime id. It used to keep running, fighting the reinjected copy over
  // the host node in a mutation loop.
  const orphaned = () => {
    try { return !chrome.runtime?.id; } catch { return true; }
  };

  // Native <dialog> / popover is in the top layer; a body-level badge with
  // any z-index sits behind it. Mount inside the same overlay as the box.
  function layerParent(el) {
    if (!el?.isConnected) return document.body;
    const sel = "dialog, [role='dialog'], [aria-modal='true'], #layers, [popover]";
    if (el.matches?.(sel)) return el;
    const dlg = globalThis.__vfClosest?.(el, sel);
    return dlg || document.body;
  }

  function paintTheme() {
    if (!host) return;
    const t = globalThis.__vfTheme?.() || globalThis.__vfThemeDefault;
    if (t) globalThis.__vfThemeApply?.(host, t);
  }

  function ensureHost() {
    if (!mine()) return;
    const parent = layerParent(field);
    if (host?.isConnected && host.parentNode === parent) return;
    if (!host || !host.isConnected) {
      // Card and hover both died with the old shadow root. A stale `card`
      // here suppresses every tip and eats the next badge click.
      card = null;
      hovering = false;
      document.querySelectorAll(`#${HOST_ID}`).forEach((el) => el.remove());
      host = document.createElement("div");
      host.id = HOST_ID;
      host.style.cssText = "position:absolute;inset:0;width:auto;height:auto;pointer-events:none;z-index:2147483647;overflow:visible;";
      root = host.attachShadow({ mode: "closed" });
      paintTheme();

      const style = document.createElement("style");
      style.textContent = `:host{${VARS}}` + CSS;
      root.appendChild(style);

      badge = document.createElement("div");
      badge.className = "badge";
      badge.dataset.state = "idle";
      badge.innerHTML =
        `<img class="face" src="${ART.idle}" alt="">` +
        `<div class="writer"><img src="${ART.writing}" alt=""></div>`;
      badge.querySelector(".face").addEventListener("error", function () {
        this.outerHTML = MASCOT;
      });
      badge.addEventListener("click", onBadgeClick);
      badge.addEventListener("mouseenter", () => { hovering = true; showTip(tipText()); });
      badge.addEventListener("mouseleave", () => {
        hovering = false;
        if (state !== "error") showTip(null);
      });
      root.appendChild(badge);

      tip = document.createElement("div");
      tip.className = "tip";
      tip.addEventListener("click", (e) => {
        e.stopPropagation();
        if (state === "error") dismissError();
      });
      root.appendChild(tip);
    }
    parent.appendChild(host);
    paintTheme();
  }


  // Some editors draw the composer box on an ancestor of the editable node,
  // which then reports a single-line inner rect. Anchor to the drawn box:
  // walk up for one wide
  // enough to sit the badge on.
  function visualBox() {
    let el = field, best = null;
    for (let i = 0; i < 6 && el; i++) {
      const cs = getComputedStyle(el);
      const radius = parseFloat(cs.borderRadius) || 0;
      if (radius > 4) { best = { el, radius }; break; }
      el = el.parentElement || el.getRootNode()?.host;
    }
    let target = best?.el || field;
    let rect = target.getBoundingClientRect();
    if (rect.width < 100) {
      let n = field;
      for (let i = 0; i < 8 && n; i++) {
        const r = n.getBoundingClientRect();
        if (r.width >= 100 && r.height >= 12 && r.bottom > 0 && r.top < innerHeight) {
          target = n;
          rect = r;
          break;
        }
        n = n.parentElement || n.getRootNode()?.host;
      }
    }
    return { rect, radius: best?.radius ?? 12 };
  }


  // The tooltip is one line; keep the first sentence.
  const shortErr = (m) => {
    const first = String(m).split(/(?<=\.)\s/)[0].trim();
    return first.length > 76 ? first.slice(0, 73).trimEnd() + "…" : first;
  };

  const clipDbg = (s, n = 160) => {
    const t = String(s || "").replace(/\s+/g, " ").trim();
    return t.length > n ? `${t.slice(0, n)}…` : t;
  };

  const extVer = () => {
    try { return chrome.runtime.getManifest().version; } catch { return "?"; }
  };
  const skipOnce = new Set();
  const vfLog = (step, extra = {}) => {
    const once = extra.once;
    const payload = { ...extra };
    delete payload.once;
    if (once) {
      const k = `${step}:${once}`;
      if (skipOnce.has(k)) return;
      skipOnce.add(k);
    }
    console.info("[viewfy-mini]", {
      v: extVer(),
      step,
      href: location.href,
      state,
      ...payload,
    });
  };

  const boxDirection = () => {
    const now = boxText().trim();
    if (!now) return "";
    // Spacing out of the comparison, same as alreadyInBox: X reads a
    // multi-paragraph draft back without its blank line, so his own draft
    // looked like founder input. Every regenerate then dropped the versions
    // and asked for a rewrite instead of another take.
    if (payload && sameText(now, payload)) return "";
    if (versions.some((v) => sameText(v.draft, now))) return "";
    return now;
  };

  function draftTip(t) {
    if (t.kind === "post" || t.surface === "compose") return "Draft a post";
    if (t.kind === "message" || t.surface === "dm") return "Draft a message";
    return "Draft a reply";
  }

  function tipText() {
    if (state === "thinking") return "Writing…";
    if (state === "ready") return "";
    if (state === "error") return errorMsg ? shortErr(errorMsg) : "He hit a snag";
    if (boxDirection()) return "Rewrite from this";
    // A cached version that never landed is not "another": the first paste
    // into an empty X/Lexical box often claims success and leaves this tip
    // over a still-empty composer.
    if (versions.length && payload && !alreadyInBox(payload)) return "Click to paste";
    if (versions.length) return "Another version";
    return thread ? draftTip(thread) : "Reading…";
  }

  function showTip(text) {
    if (!tip) return;
    if (state === "error" && !text) text = tipText();
    if (!text || card) return void (tip.dataset.show = "0");
    tip.textContent = text;
    tip.dataset.show = "1";
    tip.dataset.kind = state === "error" ? "err" : "";
    const b = badge.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = `${Math.max(8, b.left - w - 14)}px`;
    tip.style.top = `${Math.max(8, b.top + (b.height - h) / 2)}px`;
  }

  let thinkAt = 0;
  const setState = (s) => {
    state = s;
    if (s === "thinking") thinkAt = Date.now();
    if (!badge) return;
    badge.dataset.state = s;
    const face = badge.querySelector(".face");
    const writer = badge.querySelector(".writer");
    if (writer) writer.style.display = s === "thinking" ? "block" : "none";
    if (face) {
      face.style.display = s === "thinking" ? "none" : "block";
      if (s !== "thinking") face.src = ART[s] || ART.idle;
    }
  };

  // ---- composer tracking ----

  // Shadow-piercing: a host site can bury its composer in a shadow root.
  const findComposer = () => globalThis.__vfComposer?.() || null;

  const boxText = () => {
    if (!field) return "";
    const owned = globalThis.__vfBoxText?.(field);
    if (owned != null) return owned;
    return (field.tagName === "TEXTAREA" ? field.value : field.innerText) || "";
  };

  const normText = (s) => String(s || "").replace(/\s+/g, " ").trim();

  // X reads a multi-paragraph draft back without its blank line, so the
  // spacing has to be out of the comparison. See same() in site-x.js.
  const sameText = (a, b) => a.replace(/\s/g, "") === b.replace(/\s/g, "");

  const alreadyInBox = (text) => {
    const now = normText(boxText());
    const want = normText(text);
    if (!want || !now) return false;
    // Substring used to count: a stacked box that merely contained the
    // latest draft looked "done", so the next click never replaced it.
    return sameText(now, want) || sameText(now, want + want);
  };

  const SIZE = 34, GAP = 5;

  function badgeLayout() {
    const spec = globalThis.__vfBadge?.(field) || {};
    return {
      size: spec.size || SIZE,
      gap: spec.gap || GAP,
      corner: spec.corner || "bottom-right",
      // Adapter owns placement but the row is not measured yet: stay hidden
      // instead of flashing the default corner.
      hold: !!spec.hold,
      // Viewport x the badge's right edge must stay left of (native tools).
      end: spec.end || 0,
      // Viewport x of the badge's left edge (sit after a native tool).
      start: spec.start || 0,
      insetRight: spec.insetRight || 0,
      mid: spec.mid || 0,
      flat: !!spec.flat,
    };
  }

  function place() {
    if (!badge || !field?.isConnected || !host) return hide();
    const { size, gap, corner, end, start, insetRight, mid, hold, flat } = badgeLayout();
    const r = visualBox().rect;
    const parent = host.parentElement;
    const layered = parent && parent !== document.body;
    if (hold) return hide();
    const anchored = !!(start || mid);
    if (anchored) {
      if (mid && (mid + size < 0 || mid - size > innerHeight)) return hide();
    } else {
      if (r.bottom < 0 || r.top > innerHeight) return hide();
      if (r.width < 100 && !(layered && r.width >= 40)) return hide();
    }
    badge.style.display = "grid";
    badge.style.width = `${size}px`;
    badge.style.height = `${size}px`;
    badge.style.filter = flat ? "none" : "";
    // Host origin in viewport, not the dialog's rect. A static dialog is not
    // the containing block, so dialog-relative coords land off-screen.
    const origin = host.getBoundingClientRect();
    if (start) {
      // Cap against the native send control, not the composer box: a rounded
      // inner rect grows with the text and used to drag the badge with it.
      const x = end ? Math.min(start, end - size - gap) : start;
      badge.style.left = `${x - origin.left}px`;
    } else {
      const right = Math.min(r.right - insetRight, end || r.right);
      badge.style.left = `${right - origin.left - size - gap}px`;
    }
    if (mid) {
      badge.style.top = `${mid - origin.top - size / 2}px`;
    } else if (corner === "top-right") {
      badge.style.top = `${r.top - origin.top + gap}px`;
    } else {
      // A box that starts one line tall and grows: center on short fields so
      // the badge never overflows the box it belongs to.
      badge.style.top = `${r.height < size + gap * 2
        ? r.top - origin.top + (r.height - size) / 2
        : r.bottom - origin.top - size - gap}px`;
    }
    if (card) placeCard();
    // Shown once from mouseenter, the tip died on the next hide(): the
    // composer node is swapped often enough here that it never survived to
    // paint. Only the error tip came back, because this line put it back.
    if (state === "error" || hovering) showTip(tipText());
  }

  function hide() {
    if (badge) badge.style.display = "none";
    if (tip) tip.dataset.show = "0";
  }

  function scan() {
    if (!mine()) return teardown();
    const next = findComposer();
    if (next !== field) {
      hide();
      field = next || null;
      // Some sites rebuild the editor while he writes. Follow the new node;
      // do not drop thinking or the draft looks frozen after a second.
      if (field && (state === "ready" || state === "error")) setState("idle");
    }
    if (!field) return hide();
    ensureHost();
    place();
  }

  // ---- reading (free, local, on focus) ----

  async function readThread() {
    const url = location.pathname;
    // Always re-read: X swaps the thread under a persistent composer, so a
    // cached read goes stale without the path ever changing.
    try {
      const got = await globalThis.__vfExtract?.();
      const ok = !!got;
      if (ok) { thread = got; threadUrl = url; }
      else { thread = null; threadUrl = ""; }
    } catch {
      thread = null;
      threadUrl = "";
    }
    return thread;
  }

  // ---- card views ----

  function placeCard() {
    const b = badge.getBoundingClientRect(), h = host.getBoundingClientRect();
    const above = b.top - card.offsetHeight - 12 > 8;
    card.style.left = `${Math.max(8 - h.left, b.right - h.left - card.offsetWidth)}px`;
    card.style.top = above ? `${b.top - h.top - card.offsetHeight - 12}px` : `${b.bottom - h.top + 12}px`;
  }

  function closeCard() { card?.remove(); card = null; }

  const node = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  // `body` is either a DOM node or a STATIC template string. Nothing from the
  // page or an error message may be interpolated into a template; it goes in
  // through textContent, or this becomes an injection point into our own
  // isolated world (where scripts can reach chrome.runtime).
  function openCard(title, body, wire) {
    closeCard();
    showTip(null);
    card = node("div", "card");

    const head = node("header");
    const mk = node("img", "mk");
    mk.src = ART.mark;
    mk.alt = "";
    const close = node("span", "x", "×");
    close.title = "Close";
    close.addEventListener("click", closeCard);
    head.append(mk, node("span", "t", title), close);

    const bodyEl = node("div", "body");
    if (typeof body === "string") bodyEl.innerHTML = body;
    else bodyEl.append(body);

    card.append(head, bodyEl);
    wire?.(card);
    root.appendChild(card);
    placeCard();
    return card;
  }

  // The mini's one gate, where the shipped extension gates on sign-in: the
  // on-device model is a one-time, browser-wide download.
  function downloadView() {
    openCard("Get him set up", `
      <p class="lead">He writes with <b>Gemini Nano</b>, a real LLM built into Chrome. 2 minutes to install, about 4GBs, once for the whole browser. After that he drafts on this device with no account and no server.</p>
      <progress max="1" value="0" hidden></progress>
      <div class="row"><button class="primary" data-act="dl">Install Gemini Nano</button></div>
      <div class="foot"><span>Also available from his toolbar icon.</span></div>`,
      (c) => {
        const bar = c.querySelector("progress");
        c.querySelector('[data-act="dl"]').addEventListener("click", async (e) => {
          e.target.disabled = true;
          e.target.textContent = "Downloading…";
          bar.hidden = false;
          try {
            const v = await globalThis.__vfNano.download((n) => { bar.value = n; });
            if (v === "ok") { closeCard(); onBadgeClick(); return; }
            errorView(v === "stub"
              ? "This browser ships a fake on-device model. Use Google Chrome."
              : "The model did not come down. Open the Viewfy Mini popup from his toolbar icon and download it there.");
          } catch {
            errorView("Chrome would not start the download here. Open the Viewfy Mini popup from his toolbar icon and download it there.");
          }
        });
      });
  }

  // No review step: the draft goes straight into the box the founder is
  // already typing in. It is editable there, and nothing posts until they
  // hit Reply themselves.
  function markPasted(text) {
    payload = text;
    setState("ready");
    showTip(null);
    setTimeout(() => { if (state === "ready") setState("idle"); }, 1600);
    rememberVersion(text);
  }

  let putting = false;
  let putAt = 0;
  function liveBox() {
    const next = findComposer();
    if (next?.isConnected) field = next;
    return field?.isConnected ? field : null;
  }

  function deliver(text) {
    if (!mine()) return;
    const box = liveBox();
    if (!box) {
      errorView("He wrote it, but this box did not take the text. Click him again.");
      return;
    }
    // A put whose frame never came back used to wedge this flag, and then
    // every later click died right here with no draft and no tip.
    if (putting && Date.now() - putAt < 8000) return false;
    if (alreadyInBox(text)) {
      // Ghost-doubled: insert again only to strip, never to append.
      globalThis.__vfInsert?.(text, box);
      return markPasted(text);
    }
    putting = true;
    putAt = Date.now();
    // Always replace. Appending the new version to the last one is what
    // stacked X replies after a few clicks.
    const out = text;
    const landed = () => alreadyInBox(out) || alreadyInBox(text);
    const tryPut = async (target) => {
      const res = globalThis.__vfInsert?.(out, target);
      // `inserted:true` means the editor heard the event, not that the
      // box holds the text. Lexical preventDefault's paste on X and
      // swallows the first write into an empty placeholder.
      if (res && typeof res.then === "function") await res;
      return landed();
    };
    const finish = (ok) => {
      putting = false;
      vfLog("deliver", { ok, draft: clipDbg(text, 80), box: clipDbg(boxText(), 80) });
      if (ok) {
        liveBox();
        markPasted(text);
      } else errorView("He wrote it, but this box did not take the text. Click him again.");
    };
    const go = async () => {
      if (await tryPut(box)) return finish(true);
      const again = liveBox();
      if (again && again !== box && await tryPut(again)) return finish(true);
      // Lexical / Draft.js often apply the write on the next frame. A sync
      // empty read used to either false-error or, worse, claim success.
      await new Promise((r) => requestAnimationFrame(r));
      if (landed()) return finish(true);
      const late = liveBox();
      if (late && await tryPut(late)) return finish(true);
      await new Promise((r) => requestAnimationFrame(r));
      if (landed()) return finish(true);
      finish(!!(liveBox() && await tryPut(liveBox())));
    };
    go().catch(() => finish(false));
  }

  function dropVersions() {
    versions = [];
    versionAt = -1;
    versionKey = "";
    lastDirection = "";
    writeSeq += 1;
  }

  function unusedAhead() {
    return Math.max(0, versions.length - versionAt - 1);
  }

  function rememberVersion(draft, { select = true } = {}) {
    const text = (draft || "").trim();
    if (!text) return;
    const key = threadKey(thread) || location.href;
    const topic = `${key}|${(thread?.author || "").toLowerCase()}|${String(thread?.title || "").slice(0, 80)}`;
    if (versionKey !== topic) {
      versions = [];
      versionAt = -1;
      versionKey = topic;
    }
    const i = versions.findIndex((v) => normText(v.draft) === normText(text));
    if (i >= 0) {
      if (select) versionAt = i;
      return;
    }
    versions.push({ draft: text });
    if (versions.length > VERS_MAX) {
      versions.shift();
      if (versionAt > 0) versionAt -= 1;
    }
    if (select) versionAt = versions.length - 1;
  }

  function showVersion(i) {
    if (i < 0 || i >= versions.length) return false;
    versionAt = i;
    const v = versions[i];
    payload = v.draft;
    // A put already in flight refuses this one. Say so, instead of returning
    // true and letting the click end in silence.
    if (deliver(v.draft) === false) return false;
    ensurePrefetch();
    return true;
  }

  function ensurePrefetch() {
    if (prefetching || unusedAhead() >= 1) return;
    if (state === "error") return;
    vfLog("prefetch", { silent: true, unused: unusedAhead() });
    prefetching = true;
    writeVersion({ silent: true })
      .catch((e) => {
        if (String(e?.message) !== "stale") console.debug("[viewfy-mini] prefetch", e);
      })
      .finally(() => { prefetching = false; });
  }

  // ---- writing (free, local, on click) ----

  let paintQ = "";
  let paintRaf = 0;

  function paintLive(text) {
    paintQ = text;
    if (paintRaf) return;
    paintRaf = requestAnimationFrame(() => {
      paintRaf = 0;
      const box = liveBox();
      if (!box) return;
      // Draft.js / Lexical (X) treat mid-stream insertText as "type at the
      // caret": first letter drops, then deliver() pastes a second copy.
      // Stream only into native fields; rich boxes get one insert when the
      // draft is finished.
      if (box.tagName !== "TEXTAREA" && box.tagName !== "INPUT") return;
      globalThis.__vfInsert?.(paintQ, box);
    });
  }

  // Returns { draft }. `myGen` lets the write die quietly when the founder
  // navigates away mid-write.
  function liveDraft(thread, myGen, { silent = false } = {}) {
    if (!silent) {
      paintQ = "";
      if (paintRaf) { cancelAnimationFrame(paintRaf); paintRaf = 0; }
    }
    return (globalThis.__vfVoiceGet?.() || Promise.resolve(null))
      .then((voice) => globalThis.__vfNano.draftReply(thread, voice, {
        onDelta: (acc) => {
          if (silent || myGen !== gen || !mine()) return;
          paintLive(acc);
        },
      }))
      .then((draft) => {
        if (!String(draft || "").trim()) throw new Error("He came back empty. Try again.");
        return { draft };
      });
  }

  async function writeVersion({ silent = false } = {}) {
    const myGen = gen;
    const seq = writeSeq;
    const direction = silent ? lastDirection : boxDirection();
    if (!silent) lastDirection = direction;
    const base = await readThread();
    if (!base) throw new Error("Couldn't read this thread.");
    const used = versions.map((v) => v.draft).filter(Boolean);
    let t = direction ? { ...base, direction } : base;
    if (used.length) t = { ...t, used };
    vfLog("write", {
      href: location.href,
      permalink: t.permalink,
      silent,
      direction: clipDbg(direction) || null,
      box: clipDbg(boxText()),
      payload: clipDbg(payload) || null,
    });
    const out = await liveDraft(t, myGen, { silent });
    if (!mine() || myGen !== gen || seq !== writeSeq) throw new Error("stale");
    rememberVersion(out.draft, { select: !silent });
    return { ...out, thread: t };
  }

  function friendlyErr(e) {
    const s = String(e?.message || e);
    if (!s.trim()) return "He hit a snag. Try again.";
    if (/empty completion/i.test(s)) return "He came back empty. Try again.";
    return s;
  }

  function dismissError() {
    errorMsg = "";
    closeCard();
    setState("idle");
    showTip(null);
  }

  function errorView(msg) {
    setState("error");
    errorMsg = msg;
    closeCard();
    showTip(tipText());
  }

  // ---- the one click ----

  async function onBadgeClick() {
    if (!mine()) return;
    if (orphaned()) return teardown();
    // A write that died between the pose and its result used to swallow every
    // later click here, silently. Nano's slowest cold draft is well under this.
    if (state === "thinking" && Date.now() - thinkAt < 90000) return;
    if (state === "error") return dismissError();
    // Only a card still in the shadow root blocks him.
    if (!card?.isConnected) card = null;
    if (card) return closeCard();

    // Cheap availability check, no canary: the full verdict resolves inside
    // the first write, while the writing animation is already up.
    const nano = await (globalThis.__vfNano?.quick?.() ?? Promise.resolve("unavailable"));
    if (nano === "downloading") {
      return errorView("Gemini Nano is installing. He is ready the moment it lands.");
    }
    if (nano === "needs-download") return downloadView();
    if (nano === "stub") {
      return errorView("This browser ships a fake on-device model. Use Google Chrome.");
    }
    if (nano === "unavailable") {
      return errorView("On-device AI is not available in this browser. He needs Google Chrome 138 or newer.");
    }

    const direction = boxDirection();
    if (direction && direction !== lastDirection) {
      dropVersions();
      lastDirection = direction;
    }

    // Next version only when the current one is already in the box. Otherwise
    // a prefetch sitting in `versions` would overwrite a draft that never
    // landed, or skip pasting it.
    if (unusedAhead() >= 1 && payload && alreadyInBox(payload)) {
      vfLog("click", { path: "next-version", at: versionAt, n: versions.length });
      if (showVersion(versionAt + 1)) return;
      // The cached one would not go in. Write a new one rather than eat the
      // click.
    }

    // First X paste often swallows into the empty placeholder, then
    // rememberVersion still ran. Retry that draft before burning a new write.
    if (payload && !alreadyInBox(payload) && !boxText().trim()) {
      vfLog("click", { path: "retry", draft: clipDbg(payload, 80) });
      deliver(payload);
      return;
    }

    vfLog("click", { path: "live", direction: clipDbg(direction, 80), box: clipDbg(boxText(), 80) });

    setState("thinking");
    showTip(null);
    const myGen = gen;
    try {
      if (prefetching) {
        while (prefetching && unusedAhead() < 1) {
          if (myGen !== gen) throw new Error("stale");
          await new Promise((r) => setTimeout(r, 120));
        }
        if (unusedAhead() >= 1 && showVersion(versionAt + 1)) {
          // deliver() finishes on its own frames and lands on "ready". Drop
          // the writing pose now so a failed paste cannot leave it up.
          setState("idle");
          return;
        }
      }
      const out = await writeVersion({ silent: false });
      const t = out.thread;
      const hereStatus = xStatusId(location.href);
      const draftStatus = xStatusId(t.permalink);
      const sameX = hereStatus && draftStatus && hereStatus === draftStatus;
      const composeReply = /\/compose\//.test(location.pathname) && !!liveBox();
      if (!sameThread(t.permalink, location.href) && !sameX && !composeReply) {
        setState("idle");
        return;
      }
      payload = out.draft;
      if (alreadyInBox(out.draft) || state === "ready") markPasted(out.draft);
      else deliver(out.draft);
      ensurePrefetch();
    } catch (e) {
      // Stale means the founder moved on, not that he failed. Still drop the
      // writing pose: a stuck "thinking" swallows every later click.
      if (String(e?.message) === "stale") {
        if (state === "thinking") setState("idle");
        return;
      }
      errorView(friendlyErr(e));
    }
  }

  // ---- boot ----
  // Classic content script (MV3 content_scripts can't be ES modules); shares
  // the isolated world with content.js and self-boots.

  (function start() {
    // content.js runs first and hands over the site API. If it ever fails to
    // parse, say so loudly instead of showing no badge for no visible reason.
    if (!globalThis.__vfComposer) {
      console.error("[viewfy-mini] content.js did not load, badge disabled");
      return;
    }
    console.info("[viewfy-mini] ready", { v: extVer(), href: location.href });
    const bootWrite = globalThis.__vfClosestWrite?.(
      globalThis.__vfDeepActive?.() || document.activeElement,
    );
    if (bootWrite) globalThis.__vfRememberWrite?.(bootWrite);

    let last = 0, lastPath = "", trail = 0;
    cleanups.push(() => clearTimeout(trail));
    const rescan = () => {
      if (!mine() || orphaned()) return teardown();
      const now = Date.now();
      if (now - last < 250) {
        if (!trail) {
          trail = setTimeout(() => { trail = 0; last = 0; rescan(); }, 260 - (now - last));
        }
        return;
      }
      last = now;
      const path = location.pathname;
      if (path !== lastPath) {
        const prev = lastPath;
        lastPath = path;
        const box = field ? boxText().trim() : "";
        const same = !!(prev && field && payload && box === String(payload).trim());
        skipOnce.clear();
        console.info("[viewfy-mini] nav", {
          v: extVer(),
          from: prev,
          to: path,
          cleared: same,
          box: clipDbg(box),
          payload: clipDbg(payload) || null,
        });
        if (same) globalThis.__vfInsert?.("", field);
        gen += 1; // any in-flight write for the old thread is now stale
        thread = null;
        threadUrl = "";
        payload = "";
        errorMsg = "";
        dropVersions();
        setState("idle");
      }
      if (globalThis.__vfOnThread?.()) scan();
      else hide();
    };

    // Reading is free and local, so do it the moment the reply box is focused.
    document.addEventListener("focusin", (e) => {
      const el = globalThis.__vfClosestWrite?.(e.composedPath?.()[0] || e.target);
      if (!el) return;
      globalThis.__vfRememberWrite?.(el);
      scan();
      readThread().then(() => {
        if (tip?.dataset.show === "1") showTip(tipText());
      });
    }, true);

    rescan();
    if (document.body) {
      const mo = new MutationObserver(rescan);
      mo.observe(document.body, { childList: true, subtree: true });
      cleanups.push(() => { mo.disconnect(); clearTimeout(trail); });
    }
    const themeMo = new MutationObserver(paintTheme);
    themeMo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme", "data-color-mode", "data-color-scheme", "theme", "color-scheme"],
    });
    if (document.body) {
      themeMo.observe(document.body, {
        attributes: true,
        attributeFilter: ["class", "style", "data-theme"],
      });
    }
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener?.("change", paintTheme);
    cleanups.push(() => {
      themeMo.disconnect();
      mq.removeEventListener?.("change", paintTheme);
    });
    // The composer grows a line at a time as you type, a layout change no
    // childList observer ever sees. Watch the box itself.
    const ro = new ResizeObserver(() => place());
    let watched = null;
    const watchId = setInterval(() => {
      if (field && field !== watched) { ro.disconnect(); ro.observe(field); watched = field; }
    }, 1000);
    cleanups.push(() => { clearInterval(watchId); ro.disconnect(); });
    addEventListener("scroll", place, { passive: true, capture: true });
    addEventListener("resize", place, { passive: true });
    cleanups.push(() => {
      removeEventListener("scroll", place, { capture: true });
      removeEventListener("resize", place);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && card) closeCard();
    }, true);
  })();

})();
