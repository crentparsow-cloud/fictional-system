// Akana locale: works out which market a reader sees (currency, crisis numbers, Amazon store, copy locale).
// Order of trust: the reader's own choice (manual), then the phone's location (device, only if they allow it), then the network (ip).
// Only a two-letter country code is ever saved. Coordinates are sent once to /api/locale/geo and are not stored.
(function () {
  const KEY = "akana-market";
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (_) { return null; } };
  const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) {} };

  async function fromNetwork() {
    const r = await fetch("/api/locale", { cache: "no-store" });
    if (!r.ok) throw new Error("locale_unavailable");
    return r.json();
  }
  function fromDevice() {
    return new Promise((resolve, reject) => {
      if (!("geolocation" in navigator)) return reject(new Error("no_geolocation"));
      navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
          const r = await fetch("/api/locale/geo", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat: Math.round(pos.coords.latitude * 10) / 10, lon: Math.round(pos.coords.longitude * 10) / 10 }) });
          resolve(await r.json());
        } catch (e) { reject(e); }
      }, reject, { enableHighAccuracy: false, maximumAge: 86400000, timeout: 10000 });
    });
  }
  // Save the country on the reader's profile, if signed in. sb is the Supabase client.
  async function saveProfile(sb, country, source) {
    if (!sb) return;
    const { data } = await sb.auth.getUser();
    if (!data || !data.user) return;
    await sb.from("profiles").update({ country, country_source: source, country_set_at: new Date().toISOString() }).eq("id", data.user.id);
  }

  const Locale = {
    current: () => read(),
    // Called on start-up. Keeps a manual or device choice; otherwise refreshes from the network.
    async init(sb) {
      const saved = read();
      if (saved && (saved.source === "manual" || saved.source === "device")) return saved;
      try { const net = await fromNetwork(); write(net); await saveProfile(sb, net.country, "ip"); return net; }
      catch (_) { return saved || { country: null, source: "ip", market: null }; }
    },
    // Called only when the reader taps "Use my location". The phone shows its own permission prompt.
    async useDevice(sb) {
      const r = await fromDevice();
      write(r); await saveProfile(sb, r.country, r.source);
      return r;
    },
    // Called from Settings > Region.
    async choose(sb, country) {
      const net = await fetch("/api/locale", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
      const r = { country, source: "manual", market: null };
      if (net) { r.market = net.market && net.market.code === country ? net.market : null; }
      write(r); await saveProfile(sb, country, "manual");
      return r;
    },
    goLink(book, format, placement) {
      const s = read();
      const q = new URLSearchParams({ p: placement || "app" });
      if (s && s.source === "manual" && s.country) q.set("s", s.country);
      return `/go/${book}/${format}?${q}`;
    },
  };
  window.AkanaLocale = Locale;
})();
