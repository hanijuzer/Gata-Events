/**
 * OPTIONAL free CORS proxy for the browser "Refresh events" button (Cloudflare Workers free plan).
 * You do NOT need this if you use the weekly GitHub Actions job — that already reads the feeds server-side.
 *
 * Why it exists: browsers refuse to read most other websites' feeds directly (CORS). This tiny worker fetches
 * a feed on your behalf and adds the header that lets your site read it.
 *
 * SAFETY: it is NOT an open proxy. It only fetches hosts listed in ALLOWED_HOSTS, only via GET, and only
 * answers requests coming from ALLOWED_ORIGIN (your site). Edit both lines below before deploying.
 *
 * Setup: dash.cloudflare.com → Workers & Pages → Create Worker → paste this → Deploy.
 * Then in sources.js set  CORS_PROXY: 'https://YOUR-WORKER.YOUR-NAME.workers.dev/?url='
 */
const ALLOWED_ORIGIN = 'https://YOUR-USERNAME.github.io';
const ALLOWED_HOSTS = [
  'www.visitmississauga.ca',
  'downtownbramptonbia.ca',
  'tourismburlington.ca',
  'burlingtondowntown.ca'
];

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? origin : 'null',
      'Access-Control-Allow-Methods': 'GET',
      'Vary': 'Origin'
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET' || origin !== ALLOWED_ORIGIN) return new Response('Forbidden', { status: 403, headers: cors });

    const target = new URL(request.url).searchParams.get('url');
    let u;
    try { u = new URL(target); } catch (_) { return new Response('Bad url', { status: 400, headers: cors }); }
    if (u.protocol !== 'https:' || ALLOWED_HOSTS.indexOf(u.hostname) === -1) return new Response('Host not allowed', { status: 403, headers: cors });

    const upstream = await fetch(u.toString(), {
      headers: { 'User-Agent': 'GTAEventsHub/1.0 (+community event aggregator)', 'Accept': request.headers.get('Accept') || '*/*' },
      cf: { cacheTtl: 3600, cacheEverything: true }
    });
    const type = upstream.headers.get('Content-Type') || '';
    if (!/(json|calendar|xml|text\/plain)/i.test(type)) return new Response('Unsupported content type', { status: 415, headers: cors });
    return new Response(upstream.body, { status: upstream.status, headers: Object.assign({ 'Content-Type': type, 'Cache-Control': 'public, max-age=3600' }, cors) });
  }
};
