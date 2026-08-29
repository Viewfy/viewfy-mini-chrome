// X (twitter.com / x.com) adapter. Badge geometry is the tool-row slot, one
// pitch after the last glyph, capped by Send; insert goes through Lexical.
// Status pages and the reply modal only; no DMs, no home compose.
// profileOf/ownPosts feed voice learning.
//
// Read is DOM + Open Graph / JSON-LD only: X has no published same-origin
// thread API for extensions. Nothing submits.

// How much of `have` is leftover in front of `want`. Regenerating used to
// paste at the caret, so versions glued together.
globalThis.__vfXPrefixLen = (have, want) => {
  const h = String(have || "");
  const w = String(want || "");
  if (!w || !h || h === w) return 0;
  const at = h.lastIndexOf(w);
  if (at > 0 && at + w.length === h.length) return at;
  const hC = h.replace(/\s/g, "");
  const wC = w.replace(/\s/g, "");
  if (!wC || !hC.endsWith(wC) || hC.length <= wC.length) return 0;
  const startC = hC.length - wC.length;
  let c = 0, i = 0;
  while (i < h.length && c < startC) {
    if (!/\s/.test(h[i])) c++;
    i++;
  }
  return i > 0 && i < h.length ? i : 0;
};

(() => {
  const HOST_RE = /(^|\.)(x|twitter)\.com$/i;
  const STATUS_RE = /\/status\//;
  // Badge attaches to this node. Insert never writes here if it wraps a
  // Lexical/Draft tree: select-all on the host drops a ghost text node.
  const ROOT = '[data-testid="tweetTextarea_0"]';
  const LEAF = '[data-text="true"], [data-lexical-text="true"]';
  const CE = '[contenteditable="true"], [contenteditable="plaintext-only"]';
  const SKIP_HANDLE = /^(i|home|explore|search|messages|notifications|compose|settings|intent|hashtag|login|signup|tos|privacy)$/i;
  const TWEET_HINT = /post your reply|tweet text|what.?s happening|post text|add another post/i;

  const meta = (prop) =>
    document.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`)?.content?.trim() || "";

  const statusId = () => (location.pathname.match(/\/status\/(\d+)/) || [])[1] || "";

  const permalink = () => `https://x.com${location.pathname}`;

  const handleFromPath = () => {
    const m = location.pathname.match(/^\/([^/]+)\/status\//);
    return m && m[1] !== "i" ? m[1] : "";
  };

  const handleFromUrl = (url) => {
    try {
      const m = new URL(url, location.origin).pathname.match(/^\/([^/]+)\/status\//);
      return m && m[1] !== "i" ? m[1] : "";
    } catch {
      return "";
    }
  };

  const unix = (iso) => {
    const ms = Date.parse(iso || "");
    return Number.isFinite(ms) ? ms / 1000 : null;
  };

  const countFromLabel = (el) => {
    const label = el?.getAttribute("aria-label") || "";
    const m = label.match(/([\d,.]+)/);
    if (!m) return null;
    const n = Number(m[1].replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  const tweetFromOgTitle = (t) => {
    const q = t.match(/:\s*[“"]([\s\S]+)[”"]\s*$/);
    if (q) return q[1].trim();
    const after = t.split(/\son X:\s*/i)[1];
    return (after || t).replace(/^[“"]|[”"]$/g, "").trim();
  };

  const authorOf = (art) => {
    const block = art.querySelector('[data-testid="User-Name"]');
    if (block) {
      const at = (block.innerText || "").match(/@(\w+)/);
      if (at) return at[1];
      const href = block.querySelector('a[href^="/"]')?.getAttribute("href") || "";
      const m = href.match(/^\/([^/?#]+)/);
      if (m && !/^(i|home|explore|search)$/.test(m[1])) return m[1];
    }
    return "";
  };

  const textOf = (art) =>
    (art.querySelector('[data-testid="tweetText"]')?.innerText || "").trim();

  const pickMain = (arts) => {
    const id = statusId();
    if (id) {
      const hit = arts.find((a) => {
        const href = a.querySelector("time[datetime]")?.closest("a")?.getAttribute("href") || "";
        return href.includes(`/status/${id}`);
      });
      if (hit) return hit;
    }
    return arts[0] || null;
  };

  function viaOg() {
    const title = meta("og:title") || document.title || "";
    const desc = meta("og:description");
    const url = meta("og:url");
    const id = statusId();
    // SPA nav often leaves stale OG tags from the previous page.
    if (id && url && !url.includes(`/status/${id}`)) return null;
    const text = (desc || tweetFromOgTitle(title)).trim();
    if (!text || /^(X|Twitter)\b/i.test(text)) return null;
    const at = title.match(/@(\w+)/);
    return {
      selftext: text,
      author: at?.[1] || handleFromUrl(url) || handleFromPath(),
      permalink: url && url.includes("/status/") ? url.replace("https://twitter.com", "https://x.com") : "",
    };
  }

  function viaLd() {
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      let d;
      try { d = JSON.parse(s.textContent || "{}"); } catch { continue; }
      const items = Array.isArray(d) ? d : d["@graph"] || [d];
      for (const x of items) {
        const t = x?.["@type"];
        if (t !== "SocialMediaPosting" && t !== "DiscussionForumPosting") continue;
        const text = (x.articleBody || x.text || x.headline || "").trim();
        if (!text) continue;
        const author = x.author?.identifier || x.author?.name || x.author?.alternateName || "";
        const handle = String(author).replace(/^@/, "").split(/\s/)[0];
        return { selftext: text, author: handle, created_utc: unix(x.datePublished) };
      }
    }
    return null;
  }

  function viaDom() {
    const arts = [...document.querySelectorAll('article[data-testid="tweet"]')];
    const main = pickMain(arts);
    if (!main) return null;
    const text = textOf(main);
    const iso = main.querySelector("time[datetime]")?.getAttribute("datetime") || "";
    const created = unix(iso);
    const like = main.querySelector('[data-testid="like"], [data-testid="unlike"]');
    const reply = main.querySelector('[data-testid="reply"]');
    const comments = arts
      .filter((a) => a !== main)
      .slice(0, 8)
      .map((a) => ({
        author: authorOf(a),
        body: textOf(a).slice(0, 800),
        score: countFromLabel(a.querySelector('[data-testid="like"], [data-testid="unlike"]')),
      }))
      .filter((c) => c.body);
    return {
      selftext: text,
      author: authorOf(main) || handleFromPath(),
      created_utc: created,
      num_comments: countFromLabel(reply),
      score: countFromLabel(like),
      comments,
    };
  }

  function read() {
    const og = viaOg();
    const ld = viaLd();
    const dom = viaDom();
    // On a status page the DOM is the only source guaranteed to describe THIS
    // tweet: pickMain matches the article to /status/<id>, while SPA nav leaves
    // og: and JSON-LD tags from the previously visited tweet.
    const onStatus = !!statusId();
    const text = ((onStatus
      ? dom?.selftext || og?.selftext || ld?.selftext
      : og?.selftext || ld?.selftext || dom?.selftext) || "").trim();
    if (!text) return null;
    const author = ((onStatus
      ? dom?.author || og?.author || ld?.author
      : og?.author || dom?.author || ld?.author) || handleFromPath() || ""
    ).replace(/^@/, "");
    const created = dom?.created_utc || ld?.created_utc || null;
    const source = text === dom?.selftext?.trim() ? "dom" : og?.selftext ? "og" : "ld";
    return {
      source,
      channel: "x",
      venue: author ? `@${author}` : "",
      title: text.slice(0, 120),
      selftext: text.slice(0, 4000),
      author,
      created_utc: created,
      age_hours: globalThis.__vfHours(created),
      num_comments: dom?.num_comments ?? null,
      score: dom?.score ?? null,
      permalink: permalink(),
      comments: dom?.comments || [],
    };
  }

  const FLOAT = '[role="dialog"], [aria-modal="true"]';

  const onScreen = (el) => {
    const r = el?.getBoundingClientRect?.();
    return !!(r && r.width > 60 && r.height > 8 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth);
  };

  const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();

  // Lexical gives each paragraph its own leaf and ownedText joins leaves
  // with nothing, so a two-paragraph draft reads back without the blank
  // line it was written with. Spacing-exact equality never matched, the
  // caller read that as "the box refused it", and every retry pasted
  // another copy. Compare on the characters instead.
  const same = (a, b) => !!a && a.replace(/\s/g, "") === b.replace(/\s/g, "");

  // Visible sheet in #layers wins. A leftover off-screen textarea in #layers
  // must not hide the page box.
  const composerRoot = () => {
    const all = globalThis.__vfDeepQuery(ROOT, null).filter(onScreen);
    return all.find((el) => el.closest?.("#layers") || el.closest?.(FLOAT))
      || all.find((el) => !el.closest?.("#layers"))
      || all[0]
      || null;
  };

  const composer = () => composerRoot();

  const TOOLBAR = '[data-testid="toolBar"]';
  const SEND_BTN = '[data-testid="tweetButton"], [data-testid="tweetButtonInline"]';
  const SEND_LABEL = /^(post|reply|tweet)$/i;
  // toolBar is not always present; match the icons themselves too.
  const TOOL_ANCHOR = [
    '[data-testid="scheduleOption"]',
    '[data-testid="gifSearchButton"]',
    '[data-testid="fileInput"]',
    '[data-testid="createPollButton"]',
    '[data-testid="geoButton"]',
    '[data-testid="emojiButton"]',
    '[aria-label="Add a GIF"]',
    '[aria-label="Add poll"]',
    '[aria-label="Add emoji"]',
    '[aria-label*="Schedule" i]',
    '[aria-label*="location" i]',
    '[aria-label*="flag" i]',
  ].join(", ");
  const isOurs = (el) => !!el.closest?.("#viewfy-mini-host");
  let heldTool = null;
  let heldFor = null;

  const visible = (el) => {
    const r = el?.getBoundingClientRect?.();
    return !!(r && r.width >= 8 && r.height >= 8);
  };

  const isAnchor = (el) =>
    !!(el?.matches?.(TOOL_ANCHOR) || el?.closest?.(TOOL_ANCHOR) || el?.querySelector?.(TOOL_ANCHOR));

  const glyphOf = (el) => {
    const svg = el?.querySelector?.("svg");
    return (svg && visible(svg) ? svg : el).getBoundingClientRect();
  };

  const ceilingOf = (box) =>
    box.closest?.("#layers") || box.closest?.(FLOAT) || document.body;

  // Walk up from the parent, never the editor. Searching the textarea picks
  // inner nodes that appear/disappear as it grows, so the badge jumps.
  // 28 levels: the /compose/post modal keeps its toolBar 22 above the box.
  const barOf = (box) => {
    const ceiling = ceilingOf(box);
    let n = box.parentElement;
    for (let i = 0; i < 28 && n; i++) {
      const hit = n.matches?.(TOOLBAR) ? n : n.querySelector?.(TOOLBAR);
      if (hit && visible(hit)) return hit;
      if (n === ceiling) break;
      n = n.parentElement;
    }
    return null;
  };

  const collectTools = (root, sendLeft) => {
    const hits = [];
    const add = (el) => {
      if (!el || isOurs(el) || hits.some((h) => h.el === el)) return;
      if (el.closest?.(SEND_BTN)) return;
      const t = `${el.getAttribute("aria-label") || ""} ${el.textContent || ""}`.replace(/\s+/g, " ").trim();
      if (SEND_LABEL.test(t)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 14 || r.height < 14 || r.width > 72 || r.height > 72) return;
      if (Number.isFinite(sendLeft) && r.left >= sendLeft - 8) return;
      hits.push({ el, r, anchor: isAnchor(el) });
    };
    for (const el of root.querySelectorAll(TOOL_ANCHOR)) {
      add(el.closest("button, [role='button'], [role='tab'], label") || el);
    }
    for (const el of root.querySelectorAll("button, [role='button'], [role='tab']")) add(el);
    return hits;
  };

  // Media / GIF / poll / schedule / flag sit on one row. "Everyone can reply"
  // and the character count appear as the box grows; ignore those rows.
  const packAnchors = (hits, sendR, { allowPlain = false } = {}) => {
    if (!hits.length) return null;
    const sendLeft = sendR && sendR.width >= 8 ? sendR.left : Infinity;
    const rows = [];
    const sorted = [...hits].sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left);
    for (const h of sorted) {
      const row = rows.find((row) => Math.abs(row[0].r.top - h.r.top) < 16);
      if (row) row.push(h);
      else rows.push([h]);
    }
    let best = null;
    let bestScore = -1;
    for (const row of rows) {
      const icons = row.filter((h) => h.r.left < sendLeft - 8);
      const anchors = icons.filter((h) => h.anchor);
      if (!anchors.length && !(allowPlain && icons.length >= 2)) continue;
      const score = anchors.length * 10 + icons.length;
      if (score > bestScore) {
        bestScore = score;
        best = { icons, anchors };
      }
    }
    if (!best) return null;
    best.icons.sort((a, b) => a.r.left - b.r.left);
    // Median pitch, not mean: the carousel arrows share the row and pollute
    // the mean, which walks the badge onto the next native tool.
    const steps = [];
    for (let i = 1; i < best.icons.length; i++) {
      steps.push(best.icons[i].r.left - best.icons[i - 1].r.left);
    }
    const paced = steps.filter((s) => s >= 8).sort((a, b) => a - b);
    const step = paced.length ? Math.round(paced[Math.floor(paced.length / 2)]) : 0;
    // Park after the last tool ON the cadence. The off-cadence jump past the
    // row is the floating scroll-right arrow; never park after that.
    let last = best.icons[0];
    for (let i = 1; i < best.icons.length; i++) {
      if (step && best.icons[i].r.left - last.r.left > step * 1.6) break;
      last = best.icons[i];
    }
    const glyph = glyphOf(last.el);
    const mid = best.icons.reduce((s, h) => s + h.r.top + h.r.height / 2, 0) / best.icons.length;
    return {
      r: glyph,
      step: step || glyph.width + 8,
      send: sendR && sendR.width >= 8 ? sendR : null,
      mid,
    };
  };

  const sendOf = (root) => {
    const el = root?.querySelector?.(SEND_BTN);
    const r = el?.getBoundingClientRect();
    return r && r.width >= 8 ? r : null;
  };

  // Post is not the only thing parked to his right. The home composer grows
  // an "add another post" circle the moment you type, and he was landing on
  // top of it. Cap on the nearest control after the last tool, on his row.
  const capLeft = (root, afterX, mid, sendR) => {
    let cap = sendR && sendR.width >= 8 ? sendR.left : Infinity;
    const els = root?.querySelectorAll?.('button, [role="button"], a[role="link"], input[type="file"]') || [];
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      if (mid != null && Math.abs(r.top + r.height / 2 - mid) > 16) continue;
      if (r.left <= afterX + 2) continue;
      if (r.left < cap) cap = r.left;
    }
    return Number.isFinite(cap) ? cap : 0;
  };

  const lastTool = (box) => {
    if (!box) return null;
    const bar = barOf(box);
    if (bar) {
      const send = sendOf(bar);
      const packed = packAnchors(
        collectTools(bar, send?.left ?? Infinity),
        send,
        { allowPlain: true },
      );
      if (packed) {
        packed.cap = capLeft(bar, packed.r.right, packed.mid, packed.send);
        return packed;
      }
    }
    const ceiling = ceilingOf(box);
    let n = box.parentElement;
    for (let i = 0; i < 12 && n; i++) {
      const send = sendOf(n);
      const packed = packAnchors(collectTools(n, send?.left ?? Infinity), send);
      if (packed) {
        packed.cap = capLeft(n, packed.r.right, packed.mid, packed.send);
        return packed;
      }
      if (n === ceiling) break;
      n = n.parentElement;
    }
    return null;
  };

  // Reply modal on /compose/post quotes the tweet inside the dialog. A bare
  // compose (no quoted tweet) is a new post, which composeMode() picks up.
  const quotedTweet = () =>
    document.querySelector('[role="dialog"] article[data-testid="tweet"]');

  const replyModal = () => /\/compose\//.test(location.pathname) && !!quotedTweet();

  // The standalone composer: the home timeline box, and /compose/post when
  // it carries no quoted post. There is no thread to answer here, so the
  // draft is a post and it comes from the founder, not from the page.
  // A dialog holding a tweet means they are replying, whatever the URL
  // says: the reply box opened from the timeline does not always move
  // off /home. Compose is the case where nothing is quoted.
  const composeMode = () =>
    !quotedTweet()
    && /^\/(home)?$|\/compose\//.test(location.pathname)
    && !!composerRoot();

  // Innermost contenteditable. tweetTextarea_0 is often also contenteditable
  // and wraps Lexical/Draft blocks; that outer node is only for the badge.
  const editorOf = (el) => {
    const host = el?.closest?.(ROOT) || el;
    if (!host) return null;
    if (host.tagName === "TEXTAREA" || host.tagName === "INPUT") return host;
    const nested = [...host.querySelectorAll(CE)];
    let best = host.matches?.(CE) ? host : nested[0] || host;
    for (const n of nested) if (best.contains(n)) best = n;
    return best;
  };

  // Text the editor owns. Leaves first: a stale [data-contents] wrapper can
  // stay empty after Lexical writes the span, which makes the "already
  // applied" check miss and execCommand append a second copy.
  const ownedText = (el) => {
    const box = editorOf(el);
    if (!box) return "";
    const leaves = [...box.querySelectorAll(LEAF)];
    if (leaves.length) {
      return leaves.map((n) => n.textContent || "").join("").replace(/\u200B/g, "");
    }
    const tree = box.querySelector("[data-contents='true']") || box;
    return (tree.innerText || "").replace(/\u200B/g, "");
  };

  const rawOf = (n) => (n?.nodeValue || n?.textContent || "").replace(/\u200B/g, "");

  const textNodes = (box) => {
    const root = box?.querySelector?.("[data-contents='true']") || box;
    if (!root) return [];
    const out = [];
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walk.nextNode())) {
      if (rawOf(n).trim()) out.push(n);
    }
    return out;
  };

  const stripGhost = (el) => {
    const host = el?.closest?.(ROOT) || el;
    if (!host) return;
    for (const n of [...host.childNodes]) {
      if (n.nodeType === Node.TEXT_NODE && (n.nodeValue || "").trim()) n.remove();
    }
    // execCommand insertText leaves a raw text node next to Draft.js's
    // <span data-text="true">. The editor paints both, so the reply reads
    // twice. Only strip when the leaf already holds the copy.
    for (const leaf of host.querySelectorAll(LEAF)) {
      const p = leaf.parentNode;
      if (!p) continue;
      if (!rawOf(leaf).trim()) continue;
      for (const n of [...p.childNodes]) {
        if (n !== leaf && n.nodeType === Node.TEXT_NODE && (n.nodeValue || "").trim()) {
          n.remove();
        }
      }
    }
  };

  // execCommand("selectAll") and a hand-built Range both move the DOM
  // selection, but the browser fires selectionchange in a LATER task, so
  // Lexical still holds the caret it had when a paste or a delete dispatched
  // in this same task arrives. That is how a regenerate landed after the old
  // draft instead of over it. Run Lexical's document listener by hand first.
  const syncSel = () => {
    try { document.dispatchEvent(new Event("selectionchange")); } catch {}
  };

  const selectAll = () => {
    try { document.execCommand("selectAll", false, null); } catch {}
    syncSel();
  };

  const tick = () => new Promise((r) => setTimeout(r, 0));

  const dropRange = (startNode, startOff, endNode, endOff) => {
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.setStart(startNode, startOff);
      range.setEnd(endNode, endOff);
      sel.removeAllRanges();
      sel.addRange(range);
      syncSel();
      return document.execCommand("delete", false, null);
    } catch {
      return false;
    }
  };

  // Same sentence painted twice with no space. Draft.js filled the leaf and
  // execCommand left a sibling. Cut the second copy.
  const clipDouble = (box, text) => {
    stripGhost(box);
    const want = String(text || "");
    if (!want || !box) return;
    const nodes = textNodes(box);
    if (nodes.length >= 2 && norm(rawOf(nodes[0])) === norm(want) && norm(rawOf(nodes[1])) === norm(want)) {
      const last = nodes[nodes.length - 1];
      if (!dropRange(nodes[1], 0, last, last.nodeValue.length)) {
        for (const extra of nodes.slice(1)) extra.remove();
      }
    } else if (nodes.length === 1 && doubled(norm(rawOf(nodes[0])), norm(want))) {
      const node = nodes[0];
      let off = node.nodeValue.indexOf(want, Math.min(want.length, node.nodeValue.length));
      if (off < 1) off = Math.floor(node.nodeValue.length / 2);
      if (!dropRange(node, off, node, node.nodeValue.length)) node.nodeValue = want;
    }
    const leaves = [...(box.querySelectorAll?.(LEAF) || [])].filter((l) => rawOf(l).trim());
    if (leaves.length >= 2 && norm(rawOf(leaves[0])) === norm(want) && norm(rawOf(leaves[1])) === norm(want)) {
      (leaves[1].closest("[data-block='true']") || leaves[1]).remove();
    }
    stripGhost(box);
  };

  const prefixLen = globalThis.__vfXPrefixLen;

  // New version appended onto the last one. Cut the leftover prefix so the
  // box holds only `text`; clipDouble only knows about an exact double.
  const clipAppended = (box, text) => {
    clipDouble(box, text);
    if (landed(box, text)) return;
    const want = String(text || "");
    const nodes = textNodes(box);
    if (!want || !nodes.length) return;
    const joined = nodes.map((n) => n.nodeValue || "").join("");
    const off = prefixLen(joined, want);
    // Never cut the whole run.
    if (off < 1 || off >= joined.length) return;
    const last = nodes[nodes.length - 1];
    if (nodes.length > 1 && norm(rawOf(last)) === norm(want)) {
      if (!dropRange(nodes[0], 0, last, 0)) {
        for (const extra of nodes.slice(0, -1)) {
          (extra.parentElement?.closest?.("[data-block='true']") || extra).remove();
        }
      }
      stripGhost(box);
      return;
    }
    let seen = 0;
    let endNode = nodes[0];
    let endOff = 0;
    for (const n of nodes) {
      const len = (n.nodeValue || "").length;
      if (seen + len >= off) {
        endNode = n;
        endOff = off - seen;
        break;
      }
      seen += len;
    }
    if (!dropRange(nodes[0], 0, endNode, endOff) && nodes.length === 1) {
      nodes[0].nodeValue = want;
    }
    stripGhost(box);
  };

  const lock = () => (globalThis.__vfXLock ||= { text: "", at: 0 });

  const doubled = (have, want) => !!(want && same(have, want + want));

  const selectOwned = (box) => {
    if (!box?.isConnected) return;
    // selectAll updates Lexical's own selection. A synthetic Range on the
    // leaves often does not, so paste then typed at the caret and appended.
    selectAll();
    // Whole tree, not the first leaf: a multi-block reply leaves leftover
    // paragraphs when only the first span is replaced.
    const root = box.querySelector("[data-contents='true']") || box;
    if (!root?.isConnected) return;
    const texts = [];
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walk.nextNode())) texts.push(n);
    const live = texts.filter((t) => t.isConnected && t.parentNode);
    const sel = window.getSelection();
    const range = document.createRange();
    try {
      if (live.length) {
        range.setStart(live[0], 0);
        range.setEnd(live[live.length - 1], live[live.length - 1].nodeValue.length);
      } else {
        range.selectNodeContents(root);
      }
      sel.removeAllRanges();
      sel.addRange(range);
      syncSel();
    } catch {
      // Lexical swapped the leaf between the walk and addRange.
    }
  };

  const wipeOwned = (box) => {
    selectOwned(box);
    try {
      const ev = new InputEvent("beforeinput", {
        inputType: "deleteContentBackward",
        bubbles: true,
        composed: true,
        cancelable: true,
      });
      box.dispatchEvent(ev);
      if (!ev.defaultPrevented) document.execCommand("delete", false, null);
    } catch {
      document.execCommand("delete", false, null);
    }
  };

  const landed = (box, text) => {
    const have = norm(ownedText(box));
    const want = norm(text);
    return !!(want && same(have, want));
  };

  // Lexical (X's composer) treats paste as one React-state update and
  // preventDefault()s. insertText / beforeinput+execCommand both apply, the
  // native command AND the editor's handler, so the reply reads twice.
  // Paste instead of insertText.
  const pasteIn = (box, text) => {
    try {
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      const ev = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        composed: true,
        clipboardData: dt,
      });
      if (!ev.clipboardData?.getData?.("text/plain")) {
        Object.defineProperty(ev, "clipboardData", { value: dt });
      }
      const bubbled = box.dispatchEvent(ev);
      return ev.defaultPrevented || !bubbled;
    } catch {
      return false;
    }
  };

  const settle = (box, text, retry = true) => {
    clipAppended(box, text);
    if (landed(box, text) || !retry) return;
    const have = ownedText(box);
    if (norm(have) === norm(text)) return;
    // Wipe-then-paste leaves the box empty: Lexical honors delete, then the
    // placeholder swallows the paste. Put the new text back. Do not wipe.
    box.focus();
    selectAll();
    if (!norm(have) || prefixLen(have, text) > 0) {
      if (pasteIn(box, text)) {
        requestAnimationFrame(() => settle(box, text, false));
        return;
      }
      document.execCommand("insertText", false, text);
      stripGhost(box);
      clipAppended(box, text);
    }
  };

  const frames = (n = 1) => new Promise((resolve) => {
    const step = () => { if (--n <= 0) resolve(); else requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });

  const putOnce = async (box, text) => {
    box.click?.();
    box.focus();
    if (!text) {
      wipeOwned(box);
      return true;
    }
    // selectAll only: a synthetic Range on the leaves makes Lexical revert
    // to the caret, so paste appends. Do not wipe first: an empty
    // placeholder will not take the next paste.
    // Replacing is not filling. execCommand("selectAll") does select the whole
    // draft (verified: window.getSelection() spans it), but Lexical pastes at
    // ITS caret and ignores the DOM selection, so a replace stacked. Delete
    // through beforeinput, which Lexical does honor, and then paste into an
    // empty box, which is the path the first draft already proves works.
    // Replacing cannot go through paste. Lexical ignores the DOM selection on
    // a synthetic paste, so it appends, and wiping first leaves a box that
    // swallows the next paste entirely. insertText is the one write that does
    // consume the selection. Its known failure is double-applying, native plus
    // Lexical's own handler, which is exactly what doubled() and clipAppended
    // below were written to clean up.
    if (norm(ownedText(box))) {
      selectAll();
      document.execCommand("insertText", false, text);
      stripGhost(box);
      clipAppended(box, text);
      await frames(2);
      if (!box.isConnected) return false;
      return landed(box, text) || doubled(norm(ownedText(box)), norm(text));
    }
    try { document.execCommand("selectAll", false, null); } catch {}
    if (pasteIn(box, text)) {
      requestAnimationFrame(() => settle(box, text));
      // Lexical heard the paste. That is not the same as the box holding
      // the text; an empty "Post your reply" placeholder often swallows
      // this first write. The caller must wait a frame and read the box.
      return "pending";
    }
    // No Lexical paste handler (plain CE). insertText is safe here.
    document.execCommand("insertText", false, text);
    stripGhost(box);
    clipAppended(box, text);
    return landed(box, text) || doubled(norm(ownedText(box)), norm(text));
  };

  globalThis.__vfRegister({
    id: "x",
    channel: "x",
    active: () => HOST_RE.test(location.hostname),
    // /handle/status/123 and /i/web/status/123, plus the reply modal that
    // often sits on /compose/post with the quoted tweet in the dialog.
    onThread: () =>
      STATUS_RE.test(location.pathname)
      || (replyModal() && !!composerRoot())
      || composeMode(),
    extract: async () => {
      try {
        // Nothing to read. surface:"compose" is what flips the badge tip to
        // "Draft a post" and picks the post prompt in nano.js.
        if (composeMode()) {
          return {
            source: "dom",
            channel: "x",
            surface: "compose",
            venue: "X",
            title: "",
            selftext: "",
            permalink: `https://x.com${location.pathname}`,
            comments: [],
          };
        }
        if (replyModal()) {
          const quoted = quotedTweet();
          const text = textOf(quoted);
          const author = authorOf(quoted);
          const href = quoted.querySelector("time[datetime]")?.closest("a")?.getAttribute("href") || "";
          const link = href ? `https://x.com${href.split("?")[0]}` : location.href.split("?")[0];
          return {
            source: "dom",
            channel: "x",
            venue: author ? `@${author}` : "",
            title: (text || "X post").slice(0, 120),
            selftext: (text || "").slice(0, 4000),
            author,
            created_utc: null,
            age_hours: null,
            num_comments: null,
            score: null,
            permalink: link,
            comments: [],
          };
        }
        return read();
      } catch {
        return null;
      }
    },
    composer,
    // Replies sit in the tool row: one pitch after the last glyph, capped by
    // the Send button, flat and row-sized.
    badge: (el) => {
      const box = el?.isConnected ? el : composer();
      if (box !== heldFor) {
        heldTool = null;
        heldFor = box;
      }
      const hit = lastTool(box);
      if (hit?.r) {
        const { r, step, send, mid, cap } = hit;
        const size = Math.max(20, Math.min(24, Math.round(Math.min(r.width, r.height) || 20)));
        heldTool = {
          size,
          gap: 0,
          // One pitch after the last glyph keeps the row's rhythm; the floor
          // guards a squeezed row from putting him flush against it.
          start: Math.max(r.left + (step || r.width + 8), r.right + 8),
          mid: mid || r.top + r.height / 2,
          end: cap || (send ? send.left : 0),
          flat: true,
        };
        return heldTool;
      }
      return heldTool || { hold: true };
    },
    boxText: (el) => {
      const box = editorOf(el || composer());
      if (box?.tagName === "TEXTAREA" || box?.tagName === "INPUT") return box.value || "";
      const raw = ownedText(el || box);
      const wrap = box?.closest?.(ROOT);
      const ph = (
        box?.getAttribute?.("aria-placeholder")
        || box?.getAttribute?.("placeholder")
        || wrap?.getAttribute?.("aria-placeholder")
        || ""
      ).trim();
      if (ph && norm(raw) === norm(ph)) return "";
      if (TWEET_HINT.test(raw) && raw.length < 40) return "";
      return raw;
    },
    insert: async (text, el) => {
      const host = (el?.closest?.(ROOT) || el || composer());
      const box = editorOf(host);
      if (!box) return { inserted: false };
      if (box.tagName === "TEXTAREA" || box.tagName === "INPUT") {
        return globalThis.__vfSetText(box, text);
      }
      stripGhost(host || box);
      const have = norm(ownedText(box));
      const want = norm(text);
      const held = lock();
      if (want && have === want) {
        stripGhost(host || box);
        return { inserted: true, where: "x" };
      }
      // The lock exists to stop a rapid double-insert while Lexical is still
      // applying the first write. It must not claim success when the box
      // verifiably does NOT hold the text.
      if (want && held.text === want && Date.now() - held.at < 8000 && have === want) {
        return { inserted: true, where: "x" };
      }
      if (!text) {
        box.focus();
        wipeOwned(box);
        held.text = "";
        held.at = 0;
        return { inserted: true, where: "x" };
      }
      // Whatever the replace does, it must not end with an empty box: a
      // wiped draft the paste never replaced is the one failure the founder
      // cannot undo.
      const before = ownedText(box);
      const ok = await putOnce(box, text);
      const done = () => landed(box, text) || doubled(norm(ownedText(box)), norm(text));
      if (ok === true && done()) {
        held.text = want;
        held.at = Date.now();
        return { inserted: true, where: "x" };
      }
      // Empty placeholder: Lexical preventDefault's, then keeps "Post your
      // reply". Wait for settle(), then one more write on the now-focused box.
      await frames(2);
      if (done()) {
        held.text = want;
        held.at = Date.now();
        return { inserted: true, where: "x" };
      }
      await putOnce(box, text);
      await frames(2);
      let inserted = done();
      if (!inserted && norm(before) && !norm(ownedText(box))) {
        // Put his draft back and report failure, so the badge says so.
        // insertText, not paste: an emptied box swallows a paste.
        box.click?.();
        box.focus();
        try { document.execCommand("insertText", false, before); } catch {}
        stripGhost(box);
        await frames(2);
        inserted = false;
      }
      if (inserted) {
        held.text = want;
        held.at = Date.now();
      }
      return { inserted, where: "x" };
    },
    // Voice learning (mini only): the founder's own profile page.
    profileOf: () => {
      const m = location.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
      return m && !SKIP_HANDLE.test(m[1]) ? m[1] : null;
    },
    ownPosts: () =>
      [...document.querySelectorAll('article[data-testid="tweet"] [data-testid="tweetText"]')]
        .map((el) => el.innerText.trim()).filter(Boolean).slice(0, 12),
    theme: () => {
      const kit = globalThis.__vfThemeKit;
      const bg = kit?.sampleComputed?.(document.body)?.bg
        || kit?.sampleComputed?.(document.documentElement)?.bg;
      const L = kit?.lum?.(bg);
      const look = L == null ? "" : L < 0.005 ? "dark" : L < 0.35 ? "dim" : "light";
      return globalThis.__vfThemeResolve({
        scheme: look,
        accent: "#1D9BF0",
        sample: {
          bg: ["--color-background", "--background-color"],
          fg: ["--color-text", "--primary-text-color"],
        },
        palettes: {
          light: {
            scheme: "light", bg: "#FFFFFF", surface: "#FFFFFF", surface2: "#F7F9F9",
            fg: "#0F1419", muted: "#536471", muted2: "#8B98A5",
            border: "#EFF3F4", borderSoft: "rgba(0,0,0,.08)", accent: "#1D9BF0",
          },
          dim: {
            scheme: "dark", bg: "#15202B", surface: "#1E2732", surface2: "#273340",
            fg: "#F7F9F9", muted: "#8B98A5", muted2: "#6E767D",
            border: "#38444D", borderSoft: "rgba(255,255,255,.08)", accent: "#1D9BF0",
          },
          dark: {
            scheme: "dark", bg: "#000000", surface: "#16181C", surface2: "#202327",
            fg: "#E7E9EA", muted: "#71767B", muted2: "#565A5F",
            border: "#2F3336", borderSoft: "rgba(255,255,255,.08)", accent: "#1D9BF0",
          },
        },
      });
    },
  });
})();
