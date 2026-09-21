'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Core = require('../core.js');
const Collector = require('../collector.js');
const Demo = require('../demo-data.js');

const SRC = { id: 't', name: 'Test Source', city: 'Mississauga', kind: 'tourism', priority: 1 };

const ICS = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN',
  'BEGIN:VEVENT', 'UID:1@test', 'DTSTART;TZID=America/Toronto:20261010T120000', 'DTEND;TZID=America/Toronto:20261011T210000',
  'SUMMARY:Diwali RazzMatazz', 'DESCRIPTION:Celebrate the magic of Diwali.\\nAdmission is free for all.',
  'LOCATION:Mississauga Celebration Square\\, 300 City Centre Drive\\, Mississauga\\, Ontario\\, Canada',
  'URL:https://example.org/event/diwali', 'CATEGORIES:Festivals,Cultural', 'GEO:43.5931;-79.6412', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:2@test', 'DTSTART;VALUE=DATE:20261003', 'DTEND;VALUE=DATE:20261004', 'SUMMARY:All Day Craft Show',
  'LOCATION:Streetsville Legion\\, 101 Church St\\, Mississauga\\, ON L5M 1B7', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:3@test', 'DTSTART:20261007T120000Z', 'SUMMARY:UTC time event', 'STATUS:CANCELLED', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:4@test', 'DTSTART:20261007T230000Z', 'DTEND:20261008T010000Z', 'SUMMARY:Late night UTC', 'END:VEVENT',
  'END:VCALENDAR'
].join('\r\n');

test('ICS parsing: TZ, all-day, cancelled, UTC conversion', () => {
  const r = Core.parseICS(ICS);
  assert.strictEqual(r.length, 3); // cancelled skipped
  assert.strictEqual(r[0].startDate, '2026-10-10'); assert.strictEqual(r[0].startTime, '12:00');
  assert.strictEqual(r[0].endDate, '2026-10-11'); assert.strictEqual(r[0].endTime, '21:00');
  assert.strictEqual(r[0].venue, 'Mississauga Celebration Square');
  assert.strictEqual(r[0].address, '300 City Centre Drive');
  assert.strictEqual(r[0].city, 'Mississauga');
  assert.strictEqual(r[0].lat, 43.5931);
  assert.strictEqual(r[1].allDay, true); assert.strictEqual(r[1].endDate, '2026-10-03'); // exclusive end fixed
  assert.strictEqual(r[1].postalCode, 'L5M 1B7');
  // 23:00Z on Oct 7 in Toronto (EDT, UTC-4) = 19:00 same day
  assert.strictEqual(r[2].startDate, '2026-10-07'); assert.strictEqual(r[2].startTime, '19:00');
});

test('normalize: categories from source, free detection, official URL kept', () => {
  const ev = Core.normalizeEvent(Core.parseICS(ICS)[0], SRC, '2026-09-21T00:00:00Z');
  assert.deepStrictEqual(ev.categories.slice(0, 2), ['Festivals', 'Cultural']);
  assert.strictEqual(ev.isFree, true); assert.ok(ev.categories.includes('Free Events'));
  assert.strictEqual(ev.url, 'https://example.org/event/diwali');
  assert.strictEqual(ev.source, 'Test Source');
});

test('keyword fallback is deterministic and only used without source categories', () => {
  const a = Core.normalizeEvent({ title: 'Diwali Cultural Night', startDate: '2026-10-10', description: '' }, SRC);
  assert.ok(a.categories.includes('Religious/Cultural celebrations'));
  const b = Core.normalizeEvent({ title: 'Diwali Cultural Night', startDate: '2026-10-10', sourceCategories: ['Sports'] }, SRC);
  assert.deepStrictEqual(b.categories, ['Sports']);
  const c = Core.normalizeEvent({ title: 'Something unclassifiable', startDate: '2026-10-10' }, SRC);
  assert.deepStrictEqual(c.categories, ['Other']);
});

