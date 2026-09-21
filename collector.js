/*!
 * GTA Events Hub — collector.js
 * Fetches ONE configured source and returns normalised events. Works in the browser and in Node 18+.
 * The caller supplies `fetch`, so the browser can add a CORS proxy and Node can add a User-Agent.
 * No AI, no scraping of HTML pages: only feeds the source itself publishes (Tribe REST, ICS, RSS, JSON-LD, JSON).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.GTACollector = factory(root.GTACore);
})(typeof self !== 'undefined' ? self : this, function (Core) {
  'use strict';

  class FeedError extends Error {
    constructor(kind, message) { super(message); this.kind = kind; }
  }

  async function getText(url, ctx, accept) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), ctx.timeoutMs || 20000) : null;
    let res;
    try {
      res = await ctx.fetch(ctx.wrapUrl ? ctx.wrapUrl(url) : url, { signal: ctl && ctl.signal, headers: accept ? { Accept: accept } : undefined, redirect: 'follow' });
    } catch (e) {
      if (e && e.name === 'AbortError') throw new FeedError('timeout', 'Timed out');
      if (e && e.name === 'RobotsError') throw new FeedError('robots', e.message);
      throw new FeedError('network', ctx.isBrowser
        ? 'The browser could not read this feed (most likely blocked by CORS, or you are offline). The weekly server update reads it without this limit.'
        : 'Network error: ' + (e && (e.cause && e.cause.code || e.message)));
    } finally { if (timer) clearTimeout(timer); }
    if (!res.ok) throw new FeedError('http', 'HTTP ' + res.status);
    return res.text();
  }

  function addQuery(url, params) {
    const u = new URL(url);
    Object.keys(params).forEach(k => { if (!u.searchParams.has(k)) u.searchParams.set(k, params[k]); });
    return u.toString();
  }

  async function fetchRaw(feed, source, ctx) {
    const type = feed.type;
    if (type === 'tribe') {
      let url = addQuery(feed.url, { per_page: '50', start_date: ctx.today, end_date: ctx.horizonEnd });
      const all = [];
      for (let page = 0; page < 10 && url; page++) {
        const text = await getText(url, ctx, 'application/json');
        let json;
        try { json = JSON.parse(text); } catch (_) { throw new FeedError('parse', 'Response was not JSON'); }
        if (!json || !Array.isArray(json.events)) throw new FeedError('parse', 'Not a Tribe Events API response');
        all.push.apply(all, Core.parseTribe(json));
        url = json.next_rest_url || null;
      }
      return all;
    }
    const text = await getText(feed.url, ctx, type === 'ics' ? 'text/calendar, text/plain, */*' : undefined);
    if (type === 'ics') {
      if (text.indexOf('BEGIN:VCALENDAR') === -1) throw new FeedError('parse', 'Not an iCalendar file');
      return Core.parseICS(text, { horizonEnd: ctx.horizonEnd });
    }
    if (type === 'rss') {
      if (!/<(rss|feed|rdf)/i.test(text)) throw new FeedError('parse', 'Not an RSS/Atom feed');
      return Core.parseRSS(text, source.rss || {});
    }
    if (type === 'jsonld' || type === 'json') {
      let json;
      try { json = JSON.parse(text); } catch (_) { throw new FeedError('parse', 'Response was not JSON'); }
      return type === 'jsonld' ? Core.parseJsonLd(json) : Core.parseMappedJson(json, source.map);
    }
    throw new FeedError('config', 'Unsupported source type: ' + type);
  }

  function finalize(raws, source, ctx) {
    const out = [];
    raws.forEach(r => {
      const ev = Core.normalizeEvent(r, source, ctx.nowIso);
      if (!ev) return;
      if ((ev.endDate || ev.startDate) < ctx.today) return;   // already over
      if (ev.startDate > ctx.horizonEnd) return;               // too far ahead
      out.push(ev);
    });
    return out;
  }

  /* Try the primary feed, then the fallback feed. Returns { events, via } or throws FeedError. */
  async function collectSource(source, ctx) {
    const attempts = [{ type: source.type, url: source.url }];
    if (source.fallback && source.fallback.url) attempts.push(source.fallback);
    let lastErr = null;
    for (const feed of attempts) {
      try {
        const raws = await fetchRaw(feed, source, ctx);
        return { events: finalize(raws, source, ctx), via: feed.type, feedUrl: feed.url, note: lastErr ? 'Primary feed failed (' + lastErr.message + '); used fallback.' : '' };
      } catch (e) {
        lastErr = e instanceof FeedError ? e : new FeedError('error', e && e.message || String(e));
      }
    }
    throw lastErr;
  }

  /* manual-events.json: [{ title, startDate, startTime, endDate, endTime, venue, address, city, url, description, categories, priceText, organizer, sourceName }] */
  function collectManual(list, ctx) {
    const src = { id: 'manual', name: 'Added manually', kind: 'manual', priority: 4, official: false };
    const out = [];
    (Array.isArray(list) ? list : []).forEach(item => {
      if (!item || !item.title || !item.startDate) return;
      const s = Object.assign({}, src);
      if (item.sourceName) s.name = item.sourceName;
      const raw = Object.assign({}, item, { sourceCategories: item.categories || item.sourceCategories || [], uid: item.url || item.title });
      const ev = Core.normalizeEvent(raw, s, ctx.nowIso);
      if (!ev || (ev.endDate || ev.startDate) < ctx.today || ev.startDate > ctx.horizonEnd) return;
      out.push(ev);
    });
    return out;
  }

  function makeContext(options) {
    const now = options.now || new Date();
    const today = Core.todayStr(now);
    return Object.assign({
      now: now, nowIso: now.toISOString(), today: today,
      horizonEnd: Core.addDays(today, options.horizonDays || 180)
    }, options);
  }

  return { FeedError, collectSource, collectManual, makeContext };
});
