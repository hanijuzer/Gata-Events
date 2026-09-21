/* GTA Events Hub — app.js
   Vanilla JavaScript. No frameworks, no AI, no accounts. Data flow:
   sources → (weekly server job → events.json) and/or (optional direct browser fetch) → normalise → de-duplicate
   → IndexedDB cache → filters → cards. */
(function () {
  'use strict';

  const Core = window.GTACore;
  const { CONFIG, EVENT_SOURCES, SOURCE_KIND_LABELS } = window.GTASources;
  const Collector = window.GTACollector;
  const Demo = window.GTADemo;

  const PAGE_SIZE = 48;
  const RAIL_DAYS = 21;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = u => (Core.isHttpUrl(u) ? u.trim() : '');
  const icon = (id, cls) => '<svg class="ico' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#i-' + id + '"/></svg>';

  /* ------------------------------------------------------------------ storage */
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } }
  };
  const idb = (function () {
    let dbp;
    function open() {
      return dbp || (dbp = new Promise((res, rej) => {
        const r = indexedDB.open('gta-events-hub', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      }));
    }
    return {
      async get(k) { try { const db = await open(); return await new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); } catch (_) { return undefined; } },
      async set(k, v) { try { const db = await open(); return await new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(true); t.onerror = () => rej(t.error); }); } catch (_) { return false; } },
      async del(k) { try { const db = await open(); return await new Promise(res => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').delete(k); t.oncomplete = () => res(true); t.onerror = () => res(false); }); } catch (_) { return false; } }
    };
  })();

  /* ------------------------------------------------------------------ constants */
  const ICON = {
    'Family & Kids': '👨‍👩‍👧', 'Free Events': '🆓', 'Festivals': '🎪', 'Cultural': '🌍', 'Arts': '🎨', 'Music': '🎵', 'Concerts': '🎤', 'Comedy': '😄',
    'Sports': '🏅', 'Food & Drink': '🍽️', 'Farmers Markets': '🥕', 'Community': '🤝', 'Networking': '🔗', 'Business': '💼', 'Career': '🧑‍💼',
    'Education': '🎓', 'Workshops': '🛠️', 'Technology': '💻', 'Health & Fitness': '🧘', 'Nature & Outdoors': '🌳', 'Parks': '🏞️', 'Library': '📚',
    'Museum': '🏛️', 'Theatre': '🎭', 'Movies': '🎬', 'Exhibitions': '🖼️', 'Religious/Cultural celebrations': '🪔', 'Holiday Events': '🎃',
    'Government/Community': '📣', 'Shopping': '🛍️', 'Other': '📍'
  };
  const GROUP = {
    'Family & Kids': 'g-family', 'Music': 'g-perform', 'Concerts': 'g-perform', 'Comedy': 'g-perform', 'Theatre': 'g-perform', 'Movies': 'g-perform',
    'Arts': 'g-culture', 'Cultural': 'g-culture', 'Museum': 'g-culture', 'Exhibitions': 'g-culture', 'Library': 'g-culture',
    'Festivals': 'g-festival', 'Holiday Events': 'g-festival', 'Religious/Cultural celebrations': 'g-festival',
    'Community': 'g-civic', 'Government/Community': 'g-civic', 'Sports': 'g-active', 'Health & Fitness': 'g-active',
    'Nature & Outdoors': 'g-nature', 'Parks': 'g-nature', 'Food & Drink': 'g-food', 'Farmers Markets': 'g-food', 'Shopping': 'g-food',
    'Business': 'g-work', 'Networking': 'g-work', 'Career': 'g-work', 'Education': 'g-work', 'Workshops': 'g-work', 'Technology': 'g-work'
  };
  /* Curated sections are plain filter presets — dates, categories, price. No ranking, no AI. */
  const COLLECTIONS = [
    { id: 'week', icon: '🔥', title: 'Happening This Week', set: { date: 'week' } },
    { id: 'weekend', icon: '📅', title: 'This Weekend', set: { date: 'weekend' } },
    { id: 'free', icon: '🆓', title: 'Free Events', set: { price: 'free' } },
    { id: 'family', icon: '👨‍👩‍👧', title: 'Family & Kids', set: { cats: ['Family & Kids'] } },
    { id: 'music', icon: '🎵', title: 'Music & Concerts', set: { cats: ['Music', 'Concerts'] } },
    { id: 'arts', icon: '🎭', title: 'Arts & Culture', set: { cats: ['Arts', 'Cultural', 'Theatre', 'Museum', 'Exhibitions', 'Comedy'] } },
    { id: 'sports', icon: '🏃', title: 'Sports & Fitness', set: { cats: ['Sports', 'Health & Fitness'] } },
    { id: 'outdoor', icon: '🌳', title: 'Outdoor & Nature', set: { cats: ['Nature & Outdoors', 'Parks'] } },
    { id: 'business', icon: '💼', title: 'Business & Networking', set: { cats: ['Business', 'Networking', 'Career', 'Technology'] } },
    { id: 'edu', icon: '🎓', title: 'Education & Workshops', set: { cats: ['Education', 'Workshops', 'Library'] } }
  ];
  const DATE_LABELS = { today: 'Today', tomorrow: 'Tomorrow', weekend: 'This Weekend', week: 'Rest of this week', next7: 'Next 7 Days', next14: 'Next 14 Days', nextweek: 'Next Week', month: 'This Month', custom: 'Custom dates' };
  const PRICE_LABELS = { free: 'Free', u10: 'Under $10', '10-25': '$10–$25', '25-50': '$25–$50', '50+': '$50+' };
  const CENTERS = ['Mississauga', 'Brampton', 'Toronto', 'Etobicoke', 'North York', 'Scarborough', 'Oakville', 'Milton', 'Burlington', 'Vaughan', 'Markham', 'Richmond Hill', 'Pickering', 'Ajax', 'Whitby', 'Oshawa'];

  /* ------------------------------------------------------------------ state */
  const defaultFilters = () => ({ q: '', region: 'All GTA', date: 'any', from: '', to: '', price: 'all', km: 0, center: 'Mississauga', cats: new Set(), includeLong: false });
  const prefs = LS.get('gta.prefs', {});
  const state = {
    events: [], byId: new Map(), byKey: new Map(), usingDemo: false,
    filters: Object.assign(defaultFilters(), { region: prefs.region || 'All GTA', center: prefs.center && prefs.center !== '__me__' ? prefs.center : 'Mississauga' }),
    shown: PAGE_SIZE, view: 'discover', busy: false, myLoc: null, manualEvents: [], filtered: []
  };
  let cache = newCache();
  let favs = LS.get('gta.favs', {});

  function newCache() { return { v: 1, serverEvents: null, serverSources: {}, serverGeneratedAt: null, serverDemo: false, bySource: {}, lastRun: null }; }

  /* ------------------------------------------------------------------ formatting */
  const fmtCache = {};
  function fmt(d, opts) {
    const k = JSON.stringify(opts);
    const f = fmtCache[k] || (fmtCache[k] = new Intl.DateTimeFormat('en-CA', Object.assign({ timeZone: 'UTC' }, opts)));
    return f.format(new Date(d + 'T12:00:00Z'));
  }
  function fmtTime(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    return ((h % 12) || 12) + ':' + String(m).padStart(2, '0') + ' ' + (h < 12 ? 'AM' : 'PM');
  }
  const fmtInstant = iso => iso ? new Intl.DateTimeFormat('en-CA', { timeZone: Core.TZ, dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso)) : '';
  const fmtInstantDate = iso => iso ? new Intl.DateTimeFormat('en-CA', { timeZone: Core.TZ, dateStyle: 'long' }).format(new Date(iso)) : '';

  function whenParts(ev) {
    const same = !ev.endDate || ev.endDate === ev.startDate;
    let date, time = '';
    if (same) date = fmt(ev.startDate, { weekday: 'long', month: 'long', day: 'numeric' });
    else if (Core.isLongRunning(ev)) date = 'Ongoing: ' + fmt(ev.startDate, { month: 'short', day: 'numeric' }) + ' – ' + fmt(ev.endDate, { month: 'short', day: 'numeric' });
    else date = fmt(ev.startDate, { weekday: 'short', month: 'short', day: 'numeric' }) + ' – ' + fmt(ev.endDate, { weekday: 'short', month: 'short', day: 'numeric' });
    if (ev.allDay || !ev.startTime) time = same ? 'All day' : '';
    else time = same ? fmtTime(ev.startTime) + (ev.endTime ? ' – ' + fmtTime(ev.endTime) : '') : 'Starts ' + fmtTime(ev.startTime);
    return { date, time, same };
  }
  function priceLabel(ev) {
    if (ev.isFree === true) return { text: 'FREE', cls: 'tag-free' };
    if (ev.priceText) return { text: Core.clip(ev.priceText, 26), cls: 'tag-price' };
    if (ev.priceMin !== undefined) return { text: '$' + ev.priceMin, cls: 'tag-price' };
    return null;
  }
  const primaryCat = ev => (ev.categories || []).filter(c => c !== 'Free Events')[0] || (ev.categories || [])[0] || 'Other';

  /* ------------------------------------------------------------------ data assembly */
  function customSources() {
    return LS.get('gta.custom', []).map(c => ({ id: c.id, name: c.name, city: c.city, kind: 'community', official: false, priority: 3, enabled: true, type: c.type, url: c.url, urlStatus: 'user-supplied', custom: true }));
  }
  const allSources = () => EVENT_SOURCES.concat(customSources());
  const stripInternal = ev => { const o = {}; Object.keys(ev).forEach(k => { if (k[0] !== '_') o[k] = ev[k]; }); return o; };

  function assemble() {
    const today = Core.todayStr();
    let raw = [];
    if (cache.serverEvents && !cache.serverDemo) raw = raw.concat(cache.serverEvents);
    Object.keys(cache.bySource).forEach(id => { raw = raw.concat(cache.bySource[id].events || []); });
    raw = raw.concat(state.manualEvents);
    raw = raw.filter(e => (e.endDate || e.startDate) >= today).map(e => Object.assign({}, e));
    let events = Core.dedupe(raw);
    state.usingDemo = false;
    if (!events.length) { events = Core.dedupe(Demo.build(today)); state.usingDemo = true; }
    events.forEach(ev => {
      ev._s = Core.searchText(ev);
      ev._region = Core.regionOf(ev.city);
      ev._long = Core.isLongRunning(ev);
      ev._coords = Core.eventCoords(ev);
      ev._key = Core.duplicateKey(ev);
    });
    state.events = Core.sortEvents(events);
    state.byId = new Map(state.events.map(e => [e.id, e]));
    state.byKey = new Map(state.events.map(e => [e._key, e]));
  }

  /* source status: merge what the weekly job saw with what this browser saw */
  function sourceStatuses(now) {
    now = now || new Date();
    return allSources().map(src => {
      if (src.type === 'manual' || !src.enabled) return { src, state: src.type === 'manual' ? 'manual' : 'disabled' };
      const a = cache.serverSources[src.id], b = cache.bySource[src.id];
      const cands = [];
      if (a) cands.push(Object.assign({}, a, { via: 'weekly update' }));
      if (b) cands.push(Object.assign({}, b, { via: 'this browser' }));
      if (!cands.length) return { src, state: 'pending' };
      cands.sort((x, y) => ((y.lastAttempt || '') > (x.lastAttempt || '') ? 1 : -1));
      const latest = cands[0];
      const lastOk = cands.map(c => c.lastOk).filter(Boolean).sort().pop() || null;
      const ageDays = lastOk ? (now - new Date(lastOk)) / 86400000 : Infinity;
      const ok = ageDays <= CONFIG.REFRESH_EVERY_DAYS;
      const okCand = cands.find(c => c.lastOk === lastOk);
      return { src, state: ok ? 'ok' : 'failed', lastOk, lastAttempt: latest.lastAttempt, latest, via: okCand && okCand.via, error: latest.status === 'failed' ? latest.error : '', kept: !ok && lastOk };
    });
  }
  function summary() {
    const st = sourceStatuses();
    const feeds = st.filter(s => ['ok', 'failed', 'pending'].indexOf(s.state) !== -1);
    const okN = feeds.filter(s => s.state === 'ok').length;
    const failN = feeds.filter(s => s.state === 'failed').length;
    let lastUpdated = st.map(s => s.lastOk).filter(Boolean).sort().pop() || null;
    if (!lastUpdated && cache.serverGeneratedAt && cache.serverEvents && cache.serverEvents.length && !cache.serverDemo) lastUpdated = cache.serverGeneratedAt;
    return { st, feeds, okN, failN, total: feeds.length, lastUpdated };
  }

  /* ------------------------------------------------------------------ refresh */
  const needsAttempt = (s, hours) => { const b = cache.bySource[s.id]; return !b || !b.lastAttempt || (Date.now() - new Date(b.lastAttempt)) / 3600000 >= hours; };

  async function refresh(opts) {
    opts = opts || {};
    if (state.busy) return;
    state.busy = true; setBusy(true);
    const now = new Date();
    const ctx = Collector.makeContext({
      now, horizonDays: CONFIG.HORIZON_DAYS, fetch: (u, o) => fetch(u, o), timeoutMs: CONFIG.FETCH_TIMEOUT_MS, isBrowser: true,
      wrapUrl: CONFIG.CORS_PROXY ? (u => CONFIG.CORS_PROXY + encodeURIComponent(u)) : null
    });
    let gotServer = false;
    let j = null;
    try {
      const r = await fetch(CONFIG.SERVER_DATA_URL + '?t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) j = await r.json();
    } catch (_) { /* offline, or opened straight from disk: try events-data.js below */ }
    if (!j && window.GTA_EVENTS_DATA) j = window.GTA_EVENTS_DATA;
    if (j && j.meta) {
      cache.serverDemo = !!j.meta.demo;
      cache.serverGeneratedAt = j.meta.generatedAt || null;
      cache.serverSources = j.meta.sources || {};
      cache.serverEvents = Array.isArray(j.events) ? j.events : [];
      gotServer = true;
    }
    try {
      const r = await fetch(CONFIG.MANUAL_EVENTS_URL + '?t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) state.manualEvents = Collector.collectManual(await r.json(), ctx);
    } catch (_) { /* optional file */ }

    // direct browser fetch: everything on a manual refresh, otherwise only sources that are not fresh (and not tried in the last 6 h)
    const feeds = allSources().filter(s => s.enabled && s.type !== 'manual');
    const status = sourceStatuses(now);
    const targets = feeds.filter(s => {
      if (opts.manual) return true;
      const st = status.find(x => x.src.id === s.id);
      return (!st || st.state !== 'ok') && needsAttempt(s, 6);
    });
    let idx = 0;
    const worker = async () => {
      while (idx < targets.length) {
        const s = targets[idx++];
        const t0 = new Date().toISOString();
        try {
          const res = await Collector.collectSource(s, ctx);
          cache.bySource[s.id] = { events: res.events, lastOk: t0, lastAttempt: t0, status: 'ok', count: res.events.length, via: res.via, note: res.note };
        } catch (e) {
          const prev = cache.bySource[s.id] || {};
          cache.bySource[s.id] = Object.assign({}, prev, { lastAttempt: t0, status: 'failed', error: e.message, errorKind: e.kind });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONFIG.BROWSER_CONCURRENCY, targets.length) }, worker));

    cache.lastRun = now.toISOString();
    await idb.set('cache', cache);
    assemble();
    state.busy = false; setBusy(false);
    renderAll();
    if (opts.manual) {
      const s = summary();
      if (state.usingDemo) toast('Still showing demo data — no live source has reported yet. See Sources & status.');
      else if (s.failN) toast('Updated ' + s.okN + '/' + s.total + ' sources. ' + s.failN + ' failed — saved events are still shown.');
      else toast('Events refreshed: ' + state.events.length + ' events from ' + s.okN + ' sources.');
    } else if (!gotServer && !targets.length) { /* quiet */ }
  }
  function setBusy(b) {
    const btn = $('#btn-refresh');
    btn.disabled = b; btn.classList.toggle('is-busy', b); btn.setAttribute('aria-busy', String(b));
    $('span', btn).textContent = b ? 'Refreshing…' : 'Refresh Events';
  }

  /* ------------------------------------------------------------------ filtering */
  function currentRange(f) { f = f || state.filters; return Core.dateRange(f.date, Core.todayStr(), [f.from, f.to]); }
  function filterEvents(opts, f) {
    opts = opts || {}; f = f || state.filters;
    const today = Core.todayStr();
    const tokens = Core.queryTokens(f.q);
    const range = opts.skipDate ? null : currentRange(f);
    let center = null;
    if (f.km > 0) center = f.center === '__me__' ? state.myLoc : Core.GTA_CITIES[f.center];
    return state.events.filter(ev => {
      if (f.region !== 'All GTA' && ev._region !== f.region) return false;
      if (tokens.length && !Core.matchesQuery(ev, tokens)) return false;
      if (f.cats.size && !ev.categories.some(c => f.cats.has(c))) return false;
      if (!Core.priceBandMatch(ev, f.price)) return false;
      if (range) { if (!Core.inWindow(ev, range[0], range[1], f.includeLong)) return false; }
      else if (!f.includeLong && ev._long && ev.startDate < today) return false;
      if (center) { const c = ev._coords; if (!c || Core.haversineKm(center.lat, center.lon, c.lat, c.lon) > f.km) return false; }
      return true;
    });
  }
  const hasBrowseFilters = () => { const f = state.filters; return !!(f.q.trim() || f.date !== 'any' || f.price !== 'all' || f.km > 0 || f.cats.size || f.includeLong); };
  const activeFilterCount = () => { const f = state.filters; return (f.region !== 'All GTA' ? 1 : 0) + (f.date !== 'any' ? 1 : 0) + (f.price !== 'all' ? 1 : 0) + (f.km > 0 ? 1 : 0) + f.cats.size + (f.includeLong ? 1 : 0); };

  /* ------------------------------------------------------------------ rendering: cards */
  const isFav = ev => !!(favs[ev.id] || (ev._key && Object.keys(favs).some(k => favs[k].key === ev._key)));

  function cardHtml(ev) {
    const w = whenParts(ev);
    const cats = (ev.categories || []).filter(c => c !== 'Free Events');
    const grp = GROUP[cats[0]] || '';
    const price = priceLabel(ev);
    const fav = isFav(ev);
    const url = safeUrl(ev.url);
    const g = Core.googleCalendarUrl(ev);
    const long = Core.isLongRunning(ev);
    const stubSpan = !w.same ? (long ? 'until ' : 'to ') + fmt(ev.endDate, { month: 'short', day: 'numeric' }) : '';
    const others = (ev.sources || []).length > 1 ? ' <span title="' + esc(ev.sources.slice(1).map(s => s.name).join(', ')) + '">+' + (ev.sources.length - 1) + ' more</span>' : '';
    const where = [ev.venue, ev.city].filter(Boolean).map(esc).join(' · ');
    const img = safeUrl(ev.image) ? '<div class="card-img"><img src="' + esc(ev.image) + '" alt="' + esc('Image for ' + ev.title + (ev.venue ? ' at ' + ev.venue : '')) + '" loading="lazy" decoding="async"></div>' : '';
    return '<article class="card ' + grp + '" aria-labelledby="t-' + ev.id + '">' + img +
      '<div class="stub" aria-hidden="true"><span class="w">' + fmt(ev.startDate, { weekday: 'short' }).toUpperCase() + '</span><span class="d">' + fmt(ev.startDate, { day: 'numeric' }) +
      '</span><span class="m">' + fmt(ev.startDate, { month: 'short' }) + '</span>' + (stubSpan ? '<span class="span">' + esc(stubSpan) + '</span>' : '') + '</div>' +
      '<div class="card-body">' +
      '<div class="tags">' + (ev.demo ? '<span class="tag tag-demo">DEMO DATA</span>' : '') + (price ? '<span class="tag ' + price.cls + '">' + esc(price.text) + '</span>' : '') + (long ? '<span class="tag tag-ongoing">Ongoing</span>' : '') + '</div>' +
      '<h3 id="t-' + ev.id + '"><button type="button" class="title-btn" data-action="open" data-id="' + ev.id + '">' + esc(ev.title) + '</button></h3>' +
      '<p class="when"><time datetime="' + ev.startDate + (ev.startTime ? 'T' + ev.startTime : '') + '">' + esc(w.date) + '</time>' + (w.time ? ' · ' + esc(w.time) : '') + '</p>' +
      (where ? '<p class="where">' + where + '</p>' : '') +
      '<p class="cats">' + cats.slice(0, 3).map(c => (ICON[c] || '') + ' ' + esc(c)).join(' • ') + '</p>' +
      '<p class="src">Source: <strong>' + esc(ev.source || 'Unknown') + '</strong>' + others + '</p>' +
      '<div class="actions">' +
      (url ? '<a class="btn btn-primary" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">View Event<span class="sr-only"> (opens the source’s page): ' + esc(ev.title) + '</span></a>'
        : '<span class="btn btn-outline" aria-disabled="true">' + (ev.demo ? 'Demo — no page' : 'No event page') + '</span>') +
      '<details class="cal-menu"><summary class="btn btn-outline" role="button">' + icon('cal') + 'Add to Calendar<span class="sr-only">: ' + esc(ev.title) + '</span></summary>' +
      '<div class="menu"><a href="' + esc(g) + '" target="_blank" rel="noopener noreferrer">' + icon('ext') + 'Google Calendar</a>' +
      '<button type="button" data-action="ics" data-id="' + ev.id + '">' + icon('dl') + 'Apple / Outlook (.ics)</button></div></details>' +
      '</div>' +
      '<div class="mini-actions">' +
      '<button type="button" class="mini" data-action="fav" data-id="' + ev.id + '" aria-pressed="' + fav + '" aria-label="' + (fav ? 'Remove from favorites: ' : 'Save to favorites: ') + esc(ev.title) + '">' + icon('star') + '<span>' + (fav ? 'Saved' : 'Save') + '</span></button>' +
      '<button type="button" class="mini" data-action="share" data-id="' + ev.id + '" aria-label="Share: ' + esc(ev.title) + '">' + icon('share') + '<span>Share</span></button>' +
      '<a class="mini" href="' + esc(Core.osmSearchUrl(ev)) + '" target="_blank" rel="noopener noreferrer" aria-label="View on map: ' + esc(ev.title) + '">' + icon('pin') + '<span>Map</span></a>' +
      '</div></div></article>';
  }

  function dayLabel(d, today) {
    const base = fmt(d, { weekday: 'long', month: 'long', day: 'numeric' });
    if (d === today) return 'Today · ' + base;
    if (d === Core.addDays(today, 1)) return 'Tomorrow · ' + base;
    return base;
  }

  function resultsHtml(list) {
    const range = currentRange();
    const today = Core.todayStr();
    const lo = range ? range[0] : today;
    const eff = ev => (ev.startDate < lo ? lo : ev.startDate);
    const sorted = list.slice().sort((a, b) => {
      const da = eff(a), db = eff(b);
      return (da < db ? -1 : da > db ? 1 : 0) || ((b.featured ? 1 : 0) - (a.featured ? 1 : 0)) ||
        ((a.startTime || '24:00') < (b.startTime || '24:00') ? -1 : (a.startTime || '24:00') > (b.startTime || '24:00') ? 1 : 0) || (a.title < b.title ? -1 : 1);
    });
    const counts = {}; sorted.forEach(e => { const d = eff(e); counts[d] = (counts[d] || 0) + 1; });
    let html = '', shown = 0, cur = null, open = false;
    for (const ev of sorted) {
      if (shown >= state.shown) break;
      const d = eff(ev);
      if (d !== cur) {
        if (open) html += '</div></section>';
        const dow = Core.dayOfWeek(d);
        html += '<section class="day-group" aria-label="' + esc(dayLabel(d, today)) + '"><h3 class="day-heading' + (dow === 0 || dow === 6 ? ' weekend' : '') + '">' + esc(dayLabel(d, today)) +
          '<span class="n">' + counts[d] + (counts[d] === 1 ? ' event' : ' events') + '</span></h3><div class="grid">';
        open = true; cur = d;
      }
      html += cardHtml(ev); shown++;
    }
    if (open) html += '</div></section>';
    return { html, total: sorted.length, shown };
  }

  function shelvesHtml() {
    let html = '';
    COLLECTIONS.forEach(col => {
      const f = Object.assign(defaultFilters(), { region: state.filters.region }, col.set, { cats: new Set(col.set.cats || []) });
      const list = filterEvents({}, f);
      if (!list.length) return;
      html += '<section class="shelf" aria-labelledby="sh-' + col.id + '"><div class="shelf-head"><h2 id="sh-' + col.id + '">' + col.icon + ' ' + esc(col.title) + '<span class="n">' + list.length + '</span></h2>' +
        '<button type="button" class="btn btn-ghost" data-action="collection" data-id="' + col.id + '">See all ' + list.length + '<span class="sr-only"> in ' + esc(col.title) + '</span></button></div>' +
        '<div class="shelf-scroll">' + Core.sortEvents(list.slice()).slice(0, 8).map(cardHtml).join('') + '</div></section>';
    });
    return html;
  }

  /* ------------------------------------------------------------------ rendering: page */
  function renderAll() { renderStatus(); render(); if (state.view === 'mine') renderMine(); if (state.view === 'sources') renderSources(); updateMineCount(); }

  function render() {
    syncControls(); renderRail(); renderActiveChips();
    const list = filterEvents();
    state.filtered = list;
    const browsing = !hasBrowseFilters();
    $('#highlights').innerHTML = browsing ? shelvesHtml() : '';
    $('#all-heading').hidden = !browsing || !list.length;
    const r = resultsHtml(list);
    const box = $('#results');
    if (!list.length) {
      box.innerHTML = '<div class="empty"><h3>No events match these filters</h3><p>' + (state.filters.q ? 'Try fewer or different search words, or ' : 'Try ') +
        'a wider date range, another location or fewer categories.</p><button type="button" class="btn btn-primary" data-action="clear">Clear all filters</button></div>';
    } else box.innerHTML = r.html;
    const more = $('#btn-more');
    more.hidden = r.shown >= r.total;
    more.textContent = 'Show more events (' + (r.total - r.shown) + ' left)';
    $('#result-summary').textContent = list.length + (list.length === 1 ? ' event' : ' events') + (hasBrowseFilters() || state.filters.region !== 'All GTA' ? ' match your filters' : ' coming up') + (state.usingDemo ? ' (demo data)' : '');
    $('#demo-banner').hidden = !state.usingDemo;
  }

  function syncControls() {
    const f = state.filters;
    if ($('#q') !== document.activeElement) $('#q').value = f.q;
    $('#f-region').value = f.region; $('#f-date').value = f.date; $('#f-price').value = f.price;
    $('#f-km').value = String(f.km); $('#f-center').value = f.center; $('#f-long').checked = f.includeLong;
    $('#custom-dates').hidden = f.date !== 'custom'; $('#f-from').value = f.from; $('#f-to').value = f.to;
    $$('#f-cats input').forEach(i => { i.checked = f.cats.has(i.value); });
    $$('.quick .chip').forEach(b => b.setAttribute('aria-pressed', String(f.date === b.dataset.date)));
    const n = activeFilterCount(); const pill = $('#filter-count');
    pill.hidden = !n; pill.textContent = n;
  }

  function renderRail() {
    const today = Core.todayStr(), f = state.filters;
    const counts = new Array(RAIL_DAYS).fill(0);
    filterEvents({ skipDate: true }).forEach(ev => {
      const s = Math.max(0, Core.daysBetween(today, ev.startDate)), e = Core.daysBetween(today, ev.endDate || ev.startDate);
      if (e < 0) return;
      if (ev._long && !f.includeLong) { if (ev.startDate >= today && s < RAIL_DAYS) counts[s]++; return; }
      for (let i = s; i <= Math.min(e, RAIL_DAYS - 1); i++) counts[i]++;
    });
    const range = currentRange();
    let html = '';
    for (let i = 0; i < RAIL_DAYS; i++) {
      const d = Core.addDays(today, i), dow = Core.dayOfWeek(d);
      const inR = range && d >= range[0] && d <= range[1];
      const single = range && range[0] === range[1] && inR;
      html += '<button type="button" class="day' + (dow === 0 || dow === 6 ? ' is-weekend' : '') + (i === 0 ? ' is-today' : '') + (single ? ' is-selected' : (inR ? ' in-range' : '')) + (counts[i] ? '' : ' is-empty') +
        '" data-action="day" data-date="' + d + '" aria-pressed="' + !!single + '" aria-label="' + esc(fmt(d, { weekday: 'long', month: 'long', day: 'numeric' }) + ', ' + counts[i] + (counts[i] === 1 ? ' event' : ' events')) + '">' +
        '<span class="dw">' + (i === 0 ? 'Today' : fmt(d, { weekday: 'short' })) + '</span><span class="dn">' + fmt(d, { day: 'numeric' }) + '</span><span class="dc"><b>' + counts[i] + '</b></span></button>';
    }
    $('#dayrail').innerHTML = html;
  }

  function renderActiveChips() {
    const f = state.filters, chips = [];
    if (f.region !== 'All GTA') chips.push(['region', 'Location: ' + f.region]);
    if (f.date !== 'any') chips.push(['date', f.date === 'custom' ? 'Dates: ' + [f.from, f.to].filter(Boolean).join(' to ') : DATE_LABELS[f.date]]);
    if (f.price !== 'all') chips.push(['price', 'Price: ' + PRICE_LABELS[f.price]]);
    if (f.km > 0) chips.push(['km', 'Within ' + f.km + ' km of ' + (f.center === '__me__' ? 'my location' : f.center)]);
    f.cats.forEach(c => chips.push(['cat:' + c, c]));
    if (f.includeLong) chips.push(['long', 'Including long-running']);
    $('#active-chips').innerHTML = chips.map(([k, label]) => '<button type="button" data-action="unfilter" data-key="' + esc(k) + '">' + esc(label) + icon('close') + '<span class="sr-only"> — remove filter</span></button>').join('');
  }

  function renderStatus() {
    const s = summary(), fr = Core.freshness(s.lastUpdated);
    const el = $('#status-strip');
    if (state.usingDemo) {
      el.innerHTML = '<span class="fresh">DEMO DATA</span><span>' + state.events.length + ' fictional sample events</span><span>' + (s.total ? s.okN + '/' + s.total + ' live sources reporting' : 'No live sources yet') + '</span>' +
        '<button type="button" class="linklike" data-view-link="sources">Status</button>';
      return;
    }
    const next = Core.nextRefresh(s.lastUpdated, CONFIG.REFRESH_EVERY_DAYS);
    el.innerHTML = '<span class="fresh">' + fr.emoji + ' ' + esc(fr.label) + '</span><span>' + state.events.length + ' events</span><span>' + s.okN + '/' + s.total + ' sources updated' + (s.failN ? ' (' + s.failN + ' failed)' : '') + '</span>' +
      (next ? '<span>Next refresh: ' + (next > new Date() ? esc(fmtInstantDate(next.toISOString())) : 'when you next open the site') + '</span>' : '') +
      '<button type="button" class="linklike" data-view-link="sources">Details</button>';
  }

  /* ------------------------------------------------------------------ My Events */
  function resolveFav(f) { return state.byKey.get(f.key) || state.byId.get(f.snap.id) || f.snap; }
  function mineLists() {
    const today = Core.todayStr();
    const all = Object.keys(favs).map(id => resolveFav(favs[id]));
    const up = all.filter(e => (e.endDate || e.startDate) >= today), past = all.filter(e => (e.endDate || e.startDate) < today);
    return { up: Core.sortEvents(up), past: Core.sortEvents(past).reverse() };
  }
  function updateMineCount() { const n = mineLists().up.length; const p = $('#mine-count'); p.hidden = !n; p.textContent = n; }
  function renderMine() {
    const { up, past } = mineLists();
    $('#btn-ics-all').hidden = !up.length;
    let html = '';
    if (!up.length && !past.length) html = '<div class="empty"><h3>Nothing saved yet</h3><p>Tap “Save” on any event to keep it here. Your list stays on this device.</p><button type="button" class="btn btn-primary" data-view-link="discover">Find events</button></div>';
    else {
      html += '<h3 class="mine-grid-title">Coming up <span class="muted">(' + up.length + ')</span></h3>';
      html += up.length ? '<div class="grid">' + up.map(cardHtml).join('') + '</div>' : '<p class="muted">No upcoming saved events.</p>';
      if (past.length) html += '<h3 class="mine-grid-title">Past <span class="muted">(' + past.length + ')</span></h3><ul class="past-list">' + past.map(e => '<li><span>' + esc(e.title) + ' <span class="muted">— ' + esc(fmt(e.startDate, { month: 'short', day: 'numeric', year: 'numeric' })) + '</span></span><button type="button" class="btn btn-ghost" data-action="fav" data-id="' + e.id + '">Remove</button></li>').join('') + '</ul>';
    }
    $('#mine-body').innerHTML = html;
  }

  /* ------------------------------------------------------------------ Sources view */
  const URL_STATUS = { observed: 'Feed link seen on the source’s site', 'standard-pattern': 'Standard plugin URL (not individually confirmed)', none: 'No feed known', 'user-supplied': 'Added by you' };
  function renderSources() {
    const s = summary(), fr = Core.freshness(s.lastUpdated);
    const next = Core.nextRefresh(s.lastUpdated, CONFIG.REFRESH_EVERY_DAYS);
    const feeds = s.st.filter(x => ['ok', 'failed', 'pending'].indexOf(x.state) !== -1);
    const manual = s.st.filter(x => x.state === 'manual');
    const count = src => state.events.filter(e => (e.sources || []).some(x => x.name === src.name)).length;
    const li = x => {
      const ic = x.state === 'ok' ? '<span class="st-icon st-ok" aria-hidden="true">✓</span>' : x.state === 'failed' ? '<span class="st-icon st-fail" aria-hidden="true">⚠</span>' : '<span class="st-icon st-wait" aria-hidden="true">…</span>';
      const label = x.state === 'ok' ? 'Updated' : x.state === 'failed' ? 'Failed' : 'Not fetched yet';
      return '<li>' + ic + '<div><p class="src-name"><span class="sr-only">' + label + ': </span>' + esc(x.src.name) + ' <span class="badge">' + esc(x.src.city) + '</span><span class="badge">' + esc(SOURCE_KIND_LABELS[x.src.kind] || x.src.kind) + '</span></p>' +
        '<p class="src-meta">' + label + (x.lastOk ? ' · last success ' + esc(fmtInstant(x.lastOk)) + (x.via ? ' (' + esc(x.via) + ')' : '') : '') + ' · ' + count(x.src) + ' events · ' + esc(x.src.type) + ' · ' + esc(URL_STATUS[x.src.urlStatus] || '') + '</p>' +
        (x.state === 'failed' || (x.state === 'ok' && x.error) ? '<p class="src-warn">' + (x.state === 'failed' ? '⚠ ' : 'Latest attempt in this browser: ') + esc(x.error || 'No recent successful update') + (x.kept ? ' Showing the last saved events.' : '') + '</p>' : '') +
        (x.src.notes ? '<p class="src-meta">' + esc(x.src.notes) + '</p>' : '') +
        '<p class="src-meta">' + (safeUrl(x.src.homepage) ? '<a href="' + esc(x.src.homepage) + '" target="_blank" rel="noopener noreferrer">Official site</a>' : '') +
        (x.src.custom ? ' <button type="button" class="linklike" data-action="rm-custom" data-id="' + esc(x.src.id) + '">Remove this feed</button>' : '') + '</p></div></li>';
    };
    const mli = x => '<li><span class="st-icon st-wait" aria-hidden="true">○</span><div><p class="src-name">' + esc(x.src.name) + ' <span class="badge">' + esc(x.src.city) + '</span><span class="badge">' + esc(SOURCE_KIND_LABELS[x.src.kind] || '') + '</span></p><p class="src-meta">' +
      esc(x.src.notes || '') + (safeUrl(x.src.homepage) ? ' <a href="' + esc(x.src.homepage) + '" target="_blank" rel="noopener noreferrer">Official site</a>' : '') + '</p></div></li>';
    $('#sources-body').innerHTML =
      '<div class="panel"><h3>Data status</h3><dl class="stats">' +
      '<div><dt>Last updated</dt><dd>' + (s.lastUpdated ? esc(fmtInstantDate(s.lastUpdated)) : (state.usingDemo ? 'Demo data only' : 'Never')) + '</dd></div>' +
      '<div><dt>Freshness</dt><dd>' + fr.emoji + ' ' + esc(fr.label) + '</dd></div>' +
      '<div><dt>Events found</dt><dd>' + state.events.length + (state.usingDemo ? ' (demo)' : '') + '</dd></div>' +
      '<div><dt>Sources updated</dt><dd>' + s.okN + '/' + s.total + '</dd></div>' +
      '<div><dt>Sources failed</dt><dd>' + s.failN + '</dd></div>' +
      '<div><dt>Next automatic refresh</dt><dd>' + (next ? (next > new Date() ? esc(fmtInstantDate(next.toISOString())) : 'When you next open the site') : 'After the first update') + '</dd></div>' +
      '<div><dt>Last check in this browser</dt><dd>' + (cache.lastRun ? esc(fmtInstant(cache.lastRun)) : '—') + '</dd></div></dl>' +
      '<p class="hint" style="margin-top:12px">A web page cannot run while it is closed. Refreshes happen when you open the site (if data is over 7 days old) or press “Refresh Events”. On the hosted version, a free weekly GitHub Actions job also rebuilds <code>events.json</code> every Monday, even when nobody is online.</p>' +
      '<p style="margin-top:12px"><button type="button" class="btn btn-outline" data-action="refresh-now">' + icon('refresh') + '<span>Refresh Events</span></button> <button type="button" class="btn btn-ghost" data-action="clear-cache">Clear saved event data</button></p></div>' +
      '<div class="panel"><h3>Live feeds</h3>' + (feeds.length ? '<ul class="src-list">' + feeds.map(li).join('') + '</ul>' : '<p class="muted">No live feeds are enabled. Edit sources.js.</p>') +
      '<p class="hint">Browsers block many cross-site feed requests (CORS). That is why the weekly server job is the main update path; a failed direct attempt here is normal and never deletes saved events.</p></div>' +
      '<div class="panel"><details class="fold"><summary>Sources that still need a feed (' + manual.length + ')</summary><p class="hint">Real organisations with no public feed confirmed. Nothing is fetched from them. Add their events by hand in <code>manual-events.json</code>, or enable a feed in <code>sources.js</code> once you find one.</p><ul class="src-list">' + manual.map(mli).join('') + '</ul></details></div>' +
      '<div class="panel"><h3>Add your own feed</h3><p class="hint">Paste a public iCalendar (.ics), schema.org JSON-LD, RSS-with-dates or The Events Calendar REST URL. Saved in this browser only; it works when the site allows browser access. For the weekly server update, add it to <code>sources.js</code> instead.</p>' +
      '<div class="form-grid"><div><label for="cs-name">Name</label><input id="cs-name" placeholder="Milton Farmers Market"></div>' +
      '<div><label for="cs-city">Default city</label><select id="cs-city">' + Object.keys(Core.GTA_CITIES).map(c => '<option>' + esc(c) + '</option>').join('') + '</select></div>' +
      '<div><label for="cs-type">Feed type</label><select id="cs-type"><option value="ics">iCalendar (.ics)</option><option value="tribe">The Events Calendar REST API</option><option value="jsonld">schema.org JSON-LD</option><option value="rss">RSS / Atom with event dates</option></select></div>' +
      '<div><label for="cs-url">Feed URL (https://…)</label><input id="cs-url" type="url" inputmode="url" placeholder="https://example.org/calendar.ics"></div></div>' +
      '<p style="margin-top:12px"><button type="button" class="btn btn-primary" data-action="add-custom">Add feed</button></p></div>';
  }

  /* ------------------------------------------------------------------ dialog */
  function dialogHtml(ev) {
    const w = whenParts(ev), price = priceLabel(ev), url = safeUrl(ev.url), reg = safeUrl(ev.registrationUrl), fav = isFav(ev);
    const na = '<span class="na">Not provided</span>';
    const cats = (ev.categories || []).map(c => (ICON[c] || '') + ' ' + esc(c)).join(' • ');
    const addr = [ev.address, ev.postalCode].filter(Boolean).join(', ');
    const srcs = (ev.sources && ev.sources.length ? ev.sources : [{ name: ev.source, kind: ev.sourceKind }]).map(s => esc(s.name) + (s.kind && SOURCE_KIND_LABELS[s.kind] ? ' <span class="badge">' + esc(SOURCE_KIND_LABELS[s.kind]) + '</span>' : '')).join('<br>');
    return '<div class="dlg-head"><div>' + (ev.demo ? '<span class="tag tag-demo">DEMO DATA</span> ' : '') + '<h2 id="dlg-title">' + esc(ev.title) + '</h2></div>' +
      '<button type="button" class="icon-btn" data-action="dlg-close" aria-label="Close event details">' + icon('close') + '</button></div>' +
      '<div class="dlg-content">' + (safeUrl(ev.image) ? '<img src="' + esc(ev.image) + '" alt="' + esc('Image for ' + ev.title) + '" style="border-radius:10px;max-height:260px;object-fit:cover;width:100%">' : '') +
      '<dl><div><dt>Date</dt><dd>' + esc(w.date) + '</dd></div><div><dt>Time</dt><dd>' + (w.time ? esc(w.time) : na) + '</dd></div>' +
      '<div><dt>Venue</dt><dd>' + (ev.venue ? esc(ev.venue) : na) + '</dd></div><div><dt>City</dt><dd>' + (ev.city ? esc(ev.city) : na) + '</dd></div>' +
      '<div><dt>Address and postal code</dt><dd>' + (addr ? esc(addr) : na) + '</dd></div><div><dt>Categories</dt><dd>' + cats + '</dd></div>' +
      '<div><dt>Ticket price</dt><dd>' + (price ? esc(price.text === 'FREE' ? 'Free' : price.text) : na) + '</dd></div><div><dt>Organizer</dt><dd>' + (ev.organizer ? esc(ev.organizer) : na) + '</dd></div>' +
      '<div><dt>Official event page</dt><dd>' + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(url.replace(/^https?:\/\//, '').slice(0, 60)) + '</a>' : na) + '</dd></div>' +
      '<div><dt>Registration</dt><dd>' + (reg ? '<a href="' + esc(reg) + '" target="_blank" rel="noopener noreferrer">Register / tickets</a>' : na) + '</dd></div>' +
      '<div><dt>Source</dt><dd>' + srcs + '</dd></div><div><dt>Data last updated</dt><dd>' + (ev.updated ? esc(fmtInstantDate(ev.updated)) : na) + '</dd></div></dl>' +
      (ev.description ? '<div><h3 style="font-size:1rem;margin-bottom:4px">Description</h3><p class="desc">' + esc(ev.description) + '</p></div>' : '<p class="muted">Description: <span class="na">Not provided</span></p>') +
      '<div class="dlg-actions">' + (url ? '<a class="btn btn-primary" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">View Event</a>' : '') +
      '<a class="btn btn-outline" href="' + esc(Core.googleCalendarUrl(ev)) + '" target="_blank" rel="noopener noreferrer">Google Calendar</a>' +
      '<button type="button" class="btn btn-outline" data-action="ics" data-id="' + ev.id + '">Download .ics</button>' +
      '<button type="button" class="btn btn-outline" data-action="fav" data-id="' + ev.id + '" aria-pressed="' + fav + '">' + (fav ? '★ Saved' : '☆ Save') + '</button>' +
      '<button type="button" class="btn btn-outline" data-action="share" data-id="' + ev.id + '">Share</button>' +
      '<a class="btn btn-outline" href="' + esc(Core.osmSearchUrl(ev)) + '" target="_blank" rel="noopener noreferrer">View on Map</a></div>' +
      '<p class="notice">' + (ev.demo ? 'This is a fictional sample event.' : 'Details are supplied by the source listed above and may change or be cancelled. Confirm on the official page before you go.') + '</p></div>';
  }
  function findEvent(id) {
    if (state.byId.has(id)) return state.byId.get(id);
    const f = favs[id]; return f ? f.snap : null;
  }
  function openEvent(id, fromHash) {
    const ev = findEvent(id); if (!ev) { toast('That event is no longer in the list.'); return; }
    const d = $('#event-dialog');
    $('#dlg-body').innerHTML = dialogHtml(ev);
    if (!d.open) d.showModal();
    if (!fromHash) history.replaceState(null, '', '#e=' + id);
  }

  /* ------------------------------------------------------------------ actions */
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 4200);
  }
  function downloadICS(events, name) {
    const blob = new Blob([Core.buildICS(events, 'GTA Events Hub')], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (_) {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (_) { /* ignore */ } ta.remove(); return ok;
    }
  }
  async function shareEvent(ev) {
    const w = whenParts(ev);
    const url = safeUrl(ev.url) || (location.href.split('#')[0] + '#e=' + ev.id);
    const data = { title: ev.title, text: ev.title + ' — ' + w.date + (w.time ? ', ' + w.time : '') + (ev.city ? ' · ' + ev.city : ''), url };
    if (navigator.share) { try { await navigator.share(data); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    toast((await copyText(url)) ? 'Event link copied' : 'Could not copy — long-press the link instead');
  }
  function toggleFav(id) {
    const ev = findEvent(id); if (!ev) return;
    const key = ev._key || Core.duplicateKey(ev);
    const existing = Object.keys(favs).filter(k => k === id || favs[k].key === key);
    if (existing.length) { existing.forEach(k => delete favs[k]); toast('Removed from favorites'); }
    else { favs[id] = { snap: stripInternal(ev), key, added: new Date().toISOString() }; toast('Saved to My Events'); }
    LS.set('gta.favs', favs);
    updateMineCount();
    if (state.view === 'mine') renderMine(); else render();
    if ($('#event-dialog').open) { const cur = findEvent(id); if (cur) $('#dlg-body').innerHTML = dialogHtml(cur); }
  }
  function savePrefs() { LS.set('gta.prefs', Object.assign(LS.get('gta.prefs', {}), { region: state.filters.region, center: state.filters.center })); }
  function setFilters(patch) { Object.assign(state.filters, patch); state.shown = PAGE_SIZE; render(); }
  function applyPreset(set) {
    const keep = { region: state.filters.region, center: state.filters.center };
    state.filters = Object.assign(defaultFilters(), keep, set, { cats: new Set(set.cats || []) });
    state.shown = PAGE_SIZE; render();
    const r = $('#results'); r.scrollIntoView({ block: 'start' }); r.focus({ preventScroll: true });
  }
  function clearAll() {
    const keep = state.filters.region;
    state.filters = Object.assign(defaultFilters(), { region: 'All GTA', center: state.filters.center });
    state.shown = PAGE_SIZE; render();
  }

  function showView(v) {
    state.view = v;
    ['discover', 'mine', 'sources'].forEach(n => { $('#view-' + n).hidden = n !== v; });
    $$('.tabs button').forEach(b => { if (b.dataset.view === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    if (v === 'mine') renderMine(); if (v === 'sources') renderSources();
    if (location.hash.indexOf('#e=') !== 0) history.replaceState(null, '', v === 'discover' ? location.pathname + location.search : '#' + v);
    window.scrollTo(0, 0);
  }

  function addCustomSource() {
    const name = $('#cs-name').value.trim(), url = $('#cs-url').value.trim();
    if (!name || !Core.isHttpUrl(url)) { toast('Enter a name and a full https:// feed URL.'); return; }
    const list = LS.get('gta.custom', []);
    list.push({ id: 'custom-' + Core.fnv1a(name + url), name, city: $('#cs-city').value, type: $('#cs-type').value, url });
    LS.set('gta.custom', list);
    toast('Feed added. Press Refresh Events to fetch it.');
    renderSources();
  }

  /* ------------------------------------------------------------------ theme */
  function applyTheme(t) {
    if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
    const dark = (t || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
    const b = $('#btn-theme');
    b.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    b.innerHTML = icon(dark ? 'sun' : 'moon');
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', dark ? '#0a141f' : '#12263a');
  }

  /* ------------------------------------------------------------------ wiring */
  function buildStaticUI() {
    $('#f-region').innerHTML = Core.REGION_FILTERS.map(r => '<option>' + esc(r) + '</option>').join('');
    $('#f-center').innerHTML = '<option value="__me__">My location…</option>' + CENTERS.map(c => '<option>' + esc(c) + '</option>').join('');
    const cats = Core.CATEGORIES.filter(c => c !== 'Other').concat('Other');
    $('#f-cats').innerHTML = cats.map(c => '<label><input type="checkbox" value="' + esc(c) + '">' + (ICON[c] || '') + ' ' + esc(c) + '</label>').join('');
  }

  function wire() {
    let t;
    $('#q').addEventListener('input', e => { clearTimeout(t); const v = e.target.value; t = setTimeout(() => setFilters({ q: v }), 200); });
    $('#f-region').addEventListener('change', e => { setFilters({ region: e.target.value }); savePrefs(); });
    $('#f-date').addEventListener('change', e => setFilters({ date: e.target.value }));
    $('#f-from').addEventListener('change', e => setFilters({ from: e.target.value }));
    $('#f-to').addEventListener('change', e => setFilters({ to: e.target.value }));
    $('#f-price').addEventListener('change', e => setFilters({ price: e.target.value }));
    $('#f-km').addEventListener('change', e => setFilters({ km: +e.target.value }));
    $('#f-long').addEventListener('change', e => setFilters({ includeLong: e.target.checked }));
    $('#f-center').addEventListener('change', e => {
      const v = e.target.value;
      if (v !== '__me__') { setFilters({ center: v }); savePrefs(); return; }
      if (!navigator.geolocation) { toast('Location is not available on this device. Pick a city instead.'); setFilters({ center: 'Mississauga' }); return; }
      navigator.geolocation.getCurrentPosition(p => { state.myLoc = { lat: p.coords.latitude, lon: p.coords.longitude }; setFilters({ center: '__me__' }); },
        () => { toast('Location not shared — pick a city instead.'); setFilters({ center: 'Mississauga' }); }, { maximumAge: 600000, timeout: 10000 });
    });
    $('#f-cats').addEventListener('change', e => {
      const s = new Set(state.filters.cats); if (e.target.checked) s.add(e.target.value); else s.delete(e.target.value); setFilters({ cats: s });
    });
    $('#btn-filters').addEventListener('click', e => {
      const p = $('#filters'), open = p.hidden; p.hidden = !open; e.currentTarget.setAttribute('aria-expanded', String(open));
    });
    $('#btn-clear').addEventListener('click', clearAll);
    $('#btn-more').addEventListener('click', () => { state.shown += PAGE_SIZE; render(); });
    $('#btn-refresh').addEventListener('click', () => refresh({ manual: true }));
    $('#btn-ics-all').addEventListener('click', () => { const { up } = mineLists(); if (up.length) downloadICS(up, 'my-gta-events.ics'); });
    $('#btn-theme').addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = cur === 'dark' ? 'light' : 'dark'; LS.set('gta.theme', next); applyTheme(next);
    });
    $$('.tabs button').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
    $$('.quick .chip').forEach(b => b.addEventListener('click', () => setFilters({ date: state.filters.date === b.dataset.date ? 'any' : b.dataset.date })));

    document.addEventListener('click', e => {
      const openMenus = $$('.cal-menu[open]');
      openMenus.forEach(m => { if (!m.contains(e.target)) m.removeAttribute('open'); });
      const vl = e.target.closest('[data-view-link]'); if (vl) { showView(vl.dataset.viewLink); return; }
      const a = e.target.closest('[data-action]'); if (!a) return;
      const id = a.dataset.id, act = a.dataset.action;
      if (act === 'open') openEvent(id);
      else if (act === 'fav') toggleFav(id);
      else if (act === 'share') { const ev = findEvent(id); if (ev) shareEvent(ev); }
      else if (act === 'ics') { const ev = findEvent(id); if (ev) { downloadICS([ev], 'event-' + ev.startDate + '.ics'); const m = a.closest('.cal-menu'); if (m) m.removeAttribute('open'); } }
      else if (act === 'collection') { const c = COLLECTIONS.find(x => x.id === id); if (c) applyPreset(c.set); }
      else if (act === 'clear') clearAll();
      else if (act === 'day') {
        const d = a.dataset.date, r = currentRange();
        if (r && r[0] === d && r[1] === d) setFilters({ date: 'any', from: '', to: '' }); else setFilters({ date: 'custom', from: d, to: d });
      } else if (act === 'unfilter') {
        const k = a.dataset.key, f = state.filters;
        if (k === 'region') { f.region = 'All GTA'; savePrefs(); } else if (k === 'date') { f.date = 'any'; f.from = f.to = ''; } else if (k === 'price') f.price = 'all';
        else if (k === 'km') f.km = 0; else if (k === 'long') f.includeLong = false; else if (k.indexOf('cat:') === 0) { const s = new Set(f.cats); s.delete(k.slice(4)); f.cats = s; }
        state.shown = PAGE_SIZE; render();
      } else if (act === 'dlg-close') $('#event-dialog').close();
      else if (act === 'refresh-now') refresh({ manual: true });
      else if (act === 'clear-cache') { if (confirm('Clear saved event data on this device? Your favorites are kept.')) { cache = newCache(); idb.del('cache').then(() => { assemble(); renderAll(); toast('Saved event data cleared.'); refresh({ manual: false }); }); } }
      else if (act === 'add-custom') addCustomSource();
      else if (act === 'rm-custom') { LS.set('gta.custom', LS.get('gta.custom', []).filter(c => c.id !== id)); delete cache.bySource[id]; idb.set('cache', cache); assemble(); renderAll(); }
    });
    document.addEventListener('toggle', e => {
      if (e.target.classList && e.target.classList.contains('cal-menu') && e.target.open) $$('.cal-menu[open]').forEach(m => { if (m !== e.target) m.removeAttribute('open'); });
    }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') $$('.cal-menu[open]').forEach(m => { m.removeAttribute('open'); }); });
    document.addEventListener('error', e => {
      const t = e.target; if (t && t.tagName === 'IMG') { const box = t.closest('.card-img'); if (box) box.remove(); else t.remove(); }
    }, true);
    $('#event-dialog').addEventListener('close', () => { if (location.hash.indexOf('#e=') === 0) history.replaceState(null, '', state.view === 'discover' ? location.pathname + location.search : '#' + state.view); });
    $('#event-dialog').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
    window.addEventListener('hashchange', route);
    window.addEventListener('offline', () => toast('You are offline — showing saved events.'));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || state.busy) return;
      const fr = Core.freshness(summary().lastUpdated); if (fr.days === null || fr.days > CONFIG.REFRESH_EVERY_DAYS) refresh({ manual: false });
    });
  }

  function route() {
    const h = location.hash;
    if (h.indexOf('#e=') === 0) openEvent(h.slice(3), true);
    else if (h === '#mine') showView('mine');
    else if (h === '#sources') showView('sources');
  }

  async function init() {
    applyTheme(LS.get('gta.theme', null));
    buildStaticUI(); wire();
    const saved = await idb.get('cache');
    if (saved && saved.v === 1) cache = Object.assign(newCache(), saved);
    assemble(); renderAll(); route();
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('service-worker.js').catch(() => { });
    refresh({ manual: false });      // opening the site checks for new data; feeds older than 7 days are re-fetched
  }

  window.GTAApp = { state, render, filterEvents, assemble, refresh, sourceStatuses, summary };
  init();
})();