test('price: never invents price; bands behave', () => {
  const unknown = Core.normalizeEvent({ title: 'Mystery', startDate: '2026-10-10' }, SRC);
  assert.strictEqual(unknown.priceMin, undefined); assert.strictEqual(unknown.isFree, undefined);
  assert.strictEqual(Core.priceBandMatch(unknown, 'free'), false);
  assert.strictEqual(Core.priceBandMatch(unknown, 'u10'), false);
  const paid = Core.normalizeEvent({ title: 'Concert', startDate: '2026-10-10', priceText: '$25.00' }, SRC);
  assert.strictEqual(paid.isFree, false);
  assert.ok(Core.priceBandMatch(paid, '10-25')); assert.ok(!Core.priceBandMatch(paid, '25-50'));
  const range = Core.normalizeEvent({ title: 'Concert', startDate: '2026-10-10', priceText: '$54.50 – $74.50' }, SRC);
  assert.strictEqual(range.priceMin, 54.5); assert.ok(Core.priceBandMatch(range, '50+'));
  const free = Core.normalizeEvent({ title: 'Market', startDate: '2026-10-10', priceText: 'Free' }, SRC);
  assert.ok(Core.priceBandMatch(free, 'free'));
  const gf = Core.normalizeEvent({ title: 'Gluten-free bake sale', startDate: '2026-10-10', description: 'Try our gluten-free treats' }, SRC);
  assert.notStrictEqual(gf.isFree, true);
});

test('duplicate detection merges same title+date+venue and keeps both sources', () => {
  const a = Core.normalizeEvent({ title: 'Diwali Festival!', startDate: '2026-10-10', startTime: '12:00', venue: 'Celebration Square', city: 'Mississauga', uid: 'a' }, { id: 'a', name: 'Source A', priority: 2 });
  const b = Core.normalizeEvent({ title: 'DIWALI festival', startDate: '2026-10-10', venue: 'Celebration  Square', city: 'Mississauga', description: 'More detail', url: 'https://x.org/d', uid: 'b' }, { id: 'b', name: 'Source B', priority: 1 });
  const c = Core.normalizeEvent({ title: 'Diwali Festival', startDate: '2026-10-11', venue: 'Celebration Square', city: 'Mississauga', uid: 'c' }, { id: 'a', name: 'Source A' });
  const out = Core.dedupe([a, b, c]);
  assert.strictEqual(out.length, 2);
  const m = out.find(e => e.startDate === '2026-10-10');
  assert.strictEqual(m.sources.length, 2);
  assert.strictEqual(m.description, 'More detail'); // gap filled
  assert.strictEqual(m.startTime, '12:00');
  // record without venue merges into same-title/date/city record that has a venue
  const d = Core.normalizeEvent({ title: 'Diwali Festival', startDate: '2026-10-10', city: 'Mississauga', uid: 'd' }, { id: 'd', name: 'Source D' });
  assert.strictEqual(Core.dedupe([a, d]).length, 1);
});

test('date ranges for Monday 2026-09-21', () => {
  const t = '2026-09-21';
  assert.deepStrictEqual(Core.dateRange('today', t), [t, t]);
  assert.deepStrictEqual(Core.dateRange('weekend', t), ['2026-09-26', '2026-09-27']);
  assert.deepStrictEqual(Core.dateRange('week', t), [t, '2026-09-27']);
  assert.deepStrictEqual(Core.dateRange('nextweek', t), ['2026-09-28', '2026-10-04']);
  assert.deepStrictEqual(Core.dateRange('month', t), [t, '2026-09-30']);
  assert.deepStrictEqual(Core.dateRange('next7', t), [t, '2026-09-27']);
  assert.deepStrictEqual(Core.dateRange('next14', t), [t, '2026-10-04']);
  assert.deepStrictEqual(Core.dateRange('weekend', '2026-09-27'), ['2026-09-27', '2026-09-27']); // Sunday
  assert.deepStrictEqual(Core.dateRange('weekend', '2026-09-26'), ['2026-09-26', '2026-09-27']); // Saturday
  assert.deepStrictEqual(Core.dateRange('week', '2026-09-27'), ['2026-09-27', '2026-09-27']);
});

test('long-running events only match on start day unless included', () => {
  const ev = { startDate: '2026-10-01', endDate: '2026-11-30' };
  assert.ok(Core.isLongRunning(ev));
  assert.ok(!Core.inWindow(ev, '2026-10-10', '2026-10-12', false));
  assert.ok(Core.inWindow(ev, '2026-10-10', '2026-10-12', true));
  assert.ok(Core.inWindow(ev, '2026-10-01', '2026-10-01', false));
  const weekend = { startDate: '2026-10-09', endDate: '2026-10-11' };
  assert.ok(Core.inWindow(weekend, '2026-10-10', '2026-10-10', false));
});

