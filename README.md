# GTA Events Hub

A free, installable event-discovery site for **Mississauga and the Greater Toronto Area**. Plain HTML, CSS and JavaScript.
**No AI anywhere** — not to collect, categorise, de-duplicate, rank or summarise events. No account, no paid software, no framework.

> The site opens with clearly labelled **DEMO DATA** (fictional events). Real events appear after the first successful update (see "Option C").

---

## How it works

```
Event sources (sources.js)  →  Tribe REST / ICS / RSS / JSON-LD / JSON feeds the sources publish themselves
        ↓
scripts/update-events.js (Node, weekly, GitHub Actions)  — checks robots.txt, throttles, identifies itself
        ↓
core.js: normalise → categorise → de-duplicate → drop past events
        ↓
events.json (+ data/source-cache.json keeps each source's last good data)
        ↓
Website (GitHub Pages)  →  your browser: IndexedDB cache → filters → cards
```

`core.js` and `collector.js` are shared by the browser and the Node script, so both behave identically.

### The honest limitation about "weekly updates"

A web page **cannot run while it is closed**, and browsers **block most cross-site feed reads (CORS)**. So:

* **What the page does:** every time it opens it checks for a newer `events.json`; feeds older than 7 days are re-tried; **Refresh Events** re-tries everything. Failures never delete saved events.
* **What really updates weekly, unattended:** the free GitHub Actions job in `.github/workflows/update-events.yml` (every Monday) rebuilds `events.json` on GitHub's servers, where CORS doesn't apply, then redeploys the site.
* Optional: `proxy/cloudflare-worker.js` is a free, locked-down CORS proxy if you want the in-browser Refresh button to read feeds directly.

## Setup

### Option A — Local (try it in 10 seconds)
Download the folder and open `index.html`. You will see the demo data. To see real data locally:
`node scripts/update-events.js` (needs Node 18+), then reload — the script also writes `events-data.js`, which lets the page work even when opened straight from disk. (Service worker/PWA install needs http(s), i.e. Options B/C, or `python3 -m http.server`.)

### Option B — Free online (GitHub Pages)
1. Create a free GitHub account → **New repository** → upload every file in this folder (drag and drop works).
2. **Settings → Pages → Build and deployment → Source: "GitHub Actions"**.
3. **Actions** tab → *Update events and deploy* → **Run workflow**. Your site appears at `https://YOUR-NAME.github.io/REPO-NAME/`.

### Option C — Automatic weekly version
Option B *is* Option C: the same workflow also runs every Monday at 09:17 UTC. Check the **Actions** tab for the log; failed sources appear as warnings and the previous data is kept. If GitHub ever pauses schedules on an inactive repo, press **Run workflow** once.

### Install as an app (PWA)
On the hosted site: Chrome/Edge → *Install*; iPhone Safari → *Share → Add to Home Screen*. Events viewed once stay available offline.

## Sources — what is real and what is not

Every entry in `sources.js` says how its URL was established (`urlStatus`). Checked 2026-09-21:

| Source | Type | Status |
|---|---|---|
| Visit Mississauga (City of Mississauga tourism) | Tribe REST, fallback ICS | ICS link **seen on the site**; REST URL is the plugin's standard pattern |
| Downtown Brampton BIA | Tribe REST, fallback ICS | REST API **advertised** by the site; ICS link **seen** |
| Burlington Economic Development & Tourism | Tribe REST, fallback ICS | site shows the standard export controls; exact URLs are the **standard pattern (unconfirmed)** |
| Downtown Burlington BIA | Tribe REST, fallback ICS | same as above |
| City of Toronto "Festivals & Events" open data | — | **Retired** on open.toronto.ca; the community JSON-LD proxy is paused. Disabled. |
| Everything else in your brief (other cities, regions, libraries, museums, universities, conservation areas, venues…) | manual | **No public feed confirmed.** Listed with their homepage, *not* fetched. |

Unconfirmed URLs may fail; that is safe (⚠ in *Sources & status*, nothing deleted). **I could not reach these sites from my build environment (outbound requests were blocked), so no live feed has been exercised end-to-end.** The parsers are covered by tests using realistic sample data; your first Actions run is the real test — read its log.

Also worth knowing: Eventbrite, Ticketmaster and similar require API keys/terms, so they are not included. Nothing here bypasses CAPTCHAs, logins, paywalls or robots.txt (the updater refuses paths robots.txt disallows).

### Add or fix a source
Edit `sources.js`. Copy the commented template at the bottom of `EVENT_SOURCES`. Types: `tribe`, `ics`, `rss` (needs explicit event-date tags), `jsonld`, `json` (with a `map`: `{ itemsPath:'data.items', fields:{ title:'name', start:'starts_at', venue:'place', url:'link', … } }`), `manual`.
If a source has no feed, add its events to **`manual-events.json`** (see `manual-events.example.json`). Those flow through the same categorising and de-duplication and are labelled "Added manually".

## Rules used (all deterministic)

* **Categories:** (1) the source's own categories → (2) explicit mapping table in `core.js`/`categoryMap` → (3) fixed keyword rules, *only* if nothing else matched. "Free Events" is added only when the source says free (or the listing text says "free admission" etc.).
* **Free/paid:** never guessed. Events with no price never match a paid band.
* **Duplicates:** `normalize(title) + date + normalize(venue)`; a record without a venue merges into a same-title/date/city record that has one. Both sources are kept ("+1 more").
* **Highlight rows** ("Happening This Week", "Free Events", …) are just saved filters. Order = date, then the source's own `featured` flag, then time.
* **Dates:** Toronto time. Weeks run Mon–Sun; "Weekend" = Sat–Sun; events longer than 14 days are treated as *ongoing* and only appear on their start day unless "Include long-running" is ticked.
* **Distance:** uses event coordinates if the source has them, otherwise the city centre. No location permission unless you pick "My location".
* **Freshness:** 🟢 today · 🟡 1–4 days · 🟠 5–7 days · 🔴 older than 7 days.
* Recurring events in ICS: only DAILY/WEEKLY rules are expanded; other rules show the first occurrence.

## Files

```
index.html  styles.css  app.js           the site
core.js  collector.js  sources.js        shared logic + source list
demo-data.js                             fictional demo events (generated relative to today)
events.json  events-data.js              data written by the weekly job (ships as demo)
manual-events.json                       your hand-added events
manifest.json  service-worker.js  icons/ fonts/   PWA + self-hosted fonts (SIL OFL)
scripts/update-events.js                 weekly collector (Node, no dependencies)
tests/core.test.js                       run: node --test tests/core.test.js
.github/workflows/update-events.yml      weekly job + Pages deploy
proxy/cloudflare-worker.js               optional CORS proxy
```
Bump `VERSION` in `service-worker.js` when you change site files, so installed apps pick up the update.

## Acceptance checklist — what has actually been verified

Verified by the automated tests / a jsdom run of the real page (20 unit tests + UI script): no AI/API dependency in the code · search (accents, multi-word) · location, date, weekend, price, category, distance filters · free filter · favourites (localStorage) · My Events · Google Calendar URL and `.ics` generation incl. DST · duplicate merging · source failure keeps previous data · last-updated / counts / next-refresh display · demo data labelled · robots.txt parsing · weekly workflow file written.

**Not verified here — please check on your device:** real feeds from the four live sources (see above) · visual layout on phones/tablets (no browser was available to screenshot) · Web Share on your phone · PWA install · the GitHub Pages deploy on your repo.
