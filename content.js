// Resolves which registered site adapter owns this page and exposes the small
// API field.js and the popup use, plus the popup messages: status, learn
// voice, forget voice. Adding a surface means adding one site-*.js file and
// two manifest entries; nothing here changes.
//
// Wrapped: content scripts of one extension share a global scope, so
// top-level declarations here would collide with the other files.

(() => {
  const active = () => (globalThis.__vfSites || []).find((s) => s.active());

  // The adapter itself, for surfaces that need site-specific extras
  // (voice learning reads profileOf/ownPosts).
  globalThis.__vfAdapter = active;

  globalThis.__vfSite = () => {
    const s = active();
    return s ? { id: s.id, channel: s.channel, onThread: !!s.onThread() } : null;
  };

  globalThis.__vfBadge = (el) => {
    const spec = active()?.badge;
    try {
      return typeof spec === "function" ? spec(el) : spec || null;
    } catch {
      return null;
    }
  };

  globalThis.__vfOnThread = () => !!active()?.onThread();

  globalThis.__vfExtract = async () => {
    const s = active();
    if (!s || !s.onThread()) return null;
    try {
      return (await s.extract()) || null;
    } catch {
      return null;
    }
  };

  globalThis.__vfComposer = () => {
    const s = active();
    return s && s.onThread() ? s.composer() : null;
  };

  globalThis.__vfInsert = (text, el) => {
    const s = active();
    return s ? s.insert(text, el || s.composer()) : { inserted: false };
  };

  globalThis.__vfBoxText = (el) => {
    const s = active();
    if (s?.boxText) return s.boxText(el || s.composer());
    return null;
  };

  globalThis.__vfTheme = () => {
    const s = active();
    try {
      if (s?.theme) {
        const t = s.theme();
        if (t) return t;
      }
    } catch {}
    return globalThis.__vfThemeGeneric?.() || globalThis.__vfThemeDefault;
  };

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    // Popup asks the active tab. Only the top frame answers; iframes (ads,
    // widgets) would otherwise win the first sendResponse with a blank theme.
    let top = false;
    try { top = window.top === window; } catch { top = false; }
    if (!top) return false;

    if (msg?.type === "THEME") {
      try {
        sendResponse({ ok: true, theme: globalThis.__vfTheme() });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
      return false;
    }
    if (msg?.type === "MINI_STATUS") {
      (async () => {
        const site = active();
        sendResponse({
          ok: true,
          nano: await globalThis.__vfNano.status(),
          site: site?.id || null,
          onProfile: site?.profileOf?.() || null,
          onThread: !!site?.onThread?.(),
          voice: await globalThis.__vfVoiceGet(),
        });
      })();
      return true;
    }
    if (msg?.type === "MINI_LEARN") {
      (async () => {
        try {
          sendResponse({ ok: true, voice: await globalThis.__vfLearnHere() });
        } catch (e) {
          sendResponse({ ok: false, error: String(e?.message || e) });
        }
      })();
      return true;
    }
    if (msg?.type === "MINI_CLEAR_VOICE") {
      globalThis.__vfVoiceClear().then(() => sendResponse({ ok: true }));
      return true;
    }
    return false;
  });
})();