test('search: all tokens, accent/case insensitive', () => {
  const ev = Core.normalizeEvent({ title: 'Diwali Célébration', startDate: '2026-10-10', venue: 'Celebration Square', city: 'Brampton' }, SRC);
  assert.ok(Core.matchesQuery(ev, Core.queryTokens('diwali brampton')));
  assert.ok(Core.matchesQuery(ev, Core.queryTokens('CELEBRATION')));
  assert.ok(!Core.matchesQuery(ev, Core.queryTokens('diwali toronto')));
});

test('freshness levels', () => {
  const now = new Date('2026-09-21T12:00:00Z');
  assert.strictEqual(Core.freshness('2026-09-21T08:00:00Z', now).level, 'green');
  assert.strictEqual(Core.freshness('2026-09-18T08:00:00Z', now).level, 'yellow');
  assert.strictEqual(Core.freshness('2026-09-15T08:00:00Z', now).level, 'orange');
  assert.strictEqual(Core.freshness('2026-09-10T08:00:00Z', now).level, 'red');
  assert.strictEqual(Core.freshness(null, now).level, 'red');
  assert.strictEqual(Core.nextRefresh('2026-09-21T12:00:00Z', 7).toISOString(), '2026-09-28T12:00:00.000Z');
});

test('calendar export: Google URL and ICS (UTC, folding, escaping, all-day)', () => {
  const ev = Core.normalizeEvent({ title: 'Live, Music; Night', startDate: '2026-09-26', startTime: '19:00', endTime: '22:00', venue: 'Hall', city: 'Mississauga', url: 'https://x.org/e' }, SRC);
  const g = Core.googleCalendarUrl(ev);
  assert.ok(g.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE'));
  assert.ok(g.includes('dates=20260926T230000Z%2F20260927T020000Z')); // 19:00–22:00 EDT
  const ics = Core.buildICS([ev, Core.normalizeEvent(Core.parseICS(ICS)[1], SRC)], 'Test');
  assert.ok(ics.includes('BEGIN:VCALENDAR') && ics.includes('END:VCALENDAR'));
  assert.ok(ics.includes('SUMMARY:Live\\, Music\\; Night'));
  assert.ok(ics.includes('DTSTART:20260926T230000Z'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261003') && ics.includes('DTEND;VALUE=DATE:20261004'));
  ics.split('\r\n').forEach(l => assert.ok(l.length <= 75, 'line too long: ' + l.length));
});

test('DST: winter offset (EST) is handled', () => {
  const ev = { title: 'x', startDate: '2026-12-05', startTime: '19:00', endTime: '21:00', id: '1' };
  assert.strictEqual(Core.eventInstants(ev).start, '20261206T000000Z');
});

test('Tribe Events REST parsing', () => {
  const json = { events: [{ id: 7, title: 'Taste of Cooksville &amp; More', start_date: '2026-09-19 11:00:00', end_date: '2026-09-20 20:00:00', all_day: false, timezone: 'America/Toronto',
    url: 'https://x.org/e/7', cost: 'Free', categories: [{ name: 'Food &amp; Drink' }], venue: { venue: 'Cooksville Four Corners', city: 'Mississauga', address: 'Hurontario St', zip: 'l5a 1a1' }, image: { url: 'https://x.org/i.jpg' }, featured: true }], next_rest_url: null };
  const raw = Core.parseTribe(json);
  assert.strictEqual(raw[0].title, 'Taste of Cooksville & More');
  const ev = Core.normalizeEvent(raw[0], SRC);
  assert.strictEqual(ev.isFree, true); assert.strictEqual(ev.postalCode, 'L5A 1A1'); assert.strictEqual(ev.featured, true);
  assert.strictEqual(ev.endDate, '2026-09-20');
});

test('RSS with explicit event dates; items without dates are skipped', () => {
  const xml = '<rss><channel><item><title>A</title><link>https://x.org/a</link><ev:startdate>2026-10-05T18:00:00</ev:startdate><category>Music</category></item><item><title>No date</title><link>https://x.org/b</link></item></channel></rss>';
  const r = Core.parseRSS(xml);
  assert.strictEqual(r.length, 1); assert.strictEqual(r[0].startTime, '18:00');
});

test('JSON-LD and mapped JSON', () => {
  const ld = Core.parseJsonLd([{ '@type': 'Event', name: 'Fest', startDate: '2026-10-05T18:00:00-04:00', location: { name: 'Park', address: { addressLocality: 'Milton' } }, offers: { price: 0 } }]);
  assert.strictEqual(ld[0].startTime, '18:00'); assert.strictEqual(Core.normalizeEvent(ld[0], SRC).isFree, true);
  const mj = Core.parseMappedJson({ data: [{ n: 'X', s: '2026-10-05 10:00', v: 'Hall' }] }, { itemsPath: 'data', fields: { title: 'n', start: 's', venue: 'v' } });
  assert.strictEqual(mj[0].title, 'X');
});

test('RRULE weekly expansion', () => {
  const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:r\r\nDTSTART;TZID=America/Toronto:20261005T180000\r\nDTEND;TZID=America/Toronto:20261005T190000\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nSUMMARY:Weekly\r\nEND:VEVENT\r\nEND:VCALENDAR';
  const r = Core.parseICS(ics);
  assert.deepStrictEqual(r.map(x => x.startDate), ['2026-10-05', '2026-10-12', '2026-10-19']);
});

test('robots.txt parsing', () => {
  const txt = 'User-agent: *\nDisallow: /private/\nAllow: /private/ok\n';
  assert.ok(Core.robotsAllows(txt, '/events/'));
  assert.ok(!Core.robotsAllows(txt, '/private/x'));
  assert.ok(Core.robotsAllows(txt, '/private/ok'));
  assert.ok(!Core.robotsAllows('User-agent: *\nDisallow: /', '/anything'));
  assert.ok(Core.robotsAllows('', '/x'));
});

test('city helpers and regions', () => {
  assert.strictEqual(Core.regionOf('Etobicoke'), 'Toronto');
  assert.strictEqual(Core.regionOf('Whitby'), 'Durham');
  assert.strictEqual(Core.regionOf('Caledon'), 'Other');
  assert.strictEqual(Core.detectCity('123 Main St, Richmond Hill, ON'), 'Richmond Hill');
  assert.ok(Core.haversineKm(43.589, -79.644, 43.653, -79.383) > 20);
});

test('collector: tribe feed falls back to ICS when the primary fails; source failure surfaces', async () => {
  const calls = [];
  const fakeFetch = async url => {
    calls.push(url);
    if (url.includes('wp-json')) return { ok: false, status: 404, text: async () => '' };
    return { ok: true, status: 200, text: async () => ICS };
  };
  const src = { id: 'x', name: 'X', city: 'Mississauga', kind: 'tourism', priority: 1, type: 'tribe', url: 'https://x.org/wp-json/tribe/events/v1/events', fallback: { type: 'ics', url: 'https://x.org/?ical=1' } };
  const ctx = Collector.makeContext({ now: new Date('2026-09-21T12:00:00Z'), fetch: fakeFetch, isBrowser: false });
  const res = await Collector.collectSource(src, ctx);
  assert.strictEqual(res.via, 'ics'); assert.strictEqual(res.events.length, 3);
  const bad = { id: 'y', name: 'Y', type: 'ics', url: 'https://y.org/a.ics' };
  await assert.rejects(Collector.collectSource(bad, Collector.makeContext({ fetch: async () => ({ ok: false, status: 500, text: async () => '' }) })), /HTTP 500/);
});

test('manual events', () => {
  const ctx = Collector.makeContext({ now: new Date('2026-09-21T12:00:00Z') });
  const out = Collector.collectManual([{ title: 'Neighbourhood BBQ', startDate: '2026-10-03', startTime: '12:00', city: 'Milton', url: 'https://example.org/bbq', categories: ['Food & Drink'] }, { title: 'Old', startDate: '2026-01-01' }], ctx);
  assert.strictEqual(out.length, 1); assert.strictEqual(out[0].source, 'Added manually');
});

test('demo data: labelled, no URLs, contains dedupe example and every collection has events', () => {
  const d = Demo.build('2026-09-21');
  assert.ok(d.every(e => e.demo === true && !e.url));
  const out = Core.dedupe(d);
  assert.strictEqual(out.length, d.length - 1);
  const cats = new Set(); out.forEach(e => e.categories.forEach(c => cats.add(c)));
  ['Family & Kids', 'Music', 'Sports', 'Nature & Outdoors', 'Business', 'Workshops', 'Free Events', 'Arts', 'Theatre'].forEach(c => assert.ok(cats.has(c), c));
});
