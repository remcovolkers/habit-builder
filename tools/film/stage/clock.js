// Nepklok: zet "nu" op een vaste tijd op de echte datum (of op ?now=2026-10-23T09:05 in de adresbalk of in window.name van de set).
// Wordt in de app geladen (via tools/film/server.mjs) én in de set zelf, zodat beide dezelfde dag zien.
(() => {
  const RealDate = Date;
  const params = new URLSearchParams(location.search);
  const wanted = params.get('now') ?? (() => { try { return sessionStorage.getItem('film-now'); } catch { return null; } })();
  const real = new RealDate();
  const [datePart, timePart = '08:12'] = (wanted ?? '').split('T');
  const [h, m] = timePart.split(':').map(Number);
  const target = datePart ? new RealDate(`${datePart}T${timePart}:00`) : new RealDate(real.getFullYear(), real.getMonth(), real.getDate(), h, m, 0);
  const offset = target.getTime() - real.getTime();
  class FakeDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [RealDate.now() + offset])); }
    static now() { return RealDate.now() + offset; }
  }
  globalThis.Date = FakeDate;
  globalThis.__filmClock = { offset, now: () => new RealDate(RealDate.now() + offset) };
})();
