// The on-device model, and nothing else. No server exists in this extension.
//
// Chromium (embedded browsers, forks) ships a stub LanguageModel that echoes
// the input back; a canary prompt catches it, `typeof` does not.

(() => {
  let session = null;
  let verdict = null; // "ok" | "stub" | "unavailable" | "needs-download"

  // Chrome logs a warning (and attests nothing) when a request names no
  // output language. English in, English out. availability() takes these
  // too: it is a request like any other, and it warned from the popup.
  const LM_OPTS = {
    expectedInputs: [{ type: "text", languages: ["en"] }],
    expectedOutputs: [{ type: "text", languages: ["en"] }],
  };

  const strip = (s) => String(s || "").replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "").trim();

  const parseJson = (s) => {
    try { return JSON.parse(strip(s)); } catch {}
    const m = String(s).match(/[[{][\s\S]*[\]}]/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return null;
  };

  // Em and en dashes read as machine writing. Swap them for the punctuation a
  // person would have typed: digit ranges keep a plain hyphen, everything else
  // becomes a comma, then double punctuation is tidied up. The prompt also
  // bans them, but small models slip; this is the guarantee.
  // Same story for whitespace: the prompts ask for one paragraph and no line
  // breaks, and Nano still hands back a newline or a doubled space mid draft.
  // Nothing downstream cleans that, so collapse every run to one space first.
  // It also lets the "--" rules below see a plain space either side.
  const humanize = (s) => String(s || "")
    .replace(/\s+/g, " ")
    .replace(/(\d)\s*[‒–—―]\s*(?=\d)/g, "$1-")
    .replace(/\s*[‒–—―⸺⸻]+\s*/g, ", ")
    .replace(/(\w) --+ (?=\w)/g, "$1, ")
    .replace(/(\w)--+(?=\w)/g, "$1, ")
    .replace(/,+\s*(?=[,.;:!?)\]])/g, "")
    .replace(/([([])\s*,\s*/g, "$1")
    .replace(/^[,\s]+/, "")
    .replace(/[,\s]+$/, "");

  globalThis.__vfHumanize = humanize;

  // "ONE or TWO sentences" is a hint to a model this small, not a rule: real
  // drafts come back at three sentences and near X's 280 cap. So enforce it
  // the way the dash ban is enforced. A boundary is .!? then whitespace then
  // the start of a word. The whitespace alone spares decimals ("3.5"), the
  // ellipsis rules spare "just... work", and ABBR spares "e.g. this" and
  // "Mr. Anupam". A lowercase start still counts, because plenty of founders
  // type in lowercase and their drafts need the cap too. Requiring the next
  // sentence to have STARTED means a trailing "!" or "?" is never a boundary,
  // so a growing stream never has to un-paint a cut it already made.
  const ABBR = /(?:^|[\s("'.])(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|inc|ltd|co|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec|[a-z])$/i;
  const clip = (s, max = 2) => {
    const t = String(s || "");
    const re = /([.!?]+)(["'\u201d\u2019)\]]*)\s+(?=["'\u201c\u2018(]*[A-Za-z0-9])/g;
    let m, cut = 0, n = 0;
    while ((m = re.exec(t))) {
      if (m[1] === "." && ABBR.test(t.slice(0, m.index))) continue;
      if (/^\.\.+$/.test(m[1])) continue; // an ellipsis is one sentence thinking
      cut = m.index + m[1].length + m[2].length;
      if (++n === max) break;
    }
    // Cut only on a whole sentence, and only when something follows it. Fewer
    // boundaries than the cap means there is nothing to drop, and half a draft
    // is worse than a long one.
    return n === max && cut > 0 && cut < t.length ? t.slice(0, cut).trimEnd() : t;
  };

  globalThis.__vfClip = clip;

  async function status() {
    if (typeof LanguageModel === "undefined") return (verdict = "unavailable");
    const a = await LanguageModel.availability(LM_OPTS).catch(() => "unavailable");
    if (a === "unavailable") return (verdict = "unavailable");
    // Chrome is fetching it, for us or for one of its own features. Never
    // cached: it is the one verdict that changes on its own, and a stored
    // "downloading" would outlive the download.
    if (a === "downloading") return "downloading";
    if (a !== "available") return (verdict = "needs-download");
    if (verdict === "ok" || verdict === "stub") return verdict;
    try {
      const s = await LanguageModel.create(LM_OPTS);
      const out = await s.prompt("Reply with exactly: OK");
      s.destroy?.();
      verdict = /not available in chromium|echoing back/i.test(out) ? "stub" : "ok";
    } catch {
      verdict = "unavailable";
    }
    return verdict;
  }

  // Cheap pre-check with no session and no canary. "maybe" means available;
  // ensure() still runs the canary before the first real draft. Only ok/stub
  // are trusted from cache: a cached "needs-download" would keep gating the
  // badge after the popup already fetched the model (it is browser-wide).
  async function quick() {
    if (verdict === "ok") return "maybe";
    if (verdict === "stub") return "stub";
    if (typeof LanguageModel === "undefined") return "unavailable";
    const a = await LanguageModel.availability(LM_OPTS).catch(() => "unavailable");
    if (a === "unavailable") return "unavailable";
    if (a === "downloading") return "downloading";
    if (a !== "available") return "needs-download";
    return "maybe";
  }

  // Fresh session per task: prompt() accumulates conversation history on a
  // reused session, and Nano's window is small. Three drafts in, it overflows.
  async function ensure() {
    const v = await status();
    if (v !== "ok") throw new Error(v === "downloading"
      ? "Gemini Nano is still installing. Give it a few minutes."
      : v === "needs-download"
      ? "Model not downloaded yet. Open the Viewfy Mini popup once to fetch it."
      : v === "stub"
        ? "This browser ships a fake on-device model. Use Google Chrome."
        : "On-device AI is unavailable in this browser.");
    session?.destroy?.();
    session = await LanguageModel.create(LM_OPTS);
    return session;
  }

  // Posts in, voice profile out. Small model: short prompt, strict shape.
  async function learnVoice(posts) {
    const s = await ensure();
    const out = await s.prompt(
      `Here are posts one person wrote:\n${posts.map((p, i) => `${i + 1}. "${p.slice(0, 280)}"`).join("\n")}\n\n` +
      `Reply with ONLY minified JSON, no markdown fences:\n` +
      `{"building":"<what they seem to be building or doing, short phrase>",` +
      `"audience":"<who they talk to>",` +
      `"voice":["<how they sound>","<how they treat people>","<form: lowercase/casual/etc>"],` +
      `"phrases":["<short phrase they would say>","<another>"],` +
      `"warmth":"<one clause: they congratulate people and compliment the work>"}\n` +
      `Prefer traits like curious, generous, complimentary. Never cold, savage, dunking, or blunt.`
    );
    const j = parseJson(out);
    if (!j || !j.voice) throw new Error("Couldn't read a voice from this page.");
    return j;
  }

  // Thread in (the shape the site adapters return, plus optional `direction`
  // = text the founder already typed, and `used` = drafts already shown),
  // draft out. onDelta streams the accumulated text so field.js can paint it
  // into native textareas as he writes.
  async function draftReply(thread, voiceProfile, { onDelta } = {}) {
    const s = await ensure();
    const v = voiceProfile || {};
    const t = thread || {};
    const comments = (t.comments || []).slice(0, 4)
      .map((c) => `- ${c.author ? `${c.author}: ` : ""}${String(c.body || "").slice(0, 200)}`)
      .join("\n");
    const used = (t.used || []).slice(-2)
      .map((d, i) => `${i + 1}. "${String(d).slice(0, 200)}"`)
      .join("\n");
    const where = t.venue || t.channel || t.source || "a thread";
    let input;
    if (t.surface === "compose") {
      // No thread to answer, so the subject is whatever they started
      // typing, or what they are building. With neither, a small model
      // invents a slogan; say so instead of shipping one.
      const seed = String(t.direction || "").slice(0, 300);
      if (!seed && !v.building) {
        throw new Error("Type a few words and he will finish the post, or learn your voice from your own profile first.");
      }
      input =
        `Write a post for ${where} as this person:\n` +
        `- they are building: ${v.building || "unknown"}\n` +
        `- who they talk to: ${v.audience || "other builders"}\n` +
        `- style: ${(v.voice || ["plain", "friendly"]).join(", ")}\n` +
        (v.phrases?.length ? `- phrases they use: ${v.phrases.join(" | ")}\n` : "") +
        (seed
          ? `\nThey already started typing this. That is the subject: keep its intent and words, and finish it:\n"${seed}"\n`
          : `\nNo subject yet. Post one concrete thing about what they are building, something true today, not a slogan.\n`) +
        (used ? `\nThey rejected these drafts; write something genuinely different:\n${used}\n` : "") +
        `\nRules: ONE or TWO sentences, 40 words max, one paragraph, no line breaks. ` +
        `no hashtags, no links, no emoji, no hype, no engagement bait, nothing like ` +
        `"excited to announce". plain text only, no markdown, no bullet lists.\n` +
        `Write like a person typing, not an assistant. Contractions are fine. ` +
        `Never use an em dash or en dash anywhere; use a comma or start a new sentence instead.`;
    } else input =
      `Thread on ${where}:\nTitle: ${String(t.title || "").slice(0, 200)}\n` +
      (t.selftext && t.selftext !== t.title ? `Post: ${String(t.selftext).slice(0, 800)}\n` : "") +
      (t.reply_to?.body
        ? `They are replying to this comment by ${t.reply_to.author || "someone"}: ${String(t.reply_to.body).slice(0, 300)}\n`
        : "") +
      (comments ? `Replies so far:\n${comments}\n` : "") +
      `\nWrite a warm reply to this thread as this person:\n` +
      `- they are building: ${v.building || "unknown"}\n` +
      `- style: ${(v.voice || ["plain", "friendly"]).join(", ")}\n` +
      (v.warmth ? `- they come across as: ${v.warmth}\n` : "") +
      (v.phrases?.length ? `- phrases they use: ${v.phrases.join(" | ")}\n` : "") +
      (t.direction
        ? `\nThey already started typing this; keep its intent and words, build the reply from it:\n"${String(t.direction).slice(0, 300)}"\n`
        : "") +
      (used ? `\nThey rejected these drafts; write something genuinely different:\n${used}\n` : "") +
      `\nRules: answer the thread's actual question first. be specific. no hype, ` +
      `no links, no self-promotion. ONE or TWO sentences, 40 words max, one ` +
      `paragraph, no line breaks. plain text only, no markdown, no bullet lists.\n` +
      `Write like a person typing, not an assistant. Contractions are fine. ` +
      `Never use an em dash or en dash anywhere; use a comma or start a new sentence instead.\n` +
      `WARMTH (same as the main Viewfy extension): compliment the actual work ` +
      `they shipped, on one specific detail from THIS post, not "great job" or ` +
      `"great post". add one useful thought only if it fits inside the two ` +
      `sentences. never dunk, never talk down, never a cold "x is A. y is B." contrast.`;
    let out = "";
    if (onDelta && typeof s.promptStreaming === "function") {
      // Chunks are deltas on current Chrome; older builds streamed the full
      // text so far. Accumulate defensively for both.
      for await (const chunk of s.promptStreaming(input)) {
        const piece = String(chunk);
        out = piece.length >= out.length && piece.startsWith(out) ? piece : out + piece;
        // Cap the accumulation, not just the result: field.js paints each
        // delta into the real box, so trimming later would make him watch a
        // third sentence type itself and then vanish.
        onDelta(clip(humanize(strip(out))));
      }
    } else {
      out = await s.prompt(input);
    }
    return clip(humanize(strip(out)));
  }

  // Download must be user-gesture initiated; the popup owns that flow (a
  // click inside the draft card also carries one). The component is
  // browser-wide, so once any context fetched it, we're "ok".
  async function download(onProgress) {
    const s = await LanguageModel.create({
      ...LM_OPTS,
      monitor(m) { m.addEventListener("downloadprogress", (e) => onProgress?.(e.loaded)); },
    });
    s.destroy?.();
    verdict = null;
    return status();
  }

  globalThis.__vfNano = { status, quick, learnVoice, draftReply, download };
})();
