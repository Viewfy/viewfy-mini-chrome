// Model status + gesture-owned download, voice profile view/learn/forget.
// The popup is an extension page, so LanguageModel here is the stable
// extension surface, and the model component it downloads is browser-wide.
// The shell is cards, skeletons, and the host site's theme.

const $ = (id) => document.getElementById(id);
const show = (el, on) => el.classList.toggle("hide", !on);

const LM_OPTS = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
};

function status(msg, err = false) {
  $("status").textContent = msg || "";
  $("status").className = err ? "err" : "";
}

let tabId = null;
let st = null; // last MINI_STATUS from the page, or null off X

function ask(type) {
  return new Promise((res) => {
    if (!tabId) return res(null);
    chrome.tabs.sendMessage(tabId, { type }, (r) => {
      if (chrome.runtime.lastError) return res(null);
      res(r);
    });
  });
}

const open = (url) => chrome.tabs.create({ url });

// Same verdicts as nano.js, from the popup's own (stable) surface: the
// canary catches Chromium forks that ship an echoing stub.
let localVerdict = null;

// Raw availability, no canary and no session. The poll leans on this, so it
// has to stay cheap.
async function lmState() {
  if (typeof LanguageModel === "undefined") return "unavailable";
  return LanguageModel.availability(LM_OPTS).catch(() => "unavailable");
}

async function localNano() {
  if (localVerdict === "ok" || localVerdict === "stub") return localVerdict;
  const a = await lmState();
  if (a === "unavailable") return "unavailable";
  if (a === "downloading") return "downloading";
  if (a !== "available") return "needs-download";
  try {
    const s = await LanguageModel.create(LM_OPTS);
    const out = await s.prompt("Reply with exactly: OK");
    s.destroy?.();
    localVerdict = /not available in chromium|echoing back/i.test(out) ? "stub" : "ok";
  } catch {
    return "unavailable";
  }
  return localVerdict;
}

const voiceFromStore = () =>
  new Promise((res) => chrome.storage.local.get("vf_voice", (o) => res(o.vf_voice || null)));

function renderVoice(v, onProfile) {
  const view = $("voice-view");
  view.replaceChildren();
  show($("voice-sk"), false);
  show($("has-voice"), !!v);
  show($("no-voice"), !v);
  if (!v) {
    const b = $("learn");
    b.disabled = !onProfile;
    b.textContent = onProfile ? `Learn from @${onProfile}` : "Learn from this page";
    return;
  }
  const name = document.createElement("div");
  name.className = "name";
  name.textContent = `@${v.handle}`; // model/page supplied: textContent only
  const dom = document.createElement("div");
  dom.className = "dom";
  dom.textContent = `${v.site === "x" ? "X" : v.site} · ${v.n_posts} posts`;
  view.append(name, dom);
  const traits = (v.voice || []).slice(0, 4);
  if (traits.length) {
    const chips = document.createElement("div");
    chips.className = "chips";
    for (const t of traits) {
      const c = document.createElement("span");
      c.className = "chip";
      c.textContent = t;
      chips.append(c);
    }
    view.append(chips);
  }
  if (v.building) {
    const b = document.createElement("div");
    b.className = "building";
    b.textContent = `building: ${v.building}${v.warmth ? ` · ${v.warmth}` : ""}`;
    view.append(b);
  }
  show($("relearn"), !!onProfile);
}

function paintHero(nano) {
  show($("view-out"), true);
  show($("view-in"), false);
  const note = $("hero-note");
  const dl = $("dl");
  const bar = $("dl-bar");
  if (nano === "needs-download") {
    show(dl, true);
    show(note, false);
    bar.hidden = true;
    return;
  }
  // Already coming down, here or for one of Chrome's own features. No
  // percentage: downloadprogress belongs to the session that asked, and this
  // popup may be a later one. An honest indeterminate bar beats a stale number.
  if (nano === "downloading") {
    show(dl, false);
    bar.hidden = false;
    bar.removeAttribute("value");
    show(note, true);
    note.textContent = "Installing Gemini Nano. It keeps going if you close this.";
    return;
  }
  bar.hidden = true;
  show(dl, false);
  show(note, true);
  note.textContent = nano === "stub"
    ? "This browser ships a fake on-device model. Use Google Chrome."
    : "On-device AI is not available in this browser. He needs Google Chrome 138 or newer.";
}

