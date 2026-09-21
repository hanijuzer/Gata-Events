/*!
 * GTA Events Hub — demo-data.js
 * FICTIONAL sample events so the interface works before any live source is configured.
 * Every record has demo: true and the source "Demo data (fictional)". Venue names contain "Demo".
 * Dates are generated relative to today so the demo never looks stale. Deterministic — no randomness.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.GTADemo = factory(root.GTACore);
})(typeof self !== 'undefined' ? self : this, function (Core) {
  'use strict';

  // [dayOffset, start, end, title, venue, city, categories[], price, extra]
  // price: 0 = free, number = dollars, null = not provided
  const T = [
    [0, '18:30', '20:00', 'Sample Community Cleanup Night', 'Demo Park Pavilion', 'Mississauga', ['Community', 'Nature & Outdoors'], 0],
    [0, '19:00', '22:00', 'Sample Live Music Night', 'Demo Arts Centre', 'Mississauga', ['Music', 'Concerts'], 0],
    [1, '10:00', '11:00', 'Sample Toddler Storytime', 'Demo Library Branch', 'Brampton', ['Library', 'Family & Kids'], 0],
    [1, '18:00', '21:00', 'Sample Startup Networking Mixer', 'Demo Innovation Hub', 'Markham', ['Networking', 'Business'], 15],
    [2, '12:00', '15:00', 'Sample Family Craft Afternoon', 'Demo Community Centre', 'Oakville', ['Family & Kids', 'Workshops'], 8],
    [2, '19:30', '21:30', 'Sample Comedy Showcase', 'Demo Theatre', 'Toronto', ['Comedy'], 25],
    [3, '09:00', '12:00', 'Sample Beginner Yoga in the Park', 'Demo Lakeside Park', 'Burlington', ['Health & Fitness', 'Parks'], 0],
    [3, '18:00', '20:00', 'Sample Intro to Coding Workshop', 'Demo Public Library', 'Vaughan', ['Technology', 'Workshops', 'Education'], 0],
    [4, '17:00', '21:00', 'Sample Night Market', 'Demo Town Square', 'Milton', ['Food & Drink', 'Shopping'], 0],
    [4, '20:00', '23:00', 'Sample Jazz Evening', 'Demo Jazz Room', 'Toronto', ['Music'], 30],
    [5, '10:00', '16:00', 'Sample Farmers Market', 'Demo Market Grounds', 'Mississauga', ['Farmers Markets', 'Food & Drink'], 0],
    [5, '11:00', '14:00', 'Sample Diwali Cultural Celebration', 'Demo Celebration Square', 'Mississauga', ['Religious/Cultural celebrations', 'Festivals'], 0],
    [5, '13:00', '17:00', 'Sample Diwali Community Fair', 'Demo Convention Hall', 'Brampton', ['Religious/Cultural celebrations', 'Community'], 5],
    [5, '19:00', '22:00', 'Sample Diwali Cultural Night', 'Demo Cultural Centre', 'Toronto', ['Cultural', 'Religious/Cultural celebrations'], 20],
    [5, '18:00', '20:00', 'Sample Youth Soccer Tournament', 'Demo Sports Complex', 'Ajax', ['Sports', 'Family & Kids'], 0],
    [6, '10:00', '14:00', 'Sample Trail Hike and Nature Walk', 'Demo Conservation Area', 'Halton Hills', ['Nature & Outdoors'], 0],
    [6, '14:00', '16:00', 'Sample Classical Afternoon Concert', 'Demo Concert Hall', 'Richmond Hill', ['Concerts', 'Music'], 35],
    [6, '11:00', '17:00', 'Sample Craft Beer Weekend', 'Demo Brewery Grounds', 'Oshawa', ['Food & Drink'], 12],
    [7, '18:30', '20:30', 'Sample Career Fair Info Session', 'Demo College Atrium', 'Oakville', ['Career', 'Education'], 0],
    [8, '19:00', '21:00', 'Sample Local Film Screening', 'Demo Cinema House', 'Pickering', ['Movies'], 12],
    [9, '17:30', '19:00', 'Sample Seniors Wellness Talk', 'Demo Seniors Centre', 'Whitby', ['Health & Fitness', 'Community'], 0],
    [10, '10:00', '12:00', 'Sample Kids Science Saturday', 'Demo Science Room', 'Burlington', ['Family & Kids', 'Education'], 10],
    [10, '18:00', '22:00', 'Sample Harvest Food Festival', 'Demo Festival Grounds', 'Vaughan', ['Festivals', 'Food & Drink'], 0],
    [11, '13:00', '16:00', 'Sample Art Studio Open House', 'Demo Art Studio', 'Milton', ['Arts', 'Exhibitions'], 0],
    [12, '19:00', '21:00', 'Sample Business Breakfast Talk', 'Demo Chamber Hall', 'Markham', ['Business', 'Networking'], 45],
    [13, '18:00', '21:00', 'Sample Halloween Family Bash', 'Demo Community Park', 'Brampton', ['Holiday Events', 'Family & Kids'], 0],
    [14, '19:30', '22:00', 'Sample Theatre Opening Night', 'Demo Playhouse', 'Toronto', ['Theatre', 'Arts'], 65],
    [15, '09:00', '13:00', 'Sample 5K Fun Run', 'Demo Waterfront Trail', 'Mississauga', ['Sports', 'Health & Fitness'], 30],
    [16, '18:00', '20:00', 'Sample Town Hall Public Meeting', 'Demo Civic Centre', 'Newmarket', ['Government/Community'], 0],
    [17, '12:00', '18:00', 'Sample Holiday Craft Market', 'Demo Arena', 'Oakville', ['Holiday Events', 'Shopping'], 3],
    [18, '19:00', '21:30', 'Sample Choir Concert', 'Demo Community Church Hall', 'Georgetown', ['Concerts', 'Music'], 20],
    [20, '10:00', '15:00', 'Sample Indigenous Cultural Gathering', 'Demo University Grounds', 'Mississauga', ['Cultural', 'Community'], 0],
    [22, '18:00', '20:00', 'Sample Coding for Kids Workshop', 'Demo Tech Lab', 'Richmond Hill', ['Technology', 'Family & Kids', 'Workshops'], 55],
    [24, '20:00', '23:00', 'Sample Open Mic Night', 'Demo Cafe Stage', 'Pickering', ['Music', 'Community'], 0],
    [26, '11:00', '16:00', 'Sample Museum Family Day', 'Demo Local Museum', 'Burlington', ['Museum', 'Family & Kids'], 0],
    [28, '18:00', '21:00', 'Sample Wine Tasting Night', 'Demo Wine Bar', 'Whitby', ['Food & Drink'], 40],
    [30, '10:00', '17:00', 'Sample Regional Trade Expo', 'Demo Expo Centre', 'Mississauga', ['Business'], 20]
  ];

  function build(baseDate) {
    baseDate = baseDate || Core.todayStr();
    const src = { id: 'demo', name: 'Demo data (fictional)', kind: 'demo', priority: 9, official: false };
    const nowIso = new Date().toISOString();
    const out = [];
    T.forEach((t, i) => {
      const [off, st, en, title, venue, city, cats, price] = t;
      const d = Core.addDays(baseDate, off);
      const raw = {
        uid: 'demo-' + i, title, startDate: d, startTime: st, endDate: d, endTime: en, venue, city,
        sourceCategories: cats, description: 'DEMO DATA \u2014 this is a fictional sample event used to show how the interface looks. It is not a real event.',
        priceText: price === 0 ? 'Free' : (price === null ? '' : '$' + price), demo: true
      };
      const ev = Core.normalizeEvent(raw, src, nowIso);
      if (ev) out.push(ev);
    });
    // one multi-day event and one long-running exhibit
    [
      { uid: 'demo-multi', title: 'Sample Weekend Arts Festival', startDate: Core.addDays(baseDate, 12), endDate: Core.addDays(baseDate, 14), startTime: '11:00', endTime: '20:00', venue: 'Demo Festival Grounds', city: 'Mississauga', sourceCategories: ['Festivals', 'Arts'], priceText: 'Free' },
      { uid: 'demo-long', title: 'Sample Photography Exhibition', startDate: Core.addDays(baseDate, 2), endDate: Core.addDays(baseDate, 58), startTime: '10:00', endTime: '17:00', venue: 'Demo Gallery', city: 'Oakville', sourceCategories: ['Exhibitions', 'Arts'], priceText: '$10' }
    ].forEach(r => {
      r.description = 'DEMO DATA \u2014 fictional sample event.'; r.demo = true;
      const ev = Core.normalizeEvent(r, src, nowIso); if (ev) out.push(ev);
    });
    // a deliberate duplicate (same title/date/venue) from a second demo "source" to show de-duplication
    const dupBase = out.find(e => e.title === 'Sample Live Music Night');
    if (dupBase) out.push(Object.assign({}, dupBase, { id: Core.fnv1a('demo-dup'), source: 'Demo data (second listing)', sources: undefined, description: dupBase.description }));
    return out;
  }

  return { build };
});
