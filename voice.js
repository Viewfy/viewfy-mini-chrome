// Voice learning: explicit, on the user's own profile page only. Nothing is
// observed passively; the popup button is the consent.

(() => {
  const KEY = "vf_voice";

  globalThis.__vfVoiceGet = () =>
    new Promise((res) => chrome.storage.local.get(KEY, (o) => res(o[KEY] || null)));

  globalThis.__vfVoiceSet = (v) =>
    new Promise((res) => chrome.storage.local.set({ [KEY]: v }, res));

  globalThis.__vfVoiceClear = () =>
    new Promise((res) => chrome.storage.local.remove(KEY, res));

  // Called from the popup via message; runs here on the profile page.
  globalThis.__vfLearnHere = async () => {
    const site = globalThis.__vfAdapter?.();
    const handle = site?.profileOf?.();
    if (!handle) throw new Error("Open your own X profile page first, the one with your posts on it.");
    const posts = site.ownPosts();
    if (posts.length < 3) throw new Error(`Only ${posts.length} posts visible. Scroll the profile a bit and retry.`);
    const profile = await globalThis.__vfNano.learnVoice(posts);
    profile.handle = handle;
    profile.site = site.id;
    profile.learned_at = Date.now();
    profile.n_posts = posts.length;
    await globalThis.__vfVoiceSet(profile);
    return profile;
  };
})();
