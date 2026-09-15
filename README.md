# VidLove for TMDB

A Chrome extension (Manifest V3) that adds **Watch** buttons to
[The Movie Database](https://www.themoviedb.org) and deep links them into the
VidLove player using tmdb ids read from the page URL.

## Player endpoints

| Endpoint | Used for |
| --- | --- |
| `https://player.vidlove.cc/embed/movie/{tmdbId}` | Movies |
| `https://player.vidlove.cc/embed/tv/{tmdbId}/{season}/{episode}` | TV shows, seasons, episodes |

## URL mapping

| TMDB page URL | Button | Player URL |
| --- | --- | --- |
| `/movie/969681-spider-man-brand-new-day?language=en-US` | **Watch Movie** (next to *Play Trailer*) | `/embed/movie/969681` |
| `/tv/1396-breaking-bad` | **Watch Show** (next to *Play Trailer*) + a small **Watch** button on every season card | `/embed/tv/1396/1/1` (show level, configurable) |
| `/tv/1396-breaking-bad/season/5` | **Watch Season 5** (page header) + a small **Watch** button on every episode card | `/embed/tv/1396/5/{episode}` |
| `/tv/1396-breaking-bad/season/5/episode/1` | **Watch Episode** | `/embed/tv/1396/5/1` |

Every id used in a player URL comes from the page itself (URL path, or the
episode card's `data-url` attribute) — nothing is guessed from titles.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | Extension manifest (MV3); content script runs on `themoviedb.org/movie/*` and `/tv/*`. |
| `content.js` | Route detection, id extraction and button injection. |
| `styles.css` | Button styles (one pill for the header, one compact variant for cards). |
| `icons/icon{16,32,48,128}.png` | Extension icons (dark navy tile with the cyan play triangle). |

## Install (load unpacked)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder (`c:\Projects\Vidlove`).
4. Open a page, e.g. <https://www.themoviedb.org/movie/969681-spider-man-brand-new-day>
   or <https://www.themoviedb.org/tv/1396-breaking-bad/season/1>.

After changing a file, click the reload icon on the extension card and refresh the TMDB tab.

## Configuration

Everything tweakable sits in the `CONFIG` object at the top of `content.js`:

```js
const CONFIG = {
  playerBase: 'https://player.vidlove.cc',
  movieLabel: 'Watch Movie',
  tvShowLabel: 'Watch Show',
  episodeLabel: 'Watch',
  seasonCardButtons: true, // small button on each season card of a show page
  defaultSeason: 1,        // season the show-page button opens
  defaultEpisode: 1,       // episode the show-page button opens
};
```

## Markup notes (checked against live TMDB pages)

The selectors are based on HTML fetched from the real pages, not assumptions:

- **Movie and TV show pages** — the action row is
  `ul.auto.actions`, and the trailer is the last item:
  `<li class="video none flex items-center ml-1"><a class="no_click play_trailer" ...>`.
  The new `<li>` is inserted right after it, which is the empty slot to the
  right of *Play Trailer*. If a title has no trailer, the button is appended to
  the end of `ul.auto.actions` instead, so it still shows up.
- **TV season pages** — `a.play_trailer` and `ul.auto.actions` do **not** exist,
  so the page-level button goes into the small header
  (`div.header.small.first div.title`). Each episode card carries
  `data-url="/tv/{id}/season/{s}/episode/{e}"`, which is parsed for the
  per-episode buttons.
- **TV show pages** — season cards are `div.season.card` with an
  `h2 > a[href*="/season/{n}"]` link; the season number is read from that href.
- **TV episode pages** — `/tv/{id}/season/{s}/episode/{e}` has no action row
  either, but it renders the same small header, so its button goes next to the
  season title.

One gotcha worth remembering: TMDB ids in URLs are always followed by a slug
(`/tv/1396-breaking-bad`, not `/tv/1396`), so every pattern in `content.js`
leaves the slug optional — `/^\/tv\/(\d+)(?:-[^/]*)?\/season\/(\d+)/`. The same
applies to the `data-url` attribute on episode cards.

All four page types were verified against the live site in a browser (movie,
show, season and episode), including the generated `player.vidlove.cc` URLs.

## How it stays clean

- Idempotent injectors: every card/row is checked for an existing button before
  adding one, so the `MutationObserver` can re-run safely and restores buttons
  TMDB re-renders (e.g. when an episode card is expanded).
- Client-side navigation between titles is detected by comparing a route key and
  removing the previous title's buttons.
- Buttons open the player with `window.open(..., '_blank')` and stop propagation,
  so TMDB's own click handlers (the inline episode panel, for instance) don't
  interfere.
- No host permissions, no background service worker, no network requests: the
  extension only reads the page and opens a new tab.

## Troubleshooting

- **No button on a page** — check `chrome://extensions` for content script errors,
  then confirm the page is a `/movie/{id}` or `/tv/{id}` URL (people, list and
  search pages are intentionally ignored).
- **Button in the wrong place after a TMDB redesign** — update the selectors in
  `getRoute()`, `findActionsList()`, `findSmallHeaderTitle()`,
  `injectSeasonCardButtons()` or `injectEpisodeCardButtons()`; each is isolated
  and commented.
- **Need the toolbar icon** — `icons/` is already wired into the manifest. Add an
  `"action"` block (plus a popup) if you want the button in the toolbar too.
