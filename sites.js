// Site-adapter registry + the DOM work every adapter needs. Adapters and
// field.js talk only through the globalThis.__vf* contract below, so a new
// surface never touches either.
//
// Load order matters: this file, then theme.js, then each site-*.js, then
// content.js. All content scripts of one extension share ONE global lexical
// scope, so every file here is IIFE-wrapped and they talk only through
// globalThis.__vf*.
//
// An adapter is:
//   { id, channel, active(), onThread(), extract(), composer(), insert(text, el),
//     boxText?(el), badge?(el), theme?(), profileOf?(), ownPosts?() }
// profileOf/ownPosts are mini-only: voice learning reads the founder's own
// profile page, with the popup button as the consent.

(() => {
  const sites = (globalThis.__vfSites = globalThis.__vfSites || []);

  globalThis.__vfRegister = (adapter) => {
    const i = sites.findIndex((s) => s.id === adapter.id);
    if (i >= 0) sites[i] = adapter;
    else sites.push(adapter);
    return adapter;
  };

  // Open or closed shadow roots.
  globalThis.__vfShadow = (el) => {
    if (!el) return null;
    try {
      if (el.shadowRoot) return el.shadowRoot;
      const opened = globalThis.chrome?.dom?.openOrClosedShadowRoot?.(el);
      if (opened) return opened;
      return el.openOrClosedShadowRoot || null;
    } catch {
      return null;
    }
  };

  // Bounded shadow-piercing query. A host site can hide its composer inside
  // <faceplate-textarea-input>'s shadow root, so a plain querySelectorAll finds
  // nothing; walking every shadow root on a large page is too slow, so each
  // adapter names the hosts worth descending into.
  globalThis.__vfDeepQuery = (selector, hostTags, root = document, depth = 0, acc = []) => {
    if (depth > 4) return acc;
    acc.push(...root.querySelectorAll(selector));
    if (hostTags) {
      for (const h of root.querySelectorAll(hostTags)) {
        const sh = globalThis.__vfShadow(h);
        if (sh) globalThis.__vfDeepQuery(selector, hostTags, sh, depth + 1, acc);
      }
    }
    return acc;
  };

  // Element.closest stops at a shadow root; keep climbing through hosts.
  globalThis.__vfClosest = (el, selector) => {
    let n = el;
    for (let i = 0; i < 24 && n && n !== document && n !== document.documentElement; i++) {
      if (n.nodeType === 1 && n.matches?.(selector)) return n;
      if (n.parentElement) {
        n = n.parentElement;
        continue;
      }
      const root = n.getRootNode?.();
      n = root instanceof ShadowRoot ? root.host : null;
    }
    return null;
  };

  // document.activeElement retargets to the shadow host. Follow the chain,
  // including closed roots (chrome.dom). focusin's composedPath can see into
  // a closed shadow even when chrome.dom is missing; remember that node.
  let lastWrite = null;
  globalThis.__vfRememberWrite = (el) => {
    if (el?.isConnected) lastWrite = el;
  };
  globalThis.__vfLastWrite = () => (lastWrite?.isConnected ? lastWrite : null);

  globalThis.__vfDeepActive = () => {
    let el = document.activeElement;
    for (let i = 0; i < 8 && el; i++) {
      const sh = globalThis.__vfShadow(el);
      if (!sh?.activeElement || sh.activeElement === el) break;
      el = sh.activeElement;
    }
    const remembered = lastWrite?.isConnected ? lastWrite : null;
    if (remembered && el && el !== remembered) {
      const root = remembered.getRootNode?.();
      if (root instanceof ShadowRoot && root.host === el) return remembered;
    }
    return el;
  };

  // Innermost click target, then up to the textarea / contenteditable it
  // lives in. plaintext-only is a real editor; [contenteditable=true] does
  // not match it.
  globalThis.__vfClosestWrite = (el) => {
    if (el && el.nodeType !== 1) el = el.parentElement;
    while (el && el !== document.documentElement) {
      if (el.tagName === "TEXTAREA") return el;
      const ce = el.getAttribute?.("contenteditable");
      if (ce === "true" || ce === "plaintext-only") return el;
      if (el.parentElement) {
        el = el.parentElement;
        continue;
      }
      const root = el.getRootNode?.();
      el = root instanceof ShadowRoot ? root.host : null;
    }
    return null;
  };

  // Big enough to type in, on screen, and never our own UI.
  globalThis.__vfUsable = (el) => {
    if (!el || el.closest?.("#viewfy-mini-host")) return false;
    const r = el.getBoundingClientRect();
    // Horizontal bounds too: the standard anti-spam honeypot is a full-size
    // textarea parked at left:-9999px, which passes a vertical-only test.
    return (
      r.width > 120 && r.height > 12
      && r.bottom > 0 && r.top < innerHeight
      && r.right > 0 && r.left < innerWidth
    );
  };

  // Setting .value directly leaves React/Lit state stale, so go through the
  // native setter and fire the events the framework is actually listening for.
  globalThis.__vfSetText = (el, text) => {
    if (!el?.isConnected) return { inserted: false };
    el.focus();
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement : HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(proto.prototype, "value")?.set;
      setter ? setter.call(el, text) : (el.value = text);
      el.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      el.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      return { inserted: true, where: el.tagName.toLowerCase() };
    }
    const read = () => ((el.innerText || el.textContent || "").replace(/\s+/g, " ").trim());
    const want = String(text || "").replace(/\s+/g, " ").trim();
    const landed = () => !want || read() === want || read().includes(want);
    const sel = window.getSelection();
    const range = document.createRange();
    try {
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {
      // The editor swapped the leaf between select and addRange.
    }
    if (!text) {
      document.execCommand("delete", false, null);
      return { inserted: true, where: "contenteditable" };
    }
    // Chain a fallback ONLY when execCommand refused (returned false). Some
    // editors accept the command but apply it in a later update, so the DOM
    // still reads empty here; retrying on !landed() inserts the text twice
    // when both writes flush.
    let ok = document.execCommand("insertText", false, text);
    if (!ok) {
      // Keep paragraph breaks: raw \n inside insertHTML collapses to nothing.
      const html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");
      ok = document.execCommand("insertHTML", false, html);
    }
    if (!ok && !landed()) {
      try {
        el.dispatchEvent(new InputEvent("beforeinput", {
          inputType: "insertText",
          data: text,
          bubbles: true,
          composed: true,
          cancelable: true,
        }));
      } catch {}
    }
    // No textContent last resort: assigning it desyncs React/Lexical state so
    // the site posts something other than what the box shows. Report failure
    // and let field.js show its "box did not take the text" tip instead.
    return { inserted: ok || landed(), where: "contenteditable" };
  };

  globalThis.__vfHours = (unixSeconds) =>
    unixSeconds ? Math.round((Date.now() / 1000 - unixSeconds) / 360) / 10 : null;
})();
