// Voor het hoofdstuk "Vrienden": een nagebootste server. Staat alleen aan als de set dat vraagt (sessionStorage 'film-social' = '1') en doet dan alsof
// Sam is ingelogd, met een paar vrienden. De app praat met "http://localhost:54321" (de lokale Supabase); die verzoeken vangen we hier op.
// Er gaat niets naar een echte server. Geladen vóór alle andere scripts van de app (zie server.mjs).
(() => {
  let on = false;
  try { on = sessionStorage.getItem('film-social') === '1'; } catch { /* geen opslag: dan geen nepserver */ }
  if (!on) return;

  const USER = { id: '5a1f0000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'sam@voorbeeld.nl', app_metadata: { provider: 'email' }, user_metadata: { given_name: 'Sam' }, created_at: '2026-08-01T08:00:00Z' };
  const b64 = (value) => btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expires = nowSeconds + 60 * 60 * 24 * 30;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, role: 'authenticated', iat: nowSeconds, exp: expires })}.film`;
  localStorage.setItem('sb-localhost-auth-token', JSON.stringify({ access_token: token, token_type: 'bearer', expires_in: 60 * 60 * 24 * 30, expires_at: expires, refresh_token: 'film', user: USER }));

  const day = (offset) => {
    const d = new Date(Date.now() - offset * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const person = (n, username, name) => ({ user_id: `5a1f0000-0000-4000-8000-00000000000${n}`, username, display_name: name });
  const FRIENDS = [
    { ...person(2, 'anna.k', 'Anna'), state: 'friend', since: '2026-09-01T10:00:00Z' },
    { ...person(3, 'bram', 'Bram'), state: 'friend', since: '2026-09-03T10:00:00Z' },
    { ...person(4, 'cor.v', 'Cor'), state: 'friend', since: '2026-09-10T10:00:00Z' },
    { ...person(5, 'fien', 'Fien'), state: 'friend', since: '2026-09-12T10:00:00Z' },
    { ...person(6, 'dora', 'Dora'), state: 'incoming', since: day(1) },
    { ...person(7, 'eef', 'Eef'), state: 'outgoing', since: day(2) },
  ];
  const BOARD = [
    { ...person(1, 'sam', 'Sam'), points: 0, done: 0, streak: 0, active_habits: 10, last_active: day(0), as_of: day(0), is_me: true },
    { ...person(2, 'anna.k', 'Anna'), points: 395, done: 38, streak: 12, active_habits: 4, last_active: day(0), as_of: day(0), is_me: false },
    { ...person(3, 'bram', 'Bram'), points: 260, done: 25, streak: 5, active_habits: 3, last_active: day(1), as_of: day(1), is_me: false },
    { ...person(4, 'cor.v', 'Cor'), points: 95, done: 9, streak: 1, active_habits: 2, last_active: day(2), as_of: day(2), is_me: false },
    { ...person(5, 'fien', 'Fien'), points: 150, done: 15, streak: 0, active_habits: 2, last_active: day(10), as_of: day(10), is_me: false },
  ];

  const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
  const rpc = (fn, args) => {
    switch (fn) {
      case 'social_me': return json({ username: 'sam', display_name: 'Sam', enabled: true });
      case 'friend_list': return json(FRIENDS);
      case 'leaderboard': return json(BOARD);
      case 'invite_list': return json([]);
      case 'social_find': return json(String(args?.p_username ?? '').toLowerCase() === 'mila' ? [{ id: '5a1f0000-0000-4000-8000-000000000009', username: 'mila', display_name: 'Mila', relation: 'none' }] : []);
      case 'friend_request': return json({ status: 'pending' });
      case 'publish_summary': return new Response(null, { status: 204 });
      case 'app_is_admin': return json(false);
      default: return json({ message: `niet nagebootst: ${fn}`, code: 'PGRST202' }, 404);
    }
  };

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const request = typeof input === 'string' || input instanceof URL ? null : input;
    const url = new URL(request ? request.url : String(input), location.href);
    if (url.port !== '54321') return realFetch(input, init);
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    if (url.pathname === '/auth/v1/user') return json(USER);
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      let args = {};
      try { args = JSON.parse(init?.body ?? (request ? await request.clone().text() : '{}')) ?? {}; } catch { /* geen argumenten */ }
      return rpc(url.pathname.split('/').pop(), args);
    }
    if (url.pathname === '/rest/v1/records') return method === 'GET' ? json([], 200, { 'content-range': '*/0' }) : new Response(null, { status: 201 });
    return json({ message: 'niet nagebootst' }, 404);
  };
})();
