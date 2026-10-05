// Akana edge worker (Cloudflare Pages advanced mode). Built into app/dist/_worker.js by tools/build_app.py.
// Routes:
//   GET  /api/locale            country from the network, and the market it maps to
//   POST /api/locale/geo        {lat, lon} from the phone, reduced to a country code; coordinates are not stored or logged
//   GET  /go/{book}/{format}    redirect to the right Amazon store, with one anonymous daily count
// Everything else is served from the static app.
const DATA = __DATA__;
const SUPABASE_URL = "https://mcehwfsvtzeayluabxyj.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_QTCkAX0I9edLx_owFXf75A_qCO0Zp6f";

const SECURITY = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://mcehwfsvtzeayluabxyj.supabase.co; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
  "Strict-Transport-Security": "max-age=31536000",
};
const withSecurity = (res, extra = {}) => {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries({ ...SECURITY, ...extra })) r.headers.set(k, v);
  return r;
};
const json = (body, status = 200) =>
  withSecurity(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }), { "Cache-Control": "private, no-store" });

const marketCode = (c) => (c && DATA.markets[String(c).toUpperCase()] ? String(c).toUpperCase() : "XX");
const market = (c) => ({ code: marketCode(c), ...DATA.markets[marketCode(c)] });

// Point in polygon (ray casting) over simplified country outlines.
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function countryFromPoint(lat, lon) {
  for (const [code, rings] of Object.entries(DATA.polys)) {
    for (const ring of rings) if (inRing(lon, lat, ring)) return code;
  }
  return null;
}

async function logClick(book, format, store, placement) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/log_book_click`, {
      method: "POST",
      headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${PUBLISHABLE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_book: book, p_format: format, p_store: store, p_placement: placement }),
    });
  } catch (_) { /* a lost count never blocks the reader */ }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const netCountry = request.cf && request.cf.country;

    if (url.pathname === "/api/locale" && request.method === "GET") {
      return json({ country: netCountry || null, source: "ip", market: market(netCountry) });
    }

    if (url.pathname === "/api/locale/geo" && request.method === "POST") {
      let body = {};
      try { body = await request.json(); } catch (_) {}
      const lat = Number(body.lat), lon = Number(body.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return json({ error: "bad_coordinates" }, 400);
      const found = countryFromPoint(lat, lon);
      const country = found || netCountry || null;
      return json({ country, source: found ? "device" : "ip", market: market(country) });
    }

    const go = url.pathname.match(/^\/go\/([a-z0-9-]{2,60})\/(kindle|paperback)\/?$/);
    if (go && request.method === "GET") {
      const [, book, format] = go;
      const asin = DATA.asins[book] && DATA.asins[book][format];
      if (!asin) return withSecurity(Response.redirect(`${url.origin}/#books`, 302), { "Cache-Control": "no-store" });
      const chosen = url.searchParams.get("s");  // the reader's own region setting wins
      const m = market(chosen && /^[A-Za-z]{2}$/.test(chosen) ? chosen : netCountry);
      const placement = (url.searchParams.get("p") || "unknown").replace(/[^a-z0-9_-]/gi, "").slice(0, 24);
      ctx.waitUntil(logClick(book, format, m.amazon, placement));
      return withSecurity(new Response(null, { status: 302, headers: { Location: `https://www.${m.amazon}/dp/${asin}` } }), { "Cache-Control": "no-store" });
    }

    const res = await env.ASSETS.fetch(request);
    const extra = {};
    if (url.pathname === "/" || url.pathname.endsWith("/sw.js") || url.pathname.endsWith(".html")) extra["Cache-Control"] = "no-cache";
    if (url.pathname.startsWith("/covers/")) extra["Cache-Control"] = "public, max-age=604800";
    return withSecurity(res, extra);
  },
};
