# RustyHarbor Trade Helper

This is the browser extension that powers buying and selling on
[rustyharbor.com](https://rustyharbor.com). It's open source so that
anyone can read every line of code before installing it.

If you don't write code, the next section ("What this extension reads")
is written for you. The technical details further down are for people
who want to verify the code matches the description.

---

## What this extension does

When you buy or sell a Rust skin on rustyharbor.com, the actual trade
goes through Steam. This extension is what lets your browser send and
accept those Steam trades on your behalf. To fully accept the trade as a seller you must confirm it in your Steam Guard mobile app, the extension cannot do that.

Without it, you would have to copy Steam trade offers manually for
every transaction. The extension does this for you in the background,
the same way Steam's own pages do when you click "send trade offer."

## What this extension reads from your Steam session

The extension only reads from pages you're already viewing on Steam.
It does not collect anything from other websites, other tabs, or
games other than Rust.

| What | Where it comes from | Why we need it |
|---|---|---|
| Your Steam ID | A value Steam puts on every page you visit while signed in | So our server knows it's really you when you list a skin |
| Your session ID | A cookie Steam sets on its own pages | Steam requires it on every trade action you take |
| Your trade URL | Your Steam trade offer privacy page | Buyers need it to send you a trade |
| Your Steam Web API key | Only if you visit `steamcommunity.com/dev/apikey`; the extension does not make Steam create one | Lets us check the status of trades without hitting Steam's per-internet-connection request limit |
| Your access token | A small file Steam serves at `steamcommunity.com/pointssummary/ajaxgetasyncconfig` | Same purpose as the API key but rotates automatically |
| Your Rust inventory | `steamcommunity.com/inventory/<your-steamid>/252490/2` | So we can mark listings whose skin is no longer in your account as expired |

## What this extension does NOT read

* Your Steam password (Steam never puts it on the page).
* Your email, payment info, or anything from Steam Settings.
* Pages from other tabs in your browser.
* Inventories for games other than Rust.
* Which pages you visit.
* Anything about your computer, your IP, or your browser identity
  beyond what's needed to make web requests work.

## What it sends to our server

* Your Steam ID, session ID, trade URL, API key, and access token,
  so our server can coordinate trades for you.
* A snapshot of your Rust inventory, so we can keep your listings in
  sync with what you actually own.
* The result of trade page reads our server asks for (see "How trade
  checks work" below).

That's everything. No analytics, no usage tracking, no error reports
to third parties.

## How trade checks work

When a buyer pays for one of your listings, our server needs to
confirm the trade actually went through on Steam. The check happens
this way:

1. Our server sends a message to your browser saying "please read
   this specific Steam page and tell me what it says."
2. Your browser reads the page using your normal Steam session and
   sends the contents back.
3. Our server decides what to do based on what Steam said.

The extension can only talk to a fixed set of sites, declared in its
manifest (`manifest.chrome.json` / `manifest.firefox.json`): Steam
(`steamcommunity.com`, `api.steampowered.com`, `login.steampowered.com`)
and RustyHarbor (`rustyharbor.com`, `api.rustyharbor.com`). The browser
itself enforces this. The extension cannot reach any other site, even
if our server asks it to.

## Verifying the build you have installed

Open the extension popup. At the bottom you'll see the version and a
short Git commit hash. That hash matches a specific commit in this
repository. You can `git checkout` that commit, run `npm install` and
`npm run build`, and the resulting build should match what you've
installed.

## Building it yourself

You'll need [Node.js](https://nodejs.org/) 20 or newer.

```bash
git clone https://github.com/Rusty-Harbor/rustyharbor-extension.git
cd rustyharbor-extension
npm install
npm run build
```

The output lands in `dist/firefox/` and `dist/chrome/`. To load it:

**Firefox**

1. Visit `about:debugging` in your browser.
2. Click "This Firefox" in the sidebar.
3. Click "Load Temporary Add-on."
4. Pick `dist/firefox/manifest.json`.

**Chrome**

1. Visit `chrome://extensions`.
2. Turn on "Developer mode" in the top right.
3. Click "Load unpacked."
4. Pick the `dist/chrome` folder.

## License

MIT. See [LICENSE](LICENSE).