function paintIn(nano, voice, onProfile) {
  show($("view-out"), false);
  show($("view-in"), true);
  show($("who-sk"), false);
  show($("who"), true);
  const where = $("who").querySelector(".dom");
  where.textContent = st
    ? "Private. Nothing leaves this browser."
    : "Private. Open a thread on X to use him.";
  renderVoice(voice, nano === "ok" ? onProfile : null);
}

// The model can arrive while this page is open, and it can be deleted just as
// easily. Nothing about its state is stored: every tick asks Chrome again, so
// a removed model falls back to the install card on its own.
let poll = 0;
function watch(on) {
  clearInterval(poll);
  if (!on) return;
  poll = setInterval(async () => {
    const a = await lmState();
    if (a === "available") { clearInterval(poll); localVerdict = null; refresh(); return; }
    paintHero(a === "downloading" ? "downloading" : a === "unavailable" ? "unavailable" : "needs-download");
  }, 2000);
}

async function refresh() {
  st = tabId ? await ask("MINI_STATUS") : null;
  const nano = st?.nano || await localNano();
  if (nano !== "ok") {
    paintHero(nano);
    watch(nano === "needs-download" || nano === "downloading");
    return;
  }
  watch(false);
  const voice = st ? st.voice : await voiceFromStore();
  paintIn(nano, voice, st?.onProfile || null);
}

$("home").addEventListener("click", () => open("https://viewfy.ai"));
$("dl").addEventListener("click", async () => {
  const dl = $("dl");
  const bar = $("dl-bar");
  dl.disabled = true;
  dl.textContent = "Installing…";
  bar.hidden = false;
  bar.value = 0;
  watch(false);
  try {
    const s = await LanguageModel.create({
      ...LM_OPTS,
      monitor(m) { m.addEventListener("downloadprogress", (e) => { bar.value = e.loaded; }); },
    });
    s.destroy?.();
    localVerdict = null;
    status("");
  } catch (e) {
    status(String(e?.message || e), true);
  }
  bar.hidden = true;
  dl.disabled = false;
  dl.textContent = "Install Gemini Nano";
  refresh();
});

$("learn").addEventListener("click", async () => {
  const b = $("learn");
  b.disabled = true;
  b.textContent = "Reading your posts…";
  status("");
  const r = await ask("MINI_LEARN");
  if (r?.ok) status("Learned.");
  else status(r?.error || "Couldn't learn from this page.", true);
  refresh();
});

$("relearn").addEventListener("click", async () => {
  $("relearn").disabled = true;
  status("Reading your posts…");
  const r = await ask("MINI_LEARN");
  $("relearn").disabled = false;
  if (r?.ok) status("Learned again.");
  else status(r?.error || "Couldn't learn from this page.", true);
  refresh();
});

$("forget").addEventListener("click", async () => {
  const done = await ask("MINI_CLEAR_VOICE");
  if (!done) await new Promise((res) => chrome.storage.local.remove("vf_voice", res));
  status("Forgotten.");
  refresh();
});

async function paintHostTheme() {
  const apply = globalThis.__vfThemeApply;
  if (!apply) return;
  try {
    if (tabId) {
      const resp = await new Promise((res) => {
        chrome.tabs.sendMessage(tabId, { type: "THEME" }, (r) => {
          if (chrome.runtime.lastError) return res(null);
          res(r);
        });
      });
      if (resp?.ok && resp.theme) {
        apply(document.documentElement, resp.theme);
        return;
      }
    }
  } catch {}
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  apply(document.documentElement, globalThis.__vfThemeKit?.palette?.(dark ? "dark" : "light") || {
    scheme: dark ? "dark" : "light",
  });
}

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id || null;
  await paintHostTheme();
  await refresh();
})();
