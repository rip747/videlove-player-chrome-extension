/**
 * VidLove for TMDB
 *
 * Adds "Watch ..." buttons to The Movie Database (themoviedb.org) that deep
 * link into the VidLove player using TMDB ids taken from the page URL:
 *
 *   /movie/{tmdbId}                     -> /embed/movie/{tmdbId}
 *   /tv/{tmdbId}                        -> /embed/tv/{tmdbId}/{s}/{e}
 *   /tv/{tmdbId}/season/{s}             -> /embed/tv/{tmdbId}/{s}/{e}
 *   /tv/{tmdbId}/season/{s}/episode/{e} -> /embed/tv/{tmdbId}/{s}/{e}
 *
 * Where the buttons are placed:
 *   - movie + TV show pages: next to the "Play Trailer" button (verified
 *     markup: `ul.auto.actions li.video > a.play_trailer`).
 *   - TV show pages: additionally on every season card.
 *   - TV season pages: a header button plus one button per episode card
 *     (season/episode are read from the card's `data-url` attribute).
 */
(() => {
  'use strict';

  /* -------------------------------- config -------------------------------- */

  const CONFIG = {
    playerBase: 'https://player.vidlove.cc',
    movieLabel: 'Watch Movie',
    tvShowLabel: 'Watch Show',
    episodeLabel: 'Watch',
    seasonCardButtons: true, // small "Watch" button on each season card of a show page
    defaultSeason: 1, // season used by the TV show page button
    defaultEpisode: 1, // episode used by the TV show page button
  };

  const CLASS = {
    button: 'vidlove-btn',
    smallButton: 'vidlove-btn--sm',
    item: 'vidlove-item',
    injected: 'vidlove-injected',
  };

  const ICON =
    '<svg class="vidlove-icon" viewBox="0 0 24 24" width="14" height="14" ' +
    'aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M8 5v14l11-7z"/></svg>';

  /* ------------------------------- routing -------------------------------- */

  /* TMDB paths carry a slug after the id, for example
       /movie/969681-spider-man-brand-new-day
       /tv/1396-breaking-bad
       /tv/1396-breaking-bad/season/1
       /tv/1396-breaking-bad/season/1/episode/1
     so the slug has to be optional in every pattern. */
  const MOVIE_PATH = /^\/movie\/(\d+)(?:-|\/|$)/;
  const TV_EPISODE_PATH = /^\/tv\/(\d+)(?:-[^/]*)?\/season\/(\d+)\/episode\/(\d+)/;
  const TV_SEASON_PATH = /^\/tv\/(\d+)(?:-[^/]*)?\/season\/(\d+)(?:[/?#]|$)/;
  const TV_SHOW_PATH = /^\/tv\/(\d+)(?:-|\/|$)/;
  // Episode cards expose this as their `data-url` attribute.
  const EPISODE_DATA_URL = /\/tv\/(\d+)(?:-[^/]*)?\/season\/(\d+)\/episode\/(\d+)/;

  /**
   * Describes the TMDB page we are on.
   * @returns {{type: string, [key: string]: any}|null} null on unsupported pages.
   */
  function getRoute() {
    const path = window.location.pathname;
    let match;

    match = path.match(MOVIE_PATH);
    if (match) {
      return { type: 'movie', movieId: match[1] };
    }

    match = path.match(TV_EPISODE_PATH);
    if (match) {
      return {
        type: 'tvEpisode',
        tvId: match[1],
        season: Number(match[2]),
        episode: Number(match[3]),
      };
    }

    match = path.match(TV_SEASON_PATH);
    if (match) {
      return { type: 'tvSeason', tvId: match[1], season: Number(match[2]) };
    }

    match = path.match(TV_SHOW_PATH);
    if (match) {
      return { type: 'tvShow', tvId: match[1] };
    }

    return null;
  }

  /**
   * Stable identity of a route, used to detect client-side navigation.
   * @param {object} route
   * @returns {string|null}
   */
  function routeKey(route) {
    switch (route.type) {
      case 'movie':
        return 'movie:' + route.movieId;
      case 'tvShow':
        return 'tv:' + route.tvId;
      case 'tvSeason':
        return 'tv:' + route.tvId + ':s' + route.season;
      case 'tvEpisode':
        return 'tv:' + route.tvId + ':s' + route.season + ':e' + route.episode;
      default:
        return null;
    }
  }

  /** VidLove player URL builders. */
  const playerUrl = {
    movie: (movieId) => CONFIG.playerBase + '/embed/movie/' + movieId,
    tv: (tvId, season, episode) =>
      CONFIG.playerBase + '/embed/tv/' + tvId + '/' + season + '/' + episode,
  };

  /**
   * The row of action buttons in a movie/show header.
   * @returns {Element|null}
   */
  function findActionsList() {
    return document.querySelector('ul.auto.actions') || document.querySelector('ul.actions');
  }

  /**
   * The small header used by season and episode pages.
   * @returns {Element|null}
   */
  function findSmallHeaderTitle() {
    return document.querySelector('div.header.small.first div.title');
  }

  /**
   * Builds a "Watch" button that opens the player in a new tab.
   * @param {string} url VidLove player URL.
   * @param {string} label Button text.
   * @param {string} description Tooltip / accessible name.
   * @param {boolean} small Use the compact variant (cards, small headers).
   * @returns {HTMLAnchorElement}
   */
  function createButton(url, label, description, small) {
    const link = document.createElement('a');
    link.className =
      CLASS.button +
      (small ? ' ' + CLASS.smallButton : '') +
      ' ' +
      CLASS.injected;
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = description;
    link.setAttribute('aria-label', description);
    link.innerHTML = ICON + '<span>' + label + '</span>';

    // Make sure we always open a new tab, even if the page swallows the click
    // (episode cards on TMDB open an inline panel when clicked).
    link.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      window.open(url, '_blank', 'noopener,noreferrer');
    });

    return link;
  }

  /**
   * Removes every previously injected element.
   */
  function removeInjected() {
    document.querySelectorAll('.' + CLASS.injected).forEach((node) => {
      const item = node.closest('li.' + CLASS.item);
      (item || node).remove();
    });
  }

  /**
   * Movie and TV show pages: button next to "Play Trailer".
   * @param {object} route
   */
  function injectHeaderButton(route) {
    const list = findActionsList();
    if (!list || list.querySelector('li.' + CLASS.item)) {
      return;
    }

    const isMovie = route.type === 'movie';
    const url = isMovie
      ? playerUrl.movie(route.movieId)
      : playerUrl.tv(route.tvId, CONFIG.defaultSeason, CONFIG.defaultEpisode);
    const label = isMovie ? CONFIG.movieLabel : CONFIG.tvShowLabel;
    const description = isMovie
      ? 'Watch this movie on VidLove'
      : 'Watch this show on VidLove (starts at season ' +
        CONFIG.defaultSeason +
        ', episode ' +
        CONFIG.defaultEpisode +
        ')';

    const item = document.createElement('li');
    item.className = CLASS.item + ' flex items-center ml-1 ' + CLASS.injected;
    item.appendChild(createButton(url, label, description, false));

    // "Play Trailer" always lives in the last `li` of the action list; fall back
    // to appending when the page has no trailer at all.
    const trailer = list.querySelector('a.play_trailer');
    const anchor = trailer ? trailer.closest('li') : list.lastElementChild;

    if (anchor) {
      anchor.insertAdjacentElement('afterend', item);
    } else {
      list.appendChild(item);
    }
  }

  /**
   * TV season pages: page level button that starts at episode 1.
   * @param {object} route
   * @param {string} label
   */
  function injectSmallHeaderButton(route, label) {
    const title = findSmallHeaderTitle();
    if (!title || title.querySelector('.' + CLASS.injected)) {
      return;
    }

    const url = playerUrl.tv(route.tvId, route.season, route.episode || 1);
    const description =
      'Watch season ' + route.season + ' on VidLove (starts at episode 1)';
    title.appendChild(createButton(url, label, description, true));
  }

  /**
   * TV show pages: a small button on every season card.
   * @param {object} route
   */
  function injectSeasonCardButtons(route) {
    if (!CONFIG.seasonCardButtons) {
      return;
    }

    document.querySelectorAll('div.season.card').forEach((card) => {
      if (card.querySelector('.' + CLASS.injected)) {
        return;
      }

      const link = card.querySelector('h2 a[href*="/season/"]');
      if (!link) {
        return;
      }

      const match = (link.getAttribute('href') || '').match(/\/season\/(\d+)(?:[\/?#]|$)/);
      if (!match) {
        return;
      }

      const season = Number(match[1]);
      const url = playerUrl.tv(route.tvId, season, 1);
      const button = createButton(
        url,
        CONFIG.episodeLabel,
        'Watch season ' + season + ' on VidLove',
        true
      );

      (link.closest('h2') || link).appendChild(button);
    });
  }

  /**
   * TV season pages: a small button on every episode card.
   * @param {object} route
   */
  function injectEpisodeCardButtons(route) {
    document.querySelectorAll('.episode_list .card[data-url]').forEach((card) => {
      if (card.querySelector('.' + CLASS.injected)) {
        return;
      }

      // data-url looks like /tv/1396-breaking-bad/season/1/episode/1
      const match = (card.getAttribute('data-url') || '').match(EPISODE_DATA_URL);
      if (!match) {
        return;
      }

      const season = Number(match[2]);
      const episode = Number(match[3]);
      const url = playerUrl.tv(match[1], season, episode);
      const button = createButton(
        url,
        CONFIG.episodeLabel,
        'Watch S' + season + 'E' + episode + ' on VidLove',
        true
      );

      const title = card.querySelector('.episode_title h3');
      const info = card.querySelector('.info');

      (title || info || card).appendChild(button);
    });
  }

  /**
   * Injects the right buttons for the current page (idempotent).
   */
  function inject() {
    const route = getRoute();
    if (!route) {
      return; // Not a page we support.
    }

    // Client-side navigation to another title: drop the previous buttons first.
    const key = routeKey(route);
    if (key !== injectedKey) {
      removeInjected();
      injectedKey = key;
    }

    switch (route.type) {
      case 'movie':
      case 'tvShow':
        injectHeaderButton(route);
        break;
      case 'tvSeason':
        injectSmallHeaderButton(route, 'Watch Season ' + route.season);
        injectEpisodeCardButtons(route);
        break;
      case 'tvEpisode':
        injectSmallHeaderButton(route, 'Watch Episode');
        break;
      default:
        break;
    }

    if (route.type === 'tvShow') {
      injectSeasonCardButtons(route);
    }
  }

  let scheduled = false;
  let injectedKey = null;

  function scheduleInject() {
    if (scheduled) {
      return;
    }
    scheduled = true;
    window.setTimeout(() => {
      scheduled = false;
      inject();
    }, 200);
  }

  // The observer fires often on TMDB, so debounce the work. The injectors are
  // idempotent and cheap, which also lets them restore buttons that TMDB has
  // re-rendered (for example when an episode card is expanded).
  function onDomChange() {
    if (!getRoute()) {
      return;
    }
    scheduleInject();
  }

  const observer = new MutationObserver(onDomChange);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('popstate', scheduleInject);
  window.addEventListener('load', scheduleInject);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleInject);
  } else {
    scheduleInject();
  }
})();
