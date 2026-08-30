# Viewfy Mini

Reads your X account, understands the page you're on and drafts messages in
your voice with an on-device LLM. No account, no server, no API key. Nothing
leaves the browser.

The model is Chrome's built-in Gemini Nano, reached through the Prompt API,
so every prompt and every post it reads stays on your machine.

Mini drafts where you already are. The [full Viewfy](https://viewfy.ai/chrome)
finds the threads where your buyers are asking and queues the drafts for your
approval.

![A drafted reply sitting in X's own reply box, with the mascot badge in the composer tool row](docs/reply.png)

## Requirements

- Chrome 138 or newer
- The built-in model component: a one-time download of about two minutes that
  the popup offers on first run. It is browser-wide, not per extension.

<img src="docs/popup.png" alt="The toolbar popup reporting that on-device Gemini Nano is ready" width="420">

## Install

1. Open `chrome://extensions` and turn on Developer mode
2. Load unpacked, pick this folder
3. Click the Viewfy Mini icon. If the hero card offers it, hit
   **Download the model**. Clicking the mascot while you are replying offers
   the same download in a card.

## Use

1. Open **your own profile** (x.com/you), open the popup, hit
   **Learn from @you**. It needs three or more visible posts, so scroll a
   little first.
2. Open any X status page and start a reply. The mascot badge appears in the
   composer's tool row.
3. Click him. The draft lands where you type, streaming live in native text
   fields. There is no review card. You edit it right there and you post it
   yourself.

![The mascot badge in X's composer tool row, showing the Draft a post tip](docs/badge.png)
4. Click him again for another version. One is prefetched in the background,
   so the swap is instant. Type a few words first and the tip flips to
   *Rewrite from this*: he builds the reply from your seed.

Nothing is ever submitted for you, and nothing is read passively. Voice
learning runs on an explicit button press, on your own profile page only.

## Layout

No build step and no dependencies. The files load in manifest order.

| File | What it does |
| --- | --- |
| `sites.js` | Adapter registry, plus the DOM work every adapter needs |
| `theme.js` | Host-theme tokens, shared by the content scripts and the popup |
| `site-x.js` | X adapter: badge geometry, Lexical insert, thread read |
| `nano.js` | The on-device model, its prompts, and the humanizer |
| `voice.js` | Voice learning and its `chrome.storage.local` record |
| `content.js` | Resolves the adapter that owns the page, answers the popup |
| `field.js` | The badge, the tip, the card, and the insert loop |
| `popup.html`, `popup.js` | Model status, the download gesture, the voice profile |

Adding a surface means adding one `site-*.js` file and two manifest entries.
Nothing in `field.js` or `content.js` changes.

## Humanized output

Drafts never contain em or en dashes. The prompt bans them and `__vfHumanize`
in `nano.js` enforces it: a dash becomes a comma or a new sentence, and digit
ranges keep a plain hyphen. The test covers it.

```bash
node humanize.test.mjs
```

## Known limits

- X only for now: replies, the reply modal, and the home composer. No DMs.
- In the home composer there is no thread to read, so the post comes from
  what you started typing, or from what he learned you are building.
- Nano is good at voice traits and mediocre at "what they're building".
  Expect to click him twice. Drafts are one or two sentences.
- Chromium builds and embedded browsers ship a fake `LanguageModel` that
  echoes the input back. The popup and the badge both catch it with a canary
  prompt and name it.

## License

[Apache 2.0](LICENSE). The code is yours to fork. The Viewfy name and the
mascot art under `assets/` are brand assets and are not part of the grant,
see [NOTICE](NOTICE).
