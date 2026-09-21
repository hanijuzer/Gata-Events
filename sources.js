/*!
 * GTA Events Hub — sources.js
 * The ONE place to add, remove or fix event sources. Used by the browser app and the weekly updater.
 *
 * RULES FOR THIS FILE
 *  - Never invent an endpoint. Every feed URL carries a `urlStatus`:
 *      "observed"          the link is published on the source's own website (checked 2026-09-21)
 *      "standard-pattern"  the site runs a plugin with a documented, standard URL pattern
 *                          (e.g. The Events Calendar REST API) but the exact URL was not seen. It is
 *                          tried automatically; if it fails the source shows ⚠ and other feeds keep working.
 *      "none"              no usable feed is known. type is "manual" — see manual-events.json.
 *  - Toronto's official "Festivals & Events" open-data dataset is marked RETIRED on open.toronto.ca, and
 *    the community JSON-LD proxy for it is paused (as of 2026-09-21), so Toronto is a manual source for now.
 *
 * TYPES:  tribe  = The Events Calendar (WordPress) REST API   (JSON)
 *         ics    = iCalendar feed                              (.ics)
 *         rss    = RSS/Atom with explicit event-date tags
 *         jsonld = schema.org Event JSON-LD
 *         json   = any JSON, described by a `map` (see README, "Add a source")
 *         manual = no automatic feed; homepage is listed for reference, add events in manual-events.json
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GTASources = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CONFIG = {
    REFRESH_EVERY_DAYS: 7,        // data older than this is refreshed when the site is opened
    HORIZON_DAYS: 180,            // how far ahead to keep events
    FETCH_TIMEOUT_MS: 20000,
    BROWSER_CONCURRENCY: 3,
    // Browsers block most cross-site feed requests (CORS). If you run the free proxy in proxy/cloudflare-worker.js,
    // put its URL here, e.g. 'https://gta-events-proxy.your-name.workers.dev/?url='   (leave '' to disable)
    CORS_PROXY: '',
    // Where the weekly job publishes its output (relative to index.html)
    SERVER_DATA_URL: 'events.json',
    MANUAL_EVENTS_URL: 'manual-events.json',
    USER_AGENT: 'GTAEventsHub/1.0 (+open-source community event aggregator; weekly polite fetch)'
  };

  /* helper: ICS fallback in The Events Calendar's standard export form */
  const tecIcs = origin => origin + '/?post_type=tribe_events&ical=1&eventDisplay=list';
  const tecRest = origin => origin + '/wp-json/tribe/events/v1/events';

  const EVENT_SOURCES = [
    /* ------------------------------ LIVE FEEDS ------------------------------ */
    {
      id: 'visit-mississauga', name: 'Visit Mississauga (City of Mississauga tourism)', city: 'Mississauga', region: 'Peel',
      kind: 'tourism', official: true, priority: 1, enabled: true,
      type: 'tribe', url: tecRest('https://www.visitmississauga.ca'), urlStatus: 'standard-pattern',
      fallback: { type: 'ics', url: 'https://www.visitmississauga.ca/events/list/?ical=1', urlStatus: 'observed' },
      homepage: 'https://www.visitmississauga.ca/events/',
      notes: 'Runs The Events Calendar. The .ics export link is published on the events page. The REST endpoint is tried first because it is not limited to one page of results.'
    },
    {
      id: 'downtown-brampton-bia', name: 'Downtown Brampton BIA', city: 'Brampton', region: 'Peel',
      kind: 'bia', official: false, priority: 2, enabled: true,
      type: 'tribe', url: tecRest('https://downtownbramptonbia.ca'), urlStatus: 'observed',
      fallback: { type: 'ics', url: 'https://downtownbramptonbia.ca/events/list/?ical=1', urlStatus: 'observed' },
      homepage: 'https://downtownbramptonbia.ca/events/',
      notes: 'Business improvement area (not the City itself). The page advertises the REST API (tec-api-version v1) and publishes an .ics export link.'
    },
    {
      id: 'tourism-burlington', name: 'Burlington Economic Development & Tourism', city: 'Burlington', region: 'Halton',
      kind: 'tourism', official: true, priority: 1, enabled: true,
      type: 'tribe', url: tecRest('https://tourismburlington.ca'), urlStatus: 'standard-pattern',
      fallback: { type: 'ics', url: tecIcs('https://tourismburlington.ca'), urlStatus: 'standard-pattern' },
      homepage: 'https://tourismburlington.ca/events/',
      notes: 'The events page shows the standard Events Calendar "Subscribe / Export .ics" controls. Exact feed URLs follow the plugin\'s standard pattern.'
    },
    {
      id: 'downtown-burlington-bia', name: 'Downtown Burlington BIA', city: 'Burlington', region: 'Halton',
      kind: 'bia', official: false, priority: 2, enabled: true,
      type: 'tribe', url: tecRest('https://burlingtondowntown.ca'), urlStatus: 'standard-pattern',
      fallback: { type: 'ics', url: tecIcs('https://burlingtondowntown.ca'), urlStatus: 'standard-pattern' },
      homepage: 'https://burlingtondowntown.ca/all-events/',
      notes: 'Business improvement area. Same plugin pattern as above.'
    },

    /* ----------------- NEEDS A FEED (listed so nothing is forgotten) -----------------
       These are real organisations' websites. No public API/RSS/ICS URL has been confirmed for them, so
       they are NOT fetched. To activate one: find its official feed (look for "Subscribe", "iCal",
       "RSS", or an open-data page), then change type/url/urlStatus and set enabled: true. */
    m('toronto-open-data', 'City of Toronto — Festivals & Events (open data)', 'Toronto', 'municipal', 'https://open.toronto.ca/dataset/festivals-events/',
      'RETIRED: the dataset page reads "Retired", and the CivicTechTO JSON-LD proxy is paused (checked 2026-09-21). Watch the Toronto Open Data catalogue for a replacement.'),
    m('toronto-events-web', 'City of Toronto — events pages', 'Toronto', 'municipal', 'https://www.toronto.ca/explore-enjoy/festivals-events/', 'No public feed confirmed.'),
    m('mississauga-city-calendar', 'City of Mississauga — events calendar', 'Mississauga', 'municipal', 'https://www.mississauga.ca/events-and-attractions/events-calendar/', 'No public feed confirmed on the page. Visit Mississauga (above) covers many of the same events.'),
    m('brampton-city', 'City of Brampton', 'Brampton', 'municipal', 'https://www.brampton.ca/', 'No public feed confirmed.'),
    m('oakville-town', 'Town of Oakville', 'Oakville', 'municipal', 'https://www.oakville.ca/', 'No public feed confirmed.'),
    m('milton-town', 'Town of Milton', 'Milton', 'municipal', 'https://www.milton.ca/', 'No public feed confirmed.'),
    m('vaughan-city', 'City of Vaughan', 'Vaughan', 'municipal', 'https://www.vaughan.ca/', 'No public feed confirmed.'),
    m('markham-city', 'City of Markham', 'Markham', 'municipal', 'https://www.markham.ca/', 'No public feed confirmed.'),
    m('richmond-hill-city', 'City of Richmond Hill', 'Richmond Hill', 'municipal', 'https://www.richmondhill.ca/', 'No public feed confirmed.'),
    m('pickering-city', 'City of Pickering', 'Pickering', 'municipal', 'https://www.pickering.ca/', 'Durham Region — no public feed confirmed.'),
    m('ajax-town', 'Town of Ajax', 'Ajax', 'municipal', 'https://www.ajax.ca/', 'Durham Region — no public feed confirmed.'),
    m('whitby-town', 'Town of Whitby', 'Whitby', 'municipal', 'https://www.whitby.ca/', 'Durham Region — no public feed confirmed.'),
    m('oshawa-city', 'City of Oshawa', 'Oshawa', 'municipal', 'https://www.oshawa.ca/', 'Durham Region — no public feed confirmed.'),
    m('peel-region', 'Region of Peel', 'Mississauga', 'municipal', 'https://www.peelregion.ca/', 'No public feed confirmed.'),
    m('halton-region', 'Halton Region', 'Oakville', 'municipal', 'https://www.halton.ca/', 'No public feed confirmed.'),
    m('york-region', 'York Region', 'Vaughan', 'municipal', 'https://www.york.ca/', 'No public feed confirmed.'),
    m('durham-region', 'Durham Region', 'Oshawa', 'municipal', 'https://www.durham.ca/', 'No public feed confirmed.'),
    m('toronto-public-library', 'Toronto Public Library', 'Toronto', 'library', 'https://tpl.ca/', 'No public events feed confirmed (searched 2026-09-21).'),
    m('mississauga-library', 'Mississauga Library', 'Mississauga', 'library', 'https://www.mississauga.ca/library/', 'No public feed confirmed.'),
    m('brampton-library', 'Brampton Library', 'Brampton', 'library', 'https://www.bramptonlibrary.ca/', 'No public feed confirmed.'),
    m('oakville-library', 'Oakville Public Library', 'Oakville', 'library', 'https://www.oakvillelibrary.ca/', 'No public feed confirmed.'),
    m('rom', 'Royal Ontario Museum', 'Toronto', 'venue', 'https://www.rom.on.ca/', 'No public feed confirmed.'),
    m('ago', 'Art Gallery of Ontario', 'Toronto', 'venue', 'https://ago.ca/', 'No public feed confirmed.'),
    m('living-arts-centre', 'Living Arts Centre', 'Mississauga', 'venue', 'https://www.livingartscentre.ca/', 'No public feed confirmed.'),
    m('rose-theatre', 'The Rose Theatre', 'Brampton', 'venue', 'https://www.rosetheatre.ca/', 'No public feed confirmed.'),
    m('burlington-pac', 'Burlington Performing Arts Centre', 'Burlington', 'venue', 'https://burlingtonpac.ca/', 'No public feed confirmed.'),
    m('cvc', 'Credit Valley Conservation', 'Mississauga', 'conservation', 'https://cvc.ca/', 'No public feed confirmed.'),
    m('trca', 'Toronto and Region Conservation Authority', 'Toronto', 'conservation', 'https://trca.ca/', 'No public feed confirmed.'),
    m('conservation-halton', 'Conservation Halton', 'Milton', 'conservation', 'https://www.conservationhalton.ca/', 'No public feed confirmed.'),
    m('utm', 'University of Toronto Mississauga', 'Mississauga', 'education', 'https://www.utm.utoronto.ca/', 'No public feed confirmed.'),
    m('sheridan', 'Sheridan College', 'Oakville', 'education', 'https://www.sheridancollege.ca/', 'No public feed confirmed.'),
    m('humber', 'Humber College', 'Toronto', 'education', 'https://www.humber.ca/', 'No public feed confirmed.'),
    m('york-u', 'York University', 'Toronto', 'education', 'https://www.yorku.ca/', 'No public feed confirmed.'),
    m('tmu', 'Toronto Metropolitan University', 'Toronto', 'education', 'https://www.torontomu.ca/', 'No public feed confirmed.')

    /* ------------------------------ ADD YOUR OWN ------------------------------
    {
      id: 'my-community-calendar',          // unique, lowercase, no spaces
      name: 'My Community Calendar',
      city: 'Milton',                       // used when the feed does not say which city
      kind: 'community', official: false, priority: 3, enabled: true,
      type: 'ics', url: 'https://example.org/calendar.ics', urlStatus: 'observed',
      homepage: 'https://example.org/events',
      defaultCategories: ['Community']      // optional: used only if the feed has no categories
    },
    ---------------------------------------------------------------------------- */
  ];

  function m(id, name, city, kind, homepage, notes) {
    return { id, name, city, kind, official: kind === 'municipal', priority: 5, enabled: false, type: 'manual', url: null, urlStatus: 'none', homepage, notes };
  }

  const SOURCE_KIND_LABELS = {
    municipal: 'Municipal source', tourism: 'Municipal tourism listing', bia: 'Business improvement area', library: 'Library', venue: 'Venue',
    conservation: 'Conservation authority', education: 'College / university', community: 'Community listing', manual: 'Added manually', demo: 'Demo data'
  };

  return { CONFIG, EVENT_SOURCES, SOURCE_KIND_LABELS };
});
