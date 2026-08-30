# Viewfy Mini

A free Chrome extension that drafts your X posts and replies in your own
voice, using Gemini Nano, the AI model built into Chrome. No account, no
server, no API key. Nothing leaves the browser.

![A reply drafted in your own voice inside X, with the popup showing the voice he learned from your own posts](docs/hero.png)

Install it, and a small mascot appears in X's own composer. Click him and the
draft is written where you were already typing. He learns how you sound from
your own posts, on an explicit button press, and never reads anything in the
background.

He drafts. You edit in place and press Post yourself. Nothing is ever sent for
you.

Mini drafts where you already are. The [full Viewfy](https://viewfy.ai/chrome)
finds the threads where your buyers are asking and queues the drafts for your
approval.

## Install

No Chrome Web Store needed.

1. Download the zip from the [latest release](https://github.com/Viewfy/viewfy-mini-chrome/releases/latest) and unzip it
2. Open `chrome://extensions` and turn on **Developer mode**, top right
3. Click **Load unpacked** and pick the unzipped folder
4. Click the Viewfy Mini icon. On first run Chrome fetches the model, a few
   gigabytes, once for the whole browser and shared by every extension that
   uses it

Needs Chrome 138 or newer on desktop. X only for now: replies, the reply modal
and the home composer.

## Using it

Open your own X profile, scroll a few of your posts into view, and press
**Learn from this page**. Then open any post, click into the reply box, and
click the mascot in the tool row. Click him again for a different take, or
type a few words first and he builds on them.

## License

[Apache 2.0](LICENSE). The code is yours to fork. The Viewfy name and the
mascot art under `assets/` are brand assets and are not part of the grant,
see [NOTICE](NOTICE).
