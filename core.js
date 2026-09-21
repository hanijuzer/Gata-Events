/*!
 * GTA Events Hub — core.js
 * Shared by the browser app (app.js) and the scheduled updater (scripts/update-events.js).
 * Plain deterministic JavaScript. No AI, no network calls, no dependencies.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GTACore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TZ = 'America/Toronto';

  /* ------------------------------------------------------------------ */
  /* Canonical categories (the list from the project brief)              */
  /* ------------------------------------------------------------------ */
  const CATEGORIES = [
    'Family & Kids', 'Free Events', 'Festivals', 'Cultural', 'Arts', 'Music', 'Concerts', 'Comedy',
    'Sports', 'Food & Drink', 'Farmers Markets', 'Community', 'Networking', 'Business', 'Career',
    'Education', 'Workshops', 'Technology', 'Health & Fitness', 'Nature & Outdoors', 'Parks',
    'Library', 'Museum', 'Theatre', 'Movies', 'Exhibitions', 'Religious/Cultural celebrations',
    'Holiday Events', 'Government/Community', 'Shopping', 'Other'
  ];

  /* Source-provided category text (normalised) -> canonical category. Explicit mapping rules. */
  const CATEGORY_MAP = {
    'festivals events': 'Festivals', 'festivals and events': 'Festivals', 'festival': 'Festivals', 'festivals': 'Festivals',
    'arts entertainment': 'Arts', 'arts and entertainment': 'Arts', 'arts culture': 'Arts', 'arts': 'Arts', 'art': 'Arts',
    'arts culture entertainment': 'Arts', 'entertainment': 'Arts',
    'sports recreation': 'Sports', 'sports and recreation': 'Sports', 'sports': 'Sports', 'sport': 'Sports', 'recreation': 'Health & Fitness',
    'gardens parks': 'Parks', 'gardens and parks': 'Parks', 'parks': 'Parks', 'parks recreation': 'Parks', 'outdoors': 'Nature & Outdoors', 'nature': 'Nature & Outdoors',
    'heritage': 'Cultural', 'culture': 'Cultural', 'cultural': 'Cultural', 'history': 'Cultural',
    'shop': 'Shopping', 'shopping': 'Shopping', 'markets': 'Farmers Markets', 'market': 'Farmers Markets', 'farmers market': 'Farmers Markets', 'farmers markets': 'Farmers Markets',
    'music': 'Music', 'live music': 'Music', 'concert': 'Concerts', 'concerts': 'Concerts',
    'comedy': 'Comedy', 'theatre': 'Theatre', 'theater': 'Theatre', 'film': 'Movies', 'movies': 'Movies', 'movie': 'Movies',
    'food drink': 'Food & Drink', 'food and drink': 'Food & Drink', 'food': 'Food & Drink', 'dining': 'Food & Drink', 'culinary': 'Food & Drink',
    'family': 'Family & Kids', 'family kids': 'Family & Kids', 'kids': 'Family & Kids', 'children': 'Family & Kids', 'family events': 'Family & Kids', 'kids family': 'Family & Kids',
    'community': 'Community', 'community events': 'Community',
    'business': 'Business', 'networking': 'Networking', 'career': 'Career', 'careers': 'Career', 'jobs': 'Career',
    'education': 'Education', 'workshop': 'Workshops', 'workshops': 'Workshops', 'classes': 'Workshops', 'technology': 'Technology', 'tech': 'Technology',
    'health': 'Health & Fitness', 'fitness': 'Health & Fitness', 'health wellness': 'Health & Fitness', 'wellness': 'Health & Fitness',
    'library': 'Library', 'libraries': 'Library', 'museum': 'Museum', 'museums': 'Museum', 'exhibition': 'Exhibitions', 'exhibitions': 'Exhibitions', 'exhibit': 'Exhibitions',
    'holiday': 'Holiday Events', 'holidays': 'Holiday Events', 'seasonal': 'Holiday Events',
    'government': 'Government/Community', 'city hall': 'Government/Community', 'civic': 'Government/Community',
    'religious': 'Religious/Cultural celebrations', 'faith': 'Religious/Cultural celebrations'
  };

  /* Deterministic keyword fallback — used ONLY when the source supplied no mappable category. First match wins per rule; up to 3 kept. */
  const KEYWORD_RULES = [
    [/\b(diwali|navratri|garba|eid|ramadan|lunar new year|hanukkah|passover|vaisakhi|holi|powwow|pow wow|mid-autumn|moon festival|lantern festival)\b/i, 'Religious/Cultural celebrations'],
    [/\b(halloween|christmas|santa|tree lighting|holiday market|new year|thanksgiving|remembrance|canada day|easter|boo bash)\b/i, 'Holiday Events'],
    [/\b(festival|fest|carnival|fair)\b/i, 'Festivals'],
    [/\b(farmers?[' ]?s? market|farmers market|night market|flea market|artisan market)\b/i, 'Farmers Markets'],
    [/\b(kids?|children|family|toddler|storytime|story time|baby|babies|youth|teen|puppet|lego)\b/i, 'Family & Kids'],
    [/\b(concert|symphony|orchestra|choir|recital|live band|tour)\b/i, 'Concerts'],
    [/\b(live music|jazz|blues|dj|open mic|karaoke|band|singer|acoustic)\b/i, 'Music'],
    [/\b(comedy|stand-?up|improv)\b/i, 'Comedy'],
    [/\b(theatre|theater|musical|play|drama|ballet|dance performance|opera)\b/i, 'Theatre'],
    [/\b(film|movie|screening|cinema)\b/i, 'Movies'],
    [/\b(exhibit|exhibition|gallery|installation|art show)\b/i, 'Exhibitions'],
    [/\b(art|artist|painting|craft|sculpture|illusion|magic)\b/i, 'Arts'],
    [/\b(museum|heritage|historic|history)\b/i, 'Museum'],
    [/\b(library|book sale|book club|author)\b/i, 'Library'],
    [/\b(run|race|marathon|5k|10k|hockey|soccer|basketball|baseball|tournament|game|match|sports?|swim|cycling|golf|triathlon)\b/i, 'Sports'],
    [/\b(yoga|fitness|zumba|pilates|wellness|meditation|health|mental health)\b/i, 'Health & Fitness'],
    [/\b(hike|hiking|trail|nature|birding|bird|conservation|forest|garden|outdoor|camping|stargazing)\b/i, 'Nature & Outdoors'],
    [/\b(park|parks)\b/i, 'Parks'],
    [/\b(food|taste of|tasting|brewery|beer|wine|cider|bbq|ribfest|dinner|brunch|culinary|butter tart|cook)\b/i, 'Food & Drink'],
    [/\b(networking|meetup|mixer|chamber of commerce)\b/i, 'Networking'],
    [/\b(summit|conference|expo|trade show|business|entrepreneur|startup|founder)\b/i, 'Business'],
    [/\b(job fair|career|hiring|resume)\b/i, 'Career'],
    [/\b(coding|software|tech|robotics|ai\b|data science|cyber)\b/i, 'Technology'],
    [/\b(workshop|class|course|seminar|training|lesson|lessons|masterclass)\b/i, 'Workshops'],
    [/\b(lecture|university|college|education|learn|open house|info session)\b/i, 'Education'],
    [/\b(council|city hall|public meeting|town hall|consultation|election)\b/i, 'Government/Community'],
    [/\b(shopping|sale|vendors?|bazaar|craft show|pop-?up)\b/i, 'Shopping'],
    [/\b(community|volunteer|fundrais|charity|gala|cleanup|clean-up|neighbourhood|neighborhood)\b/i, 'Community'],
    [/\b(cultural|culture|heritage month|multicultural)\b/i, 'Cultural']
  ];

  /* ------------------------------------------------------------------ */
  /* GTA cities: filter region + approximate city-centre coordinates      */
  /* (approximate — used only for the distance filter when a source gives */
  /* no coordinates of its own)                                           */
  /* ------------------------------------------------------------------ */
  const GTA_CITIES = {
    'Mississauga': { region: 'Mississauga', lat: 43.589, lon: -79.644 },
    'Brampton': { region: 'Brampton', lat: 43.731, lon: -79.762 },
    'Toronto': { region: 'Toronto', lat: 43.653, lon: -79.383 },
    'Etobicoke': { region: 'Toronto', lat: 43.654, lon: -79.567 },
    'North York': { region: 'Toronto', lat: 43.761, lon: -79.411 },
    'Scarborough': { region: 'Toronto', lat: 43.773, lon: -79.257 },
    'Oakville': { region: 'Oakville', lat: 43.467, lon: -79.687 },
    'Milton': { region: 'Milton', lat: 43.518, lon: -79.878 },
    'Burlington': { region: 'Burlington', lat: 43.325, lon: -79.799 },
    'Vaughan': { region: 'Vaughan', lat: 43.837, lon: -79.508 },
    'Markham': { region: 'Markham', lat: 43.856, lon: -79.337 },
    'Richmond Hill': { region: 'Richmond Hill', lat: 43.883, lon: -79.440 },
    'Pickering': { region: 'Durham', lat: 43.884, lon: -79.090 },
    'Ajax': { region: 'Durham', lat: 43.850, lon: -79.020 },
    'Whitby': { region: 'Durham', lat: 43.897, lon: -78.943 },
    'Oshawa': { region: 'Durham', lat: 43.897, lon: -78.865 },
    'Clarington': { region: 'Durham', lat: 43.936, lon: -78.686 },
    'Bowmanville': { region: 'Durham', lat: 43.912, lon: -78.687 },
    'Uxbridge': { region: 'Durham', lat: 44.109, lon: -79.120 },
    'Scugog': { region: 'Durham', lat: 44.100, lon: -78.940 },
    'Halton Hills': { region: 'Other', lat: 43.629, lon: -79.950 },
    'Georgetown': { region: 'Other', lat: 43.650, lon: -79.920 },
    'Caledon': { region: 'Other', lat: 43.866, lon: -79.860 },
    'Aurora': { region: 'Other', lat: 44.006, lon: -79.450 },
    'Newmarket': { region: 'Other', lat: 44.059, lon: -79.461 },
    'Stouffville': { region: 'Other', lat: 43.970, lon: -79.245 },
    'King City': { region: 'Other', lat: 43.920, lon: -79.530 },
    'Georgina': { region: 'Other', lat: 44.298, lon: -79.436 }
  };
  const REGION_FILTERS = ['All GTA', 'Mississauga', 'Brampton', 'Toronto', 'Oakville', 'Milton', 'Burlington', 'Vaughan', 'Markham', 'Richmond Hill', 'Durham', 'Other'];

  function regionOf(city) {
    const c = canonicalCity(city);
    return (GTA_CITIES[c] && GTA_CITIES[c].region) || 'Other';
  }

  const CITY_ALIASES = { 'toronto on': 'Toronto', 'city of toronto': 'Toronto', 'east york': 'Toronto', 'york': 'Toronto', 'stouffville': 'Stouffville', 'whitchurch stouffville': 'Stouffville', 'town of oakville': 'Oakville', 'city of mississauga': 'Mississauga', 'city of brampton': 'Brampton' };
  function canonicalCity(name) {
    if (!name) return '';
    const raw = String(name).trim();
    if (GTA_CITIES[raw]) return raw;
    const n = normalize(raw);
    for (const k of Object.keys(GTA_CITIES)) if (normalize(k) === n) return k;
    if (CITY_ALIASES[n]) return CITY_ALIASES[n];
    return raw;
  }
  /* Find a known GTA city inside free text (longest name first). Returns '' if none. */
  const CITY_NAMES_BY_LEN = Object.keys(GTA_CITIES).sort((a, b) => b.length - a.length);
  function detectCity(text) {
    if (!text) return '';
    const t = ' ' + normalize(text) + ' ';
    for (const c of CITY_NAMES_BY_LEN) if (t.indexOf(' ' + normalize(c) + ' ') !== -1) return c;
    return '';
  }

  /* ------------------------------------------------------------------ */
  /* Small text helpers                                                   */
  /* ------------------------------------------------------------------ */
  function normalize(s) {
    return String(s == null ? '' : s)
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }
  const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '\u2019', lsquo: '\u2018', ldquo: '\u201c', rdquo: '\u201d', ndash: '\u2013', mdash: '\u2014', hellip: '\u2026' };
  function decodeEntities(s) {
    return String(s == null ? '' : s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        try { return String.fromCodePoint(code); } catch (_) { return m; }
      }
      const v = ENTITIES[e.toLowerCase()];
      return v === undefined ? m : v;
    });
  }
  function stripHtml(html) {
    if (!html) return '';
    let s = String(html)
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, '');
    s = decodeEntities(s);
    return s.replace(/[ \t\u00a0]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();
  }
  function clip(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '\u2026' : s;
  }
  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  }
  function isHttpUrl(u) { return typeof u === 'string' && /^https?:\/\//i.test(u.trim()); }
  const pad = n => String(n).padStart(2, '0');

  /* ------------------------------------------------------------------ */
  /* Time zone maths (America/Toronto) using Intl only                    */
  /* ------------------------------------------------------------------ */
  const dtfCache = {};
  function dtf(tz) {
    return dtfCache[tz] || (dtfCache[tz] = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
    }));
  }
  function tzParts(ms, tz) {
    const o = {};
    dtf(tz || TZ).formatToParts(new Date(ms)).forEach(p => { if (p.type !== 'literal') o[p.type] = +p.value; });
    return o;
  }
  function tzOffsetMs(ms, tz) {
    const p = tzParts(ms, tz);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
  }
  /* wall-clock time in `tz` -> UTC epoch ms */
  function localToUTC(y, m, d, h, mi, tz) {
    const guess = Date.UTC(y, m - 1, d, h, mi || 0);
    const t1 = guess - tzOffsetMs(guess, tz || TZ);
    return guess - tzOffsetMs(t1, tz || TZ);
  }
  function utcToLocal(ms, tz) {
    const p = tzParts(ms, tz || TZ);
    return { date: p.year + '-' + pad(p.month) + '-' + pad(p.day), time: pad(p.hour) + ':' + pad(p.minute) };
  }
  function safeTz(tz) { try { dtf(tz); return tz; } catch (_) { return TZ; } }
  function todayStr(now) { return utcToLocal((now || new Date()).getTime()).date; }

  /* date-string arithmetic ('YYYY-MM-DD'), always in UTC so no DST surprises */
  function dateToUTC(str) { const [y, m, d] = str.split('-').map(Number); return Date.UTC(y, m - 1, d); }
  function addDays(str, n) { const t = new Date(dateToUTC(str) + n * 86400000); return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()); }
  function dayOfWeek(str) { return new Date(dateToUTC(str)).getUTCDay(); } // 0 = Sunday
  function daysBetween(a, b) { return Math.round((dateToUTC(b) - dateToUTC(a)) / 86400000); }
  function endOfMonth(str) { const [y, m] = str.split('-').map(Number); return y + '-' + pad(m) + '-' + pad(new Date(Date.UTC(y, m, 0)).getUTCDate()); }

  /* Named date windows. Weeks run Monday–Sunday. "Weekend" = Saturday + Sunday. */
  function dateRange(mode, today, custom) {
    const dow = dayOfWeek(today); // 0 Sun..6 Sat
    const untilSunday = (7 - dow) % 7;
    switch (mode) {
      case 'today': return [today, today];
      case 'tomorrow': return [addDays(today, 1), addDays(today, 1)];
      case 'weekend': {
        if (dow === 0) return [today, today];
        const sat = addDays(today, dow === 6 ? 0 : 6 - dow);
        return [sat, addDays(sat, 1)];
      }
      case 'week': return [today, addDays(today, untilSunday)];
      case 'next7': return [today, addDays(today, 6)];
      case 'next14': return [today, addDays(today, 13)];
      case 'nextweek': { const mon = addDays(today, untilSunday + 1); return [mon, addDays(mon, 6)]; }
      case 'month': return [today, endOfMonth(today)];
      case 'custom': {
        const a = custom && custom[0], b = custom && custom[1];
        if (a && b) return a <= b ? [a, b] : [b, a];
        if (a) return [a, a];
        if (b) return [b, b];
        return null;
      }
      default: return null; // 'any'
    }
  }

  /* ------------------------------------------------------------------ */
  /* ICS (iCalendar) parsing                                              */
  /* ------------------------------------------------------------------ */
  function icsUnescape(s) { return String(s || '').replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\'); }

  function parseICSLines(text) {
    const unfolded = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
    const lines = unfolded.split('\n');
    const events = [];
    let cur = null;
    const re = /^([A-Za-z0-9-]+)((?:;[^:;=]+=(?:"[^"]*"|[^:;]*))*):(.*)$/;
    for (const line of lines) {
      if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
      if (line === 'END:VEVENT') { if (cur) events.push(cur); cur = null; continue; }
      if (!cur) continue;
      const m = re.exec(line);
      if (!m) continue;
      const name = m[1].toUpperCase();
      const params = {};
      (m[2] || '').split(';').filter(Boolean).forEach(p => {
        const i = p.indexOf('=');
        params[p.slice(0, i).toUpperCase()] = p.slice(i + 1).replace(/^"|"$/g, '');
      });
      (cur[name] = cur[name] || []).push({ params, value: m[3] });
    }
    return events;
  }

  /* -> { date, time|null, allDay, ms|null } expressed in Toronto local time */
  function parseICSDate(prop) {
    if (!prop) return null;
    const v = prop.value.trim();
    let m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
    if (m) return { date: m[1] + '-' + m[2] + '-' + m[3], time: null, allDay: true, ms: null };
    m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
    if (!m) return null;
    const [, Y, Mo, D, H, Mi, , z] = m;
    let ms;
    if (z) ms = Date.UTC(+Y, +Mo - 1, +D, +H, +Mi);
    else ms = localToUTC(+Y, +Mo, +D, +H, +Mi, safeTz(prop.params.TZID || TZ));
    const l = utcToLocal(ms);
    return { date: l.date, time: l.time, allDay: false, ms };
  }

  function first(ev, k) { return ev[k] && ev[k][0] ? ev[k][0] : null; }
  function val(ev, k) { const p = first(ev, k); return p ? icsUnescape(p.value).trim() : ''; }

  /* Split "Venue, Street, City, Province, Postal, Country" style LOCATION strings. */
  function parseLocation(loc) {
    const out = { venue: '', address: '', city: '', postalCode: '' };
    if (!loc) return out;
    const postal = /[A-Z]\d[A-Z][ -]?\d[A-Z]\d/i.exec(loc);
    if (postal) out.postalCode = postal[0].toUpperCase().replace(/[ -]/, ' ');
    const parts = loc.split(/\s*,\s*/).filter(Boolean).filter(p => !/^(canada|ontario|on|ca)$/i.test(p) && !/^[A-Z]\d[A-Z][ -]?\d[A-Z]\d$/i.test(p) && !/^[A-Z]{2}$/.test(p));
    out.city = detectCity(loc);
    if (parts.length === 1) { out.venue = parts[0]; }
    else if (parts.length >= 2) {
      const looksLikeStreet = s => /^\d+[a-z]?\b/i.test(s) || /\b(st|street|ave|avenue|rd|road|dr|drive|blvd|boulevard|way|pkwy|parkway|court|ct|lane|ln|crescent|cres|hwy|highway)\b\.?$/i.test(s);
      if (looksLikeStreet(parts[0])) { out.address = parts[0]; }
      else {
        out.venue = parts[0];
        const i = parts.findIndex((p, idx) => idx > 0 && looksLikeStreet(p));
        if (i > 0) out.address = parts[i]; else if (parts[1] && normalize(parts[1]) !== normalize(out.city)) out.address = parts[1];
      }
      if (!out.city) out.city = parts.find((p, i) => i > 0 && !looksLikeStreet(p) && p !== out.address) || '';
    }
    return out;
  }

  /* Minimal RRULE expansion (DAILY / WEEKLY[BYDAY]); anything else yields the first occurrence only. */
  function expandRRule(baseDate, rrule, until, exdates, maxCount) {
    const r = {};
    String(rrule).split(';').forEach(p => { const [k, v] = p.split('='); r[k.toUpperCase()] = v; });
    if (r.FREQ !== 'DAILY' && r.FREQ !== 'WEEKLY') return [baseDate];
    const interval = +r.INTERVAL || 1;
    const cap = Math.min(+r.COUNT || 9999, maxCount || 200);
    const lim = [r.UNTIL ? (r.UNTIL.slice(0, 4) + '-' + r.UNTIL.slice(4, 6) + '-' + r.UNTIL.slice(6, 8)) : null, until].filter(Boolean).sort()[0];
    const dayNames = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    const byday = r.BYDAY ? r.BYDAY.split(',').map(s => dayNames.indexOf(s.slice(-2))).filter(i => i >= 0) : [dayOfWeek(baseDate)];
    const out = [];
    let d = baseDate, n = 0, guard = 0;
    while (guard++ < 800 && (!lim || d <= lim) && n < cap) {
      let ok;
      if (r.FREQ === 'DAILY') ok = daysBetween(baseDate, d) % interval === 0;
      else {
        const weeks = Math.floor(daysBetween(addDays(baseDate, -((dayOfWeek(baseDate) + 6) % 7)), d) / 7); // Monday-based weeks
        ok = weeks % interval === 0 && byday.indexOf(dayOfWeek(d)) !== -1;
      }
      if (ok && d >= baseDate) { n++; if (!exdates || exdates.indexOf(d) === -1) out.push(d); }
      d = addDays(d, 1);
    }
    return out.length ? out : [baseDate];
  }

  /* -> array of raw event objects (not yet normalised) */
  function parseICS(text, opts) {
    opts = opts || {};
    const horizonEnd = opts.horizonEnd || null;
    const out = [];
    parseICSLines(text).forEach(ev => {
      if (/CANCELLED/i.test(val(ev, 'STATUS'))) return;
      const s = parseICSDate(first(ev, 'DTSTART'));
      if (!s) return;
      let e = parseICSDate(first(ev, 'DTEND'));
      let endDate = e ? e.date : s.date, endTime = e && e.time;
      if (s.allDay) { endDate = e ? addDays(e.date, -1) : s.date; if (endDate < s.date) endDate = s.date; endTime = null; }
      const loc = parseLocation(val(ev, 'LOCATION'));
      const geo = val(ev, 'GEO').split(';').map(Number);
      const attach = (ev.ATTACH || []).find(a => /^image\//i.test(a.params.FMTTYPE || '') || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(a.value));
      const org = first(ev, 'ORGANIZER');
      const dates = [s.date];
      if (ev.RRULE && ev.RRULE[0]) {
        const ex = (ev.EXDATE || []).map(p => (p.value.split(',')[0] || '').slice(0, 8)).map(x => x.slice(0, 4) + '-' + x.slice(4, 6) + '-' + x.slice(6, 8));
        dates.length = 0;
        expandRRule(s.date, ev.RRULE[0].value, horizonEnd, ex, 200).forEach(d => dates.push(d));
      }
      const spanDays = daysBetween(s.date, endDate);
      dates.forEach((d, i) => {
        out.push({
          uid: val(ev, 'UID') + (dates.length > 1 ? '#' + d : ''),
          title: val(ev, 'SUMMARY'),
          startDate: d, startTime: s.time, endDate: addDays(d, spanDays), endTime: endTime, allDay: s.allDay,
          venue: loc.venue, address: loc.address, city: loc.city, postalCode: loc.postalCode,
          lat: geo.length === 2 && isFinite(geo[0]) && isFinite(geo[1]) && (geo[0] || geo[1]) ? geo[0] : undefined,
          lon: geo.length === 2 && isFinite(geo[0]) && isFinite(geo[1]) && (geo[0] || geo[1]) ? geo[1] : undefined,
          sourceCategories: val(ev, 'CATEGORIES') ? val(ev, 'CATEGORIES').split(/\s*,\s*/) : [],
          description: val(ev, 'DESCRIPTION'),
          url: val(ev, 'URL'),
          organizer: org ? (org.params.CN || '').replace(/^"|"$/g, '') : '',
          image: attach ? attach.value : '',
          updated: (function () { const p = parseICSDate(first(ev, 'LAST-MODIFIED')); return p && p.ms ? new Date(p.ms).toISOString() : ''; })()
        });
      });
    });
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* RSS / Atom (regex based so it works in Node and the browser)          */
  /* ------------------------------------------------------------------ */
  function xmlTag(block, names) {
    for (const n of names) {
      const re = new RegExp('<' + n.replace(':', '\\:') + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + n.replace(':', '\\:') + '>', 'i');
      const m = re.exec(block);
      if (m) return decodeEntities(m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')).trim();
    }
    return '';
  }
  function xmlTags(block, name) {
    const out = [], re = new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>', 'gi');
    let m; while ((m = re.exec(block))) out.push(decodeEntities(m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')).trim());
    return out;
  }
  function parseLooseDate(s) {
    if (!s) return null;
    s = String(s).trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2})?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(s);
    if (m) {
      if (!m[4]) return { date: m[1] + '-' + m[2] + '-' + m[3], time: null, allDay: true };
      if (m[6]) { const l = utcToLocal(new Date(s.length === 16 ? s + ':00Z' : s).getTime()); return { date: l.date, time: l.time, allDay: false }; }
      return { date: m[1] + '-' + m[2] + '-' + m[3], time: m[4] + ':' + m[5], allDay: false };
    }
    const t = Date.parse(s);
    if (!isNaN(t) && /\d{4}/.test(s)) { const l = utcToLocal(t); return { date: l.date, time: l.time, allDay: false }; }
    return null;
  }
  /* Ordinary RSS has no event dates, so we only read explicit event-date tags. */
  function parseRSS(text, opts) {
    opts = opts || {};
    const startTags = opts.startTags || ['ev:startdate', 'xcal:dtstart', 'startdate', 'start_date', 'dtstart', 'event:startdate', 'calendarevent:startdate'];
    const endTags = opts.endTags || ['ev:enddate', 'xcal:dtend', 'enddate', 'end_date', 'dtend', 'event:enddate', 'calendarevent:enddate'];
    const out = [];
    const re = /<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
    let m;
    while ((m = re.exec(text))) {
      const b = m[2];
      const s = parseLooseDate(xmlTag(b, startTags)) || (opts.usePubDateAsStart ? parseLooseDate(xmlTag(b, ['pubDate', 'published', 'updated'])) : null);
      if (!s) continue;
      const e = parseLooseDate(xmlTag(b, endTags));
      let link = xmlTag(b, ['link']);
      if (!link) { const lm = /<link[^>]*href="([^"]+)"/i.exec(b); link = lm ? decodeEntities(lm[1]) : ''; }
      const enc = /<enclosure[^>]*url="([^"]+)"[^>]*type="image/i.exec(b);
      const loc = xmlTag(b, ['ev:location', 'location', 'calendarevent:location']);
      const pl = parseLocation(loc);
      out.push({
        uid: xmlTag(b, ['guid', 'id']) || link,
        title: stripHtml(xmlTag(b, ['title'])),
        startDate: s.date, startTime: s.time, endDate: e ? e.date : s.date, endTime: e ? e.time : null, allDay: !!s.allDay,
        venue: pl.venue, address: pl.address, city: pl.city, postalCode: pl.postalCode,
        sourceCategories: xmlTags(b, 'category'),
        description: stripHtml(xmlTag(b, ['description', 'content:encoded', 'summary', 'content'])),
        url: link, image: enc ? decodeEntities(enc[1]) : ''
      });
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* JSON adapters                                                        */
  /* ------------------------------------------------------------------ */
  function getPath(obj, path) {
    if (!path) return undefined;
    return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }

  /* The Events Calendar (WordPress) REST API v1: <site>/wp-json/tribe/events/v1/events */
  function parseTribe(json) {
    const list = (json && json.events) || [];
    return list.map(e => {
      const tz = safeTz(e.timezone || TZ);
      const toLocal = str => {
        if (!str) return null;
        const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(str);
        if (!m) return null;
        const ms = localToUTC(+m[1], +m[2], +m[3], +m[4], +m[5], tz);
        return utcToLocal(ms);
      };
      const s = toLocal(e.start_date), en = toLocal(e.end_date);
      if (!s) return null;
      const v = Array.isArray(e.venue) ? e.venue[0] : e.venue;
      const cost = e.cost || '';
      const nums = ((e.cost_details && e.cost_details.values) || []).map(Number).filter(x => isFinite(x));
      const org = Array.isArray(e.organizer) ? e.organizer[0] : e.organizer;
      return {
        uid: 'tribe-' + e.id, title: stripHtml(e.title),
        startDate: s.date, startTime: e.all_day ? null : s.time,
        endDate: en ? en.date : s.date, endTime: e.all_day ? null : (en ? en.time : null), allDay: !!e.all_day,
        venue: v && v.venue ? stripHtml(v.venue) : '', address: v && v.address ? stripHtml(v.address) : '',
        city: v && v.city ? v.city : '', postalCode: v && v.zip ? String(v.zip).toUpperCase() : '',
        lat: v && v.geo_lat ? +v.geo_lat : undefined, lon: v && v.geo_lng ? +v.geo_lng : undefined,
        sourceCategories: (e.categories || []).map(c => c.name).filter(Boolean),
        description: stripHtml(e.description || e.excerpt), url: e.url || '', registrationUrl: e.website && e.website !== e.url ? e.website : '',
        priceText: stripHtml(cost), priceMin: nums.length ? Math.min.apply(null, nums) : undefined, priceMax: nums.length ? Math.max.apply(null, nums) : undefined,
        organizer: org && org.organizer ? stripHtml(org.organizer) : '',
        image: e.image && e.image.url ? e.image.url : '', featured: !!e.featured,
        updated: e.modified_utc ? e.modified_utc.replace(' ', 'T') + 'Z' : ''
      };
    }).filter(Boolean);
  }

  /* schema.org Event JSON-LD (an array, an @graph, or one object) */
  function parseJsonLd(json) {
    let list = Array.isArray(json) ? json : (json && json['@graph']) ? json['@graph'] : [json];
    return list.filter(x => x && /Event/i.test(String(x['@type']))).map(x => {
      const s = parseLooseDate(x.startDate), e = parseLooseDate(x.endDate);
      if (!s) return null;
      const loc = Array.isArray(x.location) ? x.location[0] : (x.location || {});
      const addr = loc.address || {};
      const offer = Array.isArray(x.offers) ? x.offers[0] : (x.offers || {});
      return {
        uid: x['@id'] || x.url, title: stripHtml(x.name), startDate: s.date, startTime: s.time, allDay: !!s.allDay,
        endDate: e ? e.date : s.date, endTime: e ? e.time : null,
        venue: loc.name || '', address: typeof addr === 'string' ? addr : (addr.streetAddress || ''), city: addr.addressLocality || '', postalCode: addr.postalCode || '',
        lat: loc.geo && loc.geo.latitude ? +loc.geo.latitude : undefined, lon: loc.geo && loc.geo.longitude ? +loc.geo.longitude : undefined,
        sourceCategories: [].concat(x.keywords ? String(x.keywords).split(/\s*,\s*/) : []),
        description: stripHtml(x.description), url: x.url || '', registrationUrl: offer.url || '',
        priceText: offer.price !== undefined ? (Number(offer.price) === 0 ? 'Free' : '$' + offer.price) : '',
        priceMin: offer.price !== undefined && isFinite(+offer.price) ? +offer.price : undefined,
        organizer: (x.organizer && x.organizer.name) || '', image: Array.isArray(x.image) ? x.image[0] : (x.image && x.image.url) || x.image || ''
      };
    }).filter(Boolean);
  }

  /* Generic JSON via user-supplied field map: { itemsPath, fields:{title:'name', startDate:'start.local', ...} } */
  function parseMappedJson(json, map) {
    map = map || {};
    const items = map.itemsPath ? getPath(json, map.itemsPath) : json;
    if (!Array.isArray(items)) return [];
    const f = map.fields || {};
    return items.map(it => {
      const g = k => getPath(it, f[k]);
      const s = parseLooseDate(g('start'));
      if (!s) return null;
      const e = parseLooseDate(g('end'));
      const cats = g('categories');
      return {
        uid: g('id') || g('url'), title: stripHtml(g('title')),
        startDate: s.date, startTime: s.time, allDay: !!s.allDay, endDate: e ? e.date : s.date, endTime: e ? e.time : null,
        venue: g('venue') || '', address: g('address') || '', city: g('city') || '', postalCode: g('postalCode') || '',
        lat: g('lat') ? +g('lat') : undefined, lon: g('lon') ? +g('lon') : undefined,
        sourceCategories: Array.isArray(cats) ? cats.map(String) : (cats ? String(cats).split(/\s*,\s*/) : []),
        description: stripHtml(g('description')), url: g('url') || '', registrationUrl: g('registrationUrl') || '',
        priceText: g('price') !== undefined && g('price') !== null ? String(g('price')) : '', organizer: g('organizer') || '', image: g('image') || ''
      };
    }).filter(Boolean);
  }

  /* ------------------------------------------------------------------ */
  /* Price handling                                                       */
  /* ------------------------------------------------------------------ */
  const FREE_TEXT = /\b(free|no charge|no cost|complimentary|admission is free|by donation|pay what you can|pwyc)\b/i;
  const FREE_IN_DESC = /\b(free (admission|entry|event|to attend|to the public|for all|of charge)|admission is free|no cost to attend|no charge|free\s*!)/i;
  function parsePrice(raw) {
    const out = {};
    const t = String(raw.priceText || '').trim();
    if (t) out.priceText = t;
    let min = raw.priceMin, max = raw.priceMax;
    if (min === undefined && t) {
      const nums = (t.match(/\d+(?:[.,]\d{1,2})?/g) || []).map(x => parseFloat(x.replace(',', '.'))).filter(x => isFinite(x));
      if (nums.length) { min = Math.min.apply(null, nums); max = Math.max.apply(null, nums); }
    }
    if (min !== undefined) { out.priceMin = min; out.priceMax = max !== undefined ? max : min; }
    if (/^\s*free\b/i.test(t) || (t && FREE_TEXT.test(t) && !/\$\s*\d/.test(t))) out.isFree = true;
    else if (min !== undefined) out.isFree = min === 0 && (max === undefined || max === 0);
    else if (FREE_IN_DESC.test(raw.description || '') || /^free\b/i.test(raw.title || '')) { out.isFree = true; out.priceText = out.priceText || 'Free (per listing text)'; }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Categorisation: (1) source categories, (2) explicit map, (3) keywords */
  /* ------------------------------------------------------------------ */
  function categorize(raw, source, isFree) {
    const found = [];
    const add = c => { if (c && found.indexOf(c) === -1) found.push(c); };
    const custom = (source && source.categoryMap) || {};
    (raw.sourceCategories || []).forEach(sc => {
      const n = normalize(sc);
      add(custom[n] || custom[sc] || CATEGORY_MAP[n] || (CATEGORIES.indexOf(sc) !== -1 ? sc : null));
    });
    if (!found.length && source && source.defaultCategories) source.defaultCategories.forEach(add);
    if (!found.length) {
      const hay = (raw.title || '') + ' ' + (raw.venue || '') + ' ' + clip(raw.description || '', 400);
      for (const [re, cat] of KEYWORD_RULES) { if (re.test(hay)) add(cat); if (found.length >= 3) break; }
    }
    if (!found.length) add('Other');
    if (isFree) add('Free Events');
    return found.slice(0, 4);
  }

  /* ------------------------------------------------------------------ */
  /* Normalisation of one raw record into the final event shape           */
  /* ------------------------------------------------------------------ */
  function compact(o) {
    Object.keys(o).forEach(k => { const v = o[k]; if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) delete o[k]; });
    return o;
  }

  function normalizeEvent(raw, source, nowIso) {
    if (!raw || !raw.title || !/^\d{4}-\d{2}-\d{2}$/.test(raw.startDate || '')) return null;
    const price = parsePrice(raw);
    const startDate = raw.startDate;
    let endDate = /^\d{4}-\d{2}-\d{2}$/.test(raw.endDate || '') ? raw.endDate : startDate;
    if (endDate < startDate) endDate = startDate;
    const loc = [raw.venue, raw.address, raw.city].join(' ');
    const city = canonicalCity(raw.city) && GTA_CITIES[canonicalCity(raw.city)] ? canonicalCity(raw.city)
      : (detectCity(loc) || (source && source.city) || canonicalCity(raw.city) || '');
    const url = isHttpUrl(raw.url) ? raw.url.trim() : (source && source.homepage) || '';
    const ev = {
      id: fnv1a([source && source.id, raw.uid || url, raw.title, startDate, raw.startTime || ''].join('|')),
      title: clip(stripHtml(raw.title).replace(/\s+/g, ' '), 200),
      startDate: startDate, startTime: raw.allDay ? undefined : raw.startTime,
      endDate: endDate, endTime: raw.allDay ? undefined : raw.endTime,
      allDay: raw.allDay ? true : undefined,
      venue: clip(stripHtml(raw.venue), 120), address: clip(stripHtml(raw.address), 160), city: city, postalCode: raw.postalCode,
      lat: raw.lat, lon: raw.lon,
      description: clip(stripHtml(raw.description), 1200),
      url: url, registrationUrl: isHttpUrl(raw.registrationUrl) ? raw.registrationUrl : undefined,
      priceText: price.priceText, priceMin: price.priceMin, priceMax: price.priceMax, isFree: price.isFree,
      organizer: clip(stripHtml(raw.organizer), 120), image: isHttpUrl(raw.image) ? raw.image : undefined,
      featured: raw.featured ? true : undefined,
      source: source ? source.name : raw.source, sourceId: source ? source.id : undefined,
      sourceKind: source ? source.kind : undefined, sourcePriority: source ? source.priority : undefined,
      updated: raw.updated || nowIso || undefined
    };
    ev.categories = categorize(raw, source, price.isFree);
    if (raw.sourceCategories && raw.sourceCategories.length) ev.sourceCategories = raw.sourceCategories.slice(0, 6);
    if (raw.demo) ev.demo = true;
    return compact(ev);
  }

  /* ------------------------------------------------------------------ */
  /* Duplicate detection (deterministic)                                  */
  /* duplicateKey = normalize(title) + date + normalize(venue)            */
  /* ------------------------------------------------------------------ */
  function duplicateKey(ev) {
    return normalize(ev.title) + '|' + ev.startDate + '|' + (normalize(ev.venue) || ('@' + normalize(ev.city)));
  }
  function completeness(ev) {
    let n = 0;
    ['startTime', 'endTime', 'venue', 'address', 'city', 'postalCode', 'description', 'url', 'registrationUrl', 'priceText', 'organizer', 'image', 'lat'].forEach(k => { if (ev[k] !== undefined && ev[k] !== '') n++; });
    return n + (ev.categories ? ev.categories.length * 0.1 : 0);
  }
  function mergeInto(a, b) {
    // a is kept, b fills gaps
    const base = completeness(b) > completeness(a) || (completeness(b) === completeness(a) && (b.sourcePriority || 9) < (a.sourcePriority || 9)) ? b : a;
    const other = base === a ? b : a;
    const merged = Object.assign({}, base);
    Object.keys(other).forEach(k => { if (merged[k] === undefined || merged[k] === '') merged[k] = other[k]; });
    const srcs = [];
    [a, b].forEach(x => (x.sources || [{ name: x.source, url: x.url, kind: x.sourceKind }]).forEach(s => {
      if (s && s.name && !srcs.some(y => y.name === s.name)) srcs.push(s);
    }));
    merged.sources = srcs;
    const cats = [];
    (base.categories || []).concat(other.categories || []).forEach(c => { if (cats.indexOf(c) === -1) cats.push(c); });
    merged.categories = cats.slice(0, 4);
    if (a.isFree || b.isFree) merged.isFree = merged.isFree === false ? false : true;
    return merged;
  }
  function dedupe(events) {
    const map = new Map();
    let removed = 0;
    for (const ev of events) {
      const k = duplicateKey(ev);
      if (map.has(k)) { map.set(k, mergeInto(map.get(k), ev)); removed++; }
      else map.set(k, ev);
    }
    // second pass: a record with no venue matches a same-title/date/city record that has one
    const byLoose = new Map();
    map.forEach((ev, k) => { if (normalize(ev.venue)) byLoose.set(normalize(ev.title) + '|' + ev.startDate + '|' + normalize(ev.city), k); });
    Array.from(map.keys()).forEach(k => {
      const ev = map.get(k);
      if (!ev || normalize(ev.venue)) return;
      const target = byLoose.get(normalize(ev.title) + '|' + ev.startDate + '|' + normalize(ev.city));
      if (target && target !== k && map.has(target)) { map.set(target, mergeInto(map.get(target), ev)); map.delete(k); removed++; }
    });
    const out = Array.from(map.values());
    out.forEach(e => { if (!e.sources) e.sources = [{ name: e.source, url: e.url, kind: e.sourceKind }]; delete e.sourcePriority; });
    out.removed = removed;
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Filtering helpers                                                    */
  /* ------------------------------------------------------------------ */
  const LONG_RUNNING_DAYS = 14;
  function isLongRunning(ev) { return daysBetween(ev.startDate, ev.endDate || ev.startDate) > LONG_RUNNING_DAYS; }
  /* Does the event touch the window [from, to]? Long-running events only count on their start day unless includeLong. */
  function inWindow(ev, from, to, includeLong) {
    const end = ev.endDate || ev.startDate;
    if (!includeLong && isLongRunning(ev)) return ev.startDate >= from && ev.startDate <= to;
    return ev.startDate <= to && end >= from;
  }
  function priceBandMatch(ev, band) {
    if (!band || band === 'all') return true;
    if (band === 'free') return ev.isFree === true;
    if (ev.isFree === true) return false;
    const p = ev.priceMin;
    if (p === undefined) return false; // price unknown: never claim it fits a paid band
    if (band === 'u10') return p < 10;
    if (band === '10-25') return p >= 10 && p <= 25;
    if (band === '25-50') return p > 25 && p <= 50;
    if (band === '50+') return p > 50;
    return true;
  }
  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  function eventCoords(ev) {
    if (typeof ev.lat === 'number' && typeof ev.lon === 'number') return { lat: ev.lat, lon: ev.lon, exact: true };
    const c = GTA_CITIES[canonicalCity(ev.city)];
    return c ? { lat: c.lat, lon: c.lon, exact: false } : null;
  }
  function searchText(ev) {
    return normalize([ev.title, ev.venue, ev.city, (ev.categories || []).join(' '), ev.organizer, ev.description, ev.address].join(' '));
  }
  function matchesQuery(ev, tokens) {
    if (!tokens.length) return true;
    const hay = ev._s || (ev._s = searchText(ev));
    for (const t of tokens) if (hay.indexOf(t) === -1) return false;
    return true;
  }
  function queryTokens(q) { return normalize(q).split(' ').filter(Boolean); }

  function sortEvents(list) {
    return list.sort((a, b) =>
      (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0) ||
      ((b.featured ? 1 : 0) - (a.featured ? 1 : 0)) ||
      ((a.startTime || '24:00') < (b.startTime || '24:00') ? -1 : (a.startTime || '24:00') > (b.startTime || '24:00') ? 1 : 0) ||
      (a.title < b.title ? -1 : 1));
  }

  /* ------------------------------------------------------------------ */
  /* Freshness                                                            */
  /* ------------------------------------------------------------------ */
  function freshness(lastIso, now) {
    if (!lastIso) return { level: 'red', emoji: '\uD83D\uDD34', label: 'Never updated', days: null };
    const days = Math.floor(((now || new Date()).getTime() - new Date(lastIso).getTime()) / 86400000);
    if (days < 1) return { level: 'green', emoji: '\uD83D\uDFE2', label: 'Updated today', days: 0 };
    if (days <= 4) return { level: 'yellow', emoji: '\uD83D\uDFE1', label: 'Updated ' + days + (days === 1 ? ' day ago' : ' days ago'), days };
    if (days <= 7) return { level: 'orange', emoji: '\uD83D\uDFE0', label: 'Updated ' + days + ' days ago', days };
    return { level: 'red', emoji: '\uD83D\uDD34', label: 'Older than 7 days', days };
  }
  function nextRefresh(lastIso, everyDays) {
    if (!lastIso) return null;
    return new Date(new Date(lastIso).getTime() + (everyDays || 7) * 86400000);
  }

  /* ------------------------------------------------------------------ */
  /* Calendar export (generated locally)                                  */
  /* ------------------------------------------------------------------ */
  function eventInstants(ev) {
    if (ev.allDay || !ev.startTime) {
      const start = ev.startDate.replace(/-/g, '');
      const end = addDays(ev.endDate || ev.startDate, 1).replace(/-/g, '');
      return { allDay: true, start, end };
    }
    const [sy, sm, sd] = ev.startDate.split('-').map(Number);
    const [sh, smi] = ev.startTime.split(':').map(Number);
    const s = localToUTC(sy, sm, sd, sh, smi);
    let e;
    if (ev.endTime) {
      const [ey, em, ed] = (ev.endDate || ev.startDate).split('-').map(Number);
      const [eh, emi] = ev.endTime.split(':').map(Number);
      e = localToUTC(ey, em, ed, eh, emi);
      if (e <= s) e = s + 3600000;
    } else e = s + 3600000;
    const f = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    return { allDay: false, start: f(s), end: f(e) };
  }
  function locationLine(ev) { return [ev.venue, ev.address, ev.city, 'Ontario'].filter(Boolean).join(', '); }
  function googleCalendarUrl(ev) {
    const t = eventInstants(ev);
    const details = [ev.description ? clip(ev.description, 800) : '', ev.url ? 'Official page: ' + ev.url : '', 'Source: ' + (ev.source || '')].filter(Boolean).join('\n\n');
    const q = new URLSearchParams({ action: 'TEMPLATE', text: ev.title, dates: t.start + '/' + t.end, details: details, location: locationLine(ev) });
    return 'https://calendar.google.com/calendar/render?' + q.toString();
  }
  function icsEscape(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;'); }
  function icsFold(line) {
    const out = []; let s = line;
    while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); }
    out.push(s);
    return out.join('\r\n');
  }
  function buildICS(events, calName) {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GTA Events Hub//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    if (calName) L.push('X-WR-CALNAME:' + icsEscape(calName));
    events.forEach(ev => {
      const t = eventInstants(ev);
      L.push('BEGIN:VEVENT', 'UID:' + ev.id + '@gta-events-hub', 'DTSTAMP:' + stamp);
      if (t.allDay) L.push('DTSTART;VALUE=DATE:' + t.start, 'DTEND;VALUE=DATE:' + t.end);
      else L.push('DTSTART:' + t.start, 'DTEND:' + t.end);
      L.push('SUMMARY:' + icsEscape(ev.title));
      const loc = locationLine(ev); if (ev.venue || ev.address || ev.city) L.push('LOCATION:' + icsEscape(loc));
      const desc = [ev.description ? clip(ev.description, 800) : '', ev.url ? 'Official page: ' + ev.url : '', 'Source: ' + (ev.source || '')].filter(Boolean).join('\n\n');
      L.push('DESCRIPTION:' + icsEscape(desc));
      if (ev.url) L.push('URL:' + ev.url);
      if (typeof ev.lat === 'number' && typeof ev.lon === 'number') L.push('GEO:' + ev.lat + ';' + ev.lon);
      L.push('END:VEVENT');
    });
    L.push('END:VCALENDAR');
    return L.map(icsFold).join('\r\n') + '\r\n';
  }
  function osmSearchUrl(ev) {
    if (typeof ev.lat === 'number' && typeof ev.lon === 'number') return 'https://www.openstreetmap.org/?mlat=' + ev.lat + '&mlon=' + ev.lon + '#map=17/' + ev.lat + '/' + ev.lon;
    return 'https://www.openstreetmap.org/search?query=' + encodeURIComponent([ev.venue, ev.address, ev.city, 'Ontario, Canada'].filter(Boolean).join(', '));
  }

  /* ------------------------------------------------------------------ */
  /* Robots.txt (minimal, conservative) — used by the Node updater        */
  /* ------------------------------------------------------------------ */
  function robotsAllows(robotsTxt, path, agent) {
    if (!robotsTxt) return true;
    const groups = []; let cur = null;
    robotsTxt.split(/\r?\n/).forEach(line => {
      const l = line.replace(/#.*/, '').trim(); if (!l) return;
      const i = l.indexOf(':'); if (i < 0) return;
      const k = l.slice(0, i).trim().toLowerCase(), v = l.slice(i + 1).trim();
      if (k === 'user-agent') { if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); }
      else if (cur && (k === 'allow' || k === 'disallow')) cur.rules.push([k, v]);
    });
    const a = (agent || '').toLowerCase();
    let g = groups.find(x => x.agents.some(n => n !== '*' && a.indexOf(n) !== -1)) || groups.find(x => x.agents.indexOf('*') !== -1);
    if (!g) return true;
    let best = null;
    g.rules.forEach(([k, v]) => {
      if (!v) return;
      const re = new RegExp('^' + v.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
      if (re.test(path) && (!best || v.length > best[1].length || (v.length === best[1].length && k === 'allow'))) best = [k, v];
    });
    return !best || best[0] === 'allow';
  }

  return {
    TZ, CATEGORIES, CATEGORY_MAP, KEYWORD_RULES, GTA_CITIES, REGION_FILTERS, LONG_RUNNING_DAYS,
    normalize, decodeEntities, stripHtml, clip, fnv1a, isHttpUrl,
    localToUTC, utcToLocal, todayStr, addDays, dayOfWeek, daysBetween, endOfMonth, dateRange,
    parseICS, parseRSS, parseTribe, parseJsonLd, parseMappedJson, parseLocation, parseLooseDate,
    parsePrice, categorize, normalizeEvent, duplicateKey, dedupe,
    regionOf, canonicalCity, detectCity, isLongRunning, inWindow, priceBandMatch, haversineKm, eventCoords,
    searchText, matchesQuery, queryTokens, sortEvents, freshness, nextRefresh,
    eventInstants, googleCalendarUrl, buildICS, osmSearchUrl, robotsAllows
  };
});
