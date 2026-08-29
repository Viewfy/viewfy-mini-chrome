// node humanize.test.mjs
// The guarantees on a draft, each one prompted AND enforced in code because
// Nano obeys prose rules only sometimes: no em or en dash and no stray
// whitespace (__vfHumanize), at most two sentences (__vfClip).
import fs from "fs";
const src = fs.readFileSync(new URL("./nano.js", import.meta.url), "utf8");
eval(src);
const h = globalThis.__vfHumanize;
let fail = 0;
const eq = (label, got, want) => {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
};

eq("spaced em dash", h("love the demo — the pricing page sold me"), "love the demo, the pricing page sold me");
eq("tight em dash", h("shipped it—congrats"), "shipped it, congrats");
eq("en dash between words", h("fast – really fast"), "fast, really fast");
eq("digit range keeps hyphen", h("open 9–5 most days"), "open 9-5 most days");
eq("year range keeps hyphen", h("the 2023—2024 run"), "the 2023-2024 run");
eq("double hyphen spaced", h("worked -- barely"), "worked, barely");
eq("double hyphen tight", h("worked--barely"), "worked, barely");
eq("cli flag untouched", h("run it with --verbose on"), "run it with --verbose on");
eq("hyphenated word untouched", h("a well-known on-device model"), "a well-known on-device model");
eq("leading dash dropped", h("— honestly great work"), "honestly great work");
eq("trailing dash dropped", h("great work —"), "great work");
eq("dash before period", h("worth a try —."), "worth a try.");
eq("two dashes one sentence", h("one — two — three"), "one, two, three");
eq("no dashes untouched", h("plain reply, nothing fancy."), "plain reply, nothing fancy.");
eq("empty", h(""), "");

const out = h("mixed — case–with—all of them");
eq("no dash survives", /[‒–—―⸺⸻]/.test(out), false);

// One paragraph, no line breaks, no double space: the model ignores all three,
// so humanize collapses whitespace the same way it swaps dashes.
eq("newline becomes a space", h("distribute things.\nToday I'm on installs"), "distribute things. Today I'm on installs");
eq("paragraph break becomes a space", h("distribute things.\n\nToday I'm on installs"), "distribute things. Today I'm on installs");
eq("double space collapses", h("distribute things.  Today I'm on installs"), "distribute things. Today I'm on installs");
eq("space then newline collapses", h("distribute things. \n Today"), "distribute things. Today");
eq("tab collapses", h("shipped it.\t\tAgain"), "shipped it. Again");
eq("dash across a line break", h("worked\n—\nbarely"), "worked, barely");
const ws = h("one — two\n\nthree  four -- five\n");
eq("no double space survives", / {2}|[\n\r\t]/.test(ws), false);

// The two sentence cap. Nano writes three and blows past X's 280 chars, so the
// cap is enforced here, not just asked for in the prompt.
const c = globalThis.__vfClip;
const real = "Hey Anupam, cool initiative! We're building a platform for hackathons and build distribution, making sharing projects super straightforward. Distribution's not scary, you know, and I think there's a lot of gold out there waiting to be discovered, so keep it up.";
eq("real draft keeps two sentences", c(real), "Hey Anupam, cool initiative! We're building a platform for hackathons and build distribution, making sharing projects super straightforward.");
eq("two sentences untouched", c("Nice ship. Congrats on the launch."), "Nice ship. Congrats on the launch.");
eq("one sentence untouched", c("Nice ship, congrats on the launch."), "Nice ship, congrats on the launch.");
eq("one long sentence is never halved", c("We are building a thing for founders who want their projects found without paying for ads, which is why this thread caught my eye."), "We are building a thing for founders who want their projects found without paying for ads, which is why this thread caught my eye.");
eq("no fragment left behind", c("Nice ship. Congrats on the launch. We are building somethi"), "Nice ship. Congrats on the launch.");
eq("mid stream third sentence dropped", c("Nice ship. Congrats. T"), "Nice ship. Congrats.");
eq("trailing period is not a boundary", c("Nice ship. Congrats on the launch."), "Nice ship. Congrats on the launch.");
eq("bangs count as sentences", c("Nice work! Congrats! Keep going!"), "Nice work! Congrats!");
eq("question keeps its mark", c("Did you ship it? Looks great. Third one here."), "Did you ship it? Looks great.");
eq("decimal is not a boundary", c("Load time dropped to 3.5 seconds. Users noticed. We shipped again."), "Load time dropped to 3.5 seconds. Users noticed.");
eq("initials are not a boundary", c("The U.S. team ships fast. Nice work. Third one here."), "The U.S. team ships fast. Nice work.");
eq("honorific is not a boundary", c("Mr. Anupam shipped it. Nice work. Third one here."), "Mr. Anupam shipped it. Nice work.");
eq("e.g. is not a boundary", c("Use a small model, e.g. Nano, for this. It works. Third one here."), "Use a small model, e.g. Nano, for this. It works.");
eq("unicode ellipsis is not a boundary", c("it should just… work, mostly. Nice ship. Third one here."), "it should just… work, mostly. Nice ship.");
eq("dotted ellipsis is not a boundary", c("wait... Then it clicked, nice. Congrats. Third one here."), "wait... Then it clicked, nice. Congrats.");
eq("closing quote rides along", c('He said "ship it." Then he shipped. Third one here.'), 'He said "ship it." Then he shipped.');
eq("lowercase voice is capped too", c("v1.2 shipped today. mostly works. so far so good."), "v1.2 shipped today. mostly works.");
eq("lowercase after a dotted abbrev holds", c("we use i.e. that trick here. it works. third one here."), "we use i.e. that trick here. it works.");
eq("clip empty", c(""), "");
eq("clip whitespace only", c("   "), "   ");
eq("clipped draft is under X's limit", c(real).length <= 280, true);

// Streaming paints every delta into the real box, so the cap has to hold on
// each prefix and never un-paint: clip(prefix) must stay a prefix of the end.
const final = c(real);
let drift = 0;
for (let i = 1; i <= real.length; i++) if (!final.startsWith(c(h(real.slice(0, i))))) drift++;
eq("stream never has to un-paint", drift, 0);

// The two guarantees stack in the order draftReply applies them.
eq("humanize then clip", c(h("Hey, cool initiative — really.\n\nWe ship daily.  And a third one here.")),
  "Hey, cool initiative, really. We ship daily.");

if (fail) process.exit(1);
console.log("all ok");
