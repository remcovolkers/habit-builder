// Controleert de ECHTE Supabase (zonder in te loggen) nadat supabase/migrations/0001_init.sql is uitgevoerd.
// Gebruik: node tools/live-check.mjs
// Wat het bewijst: de migratie staat erop, ping() werkt voor iedereen, en een niet-ingelogde bezoeker kan niets
// lezen, schrijven of verwijderen. (Dat gebruikers elkaars data niet zien is gecontroleerd in supabase/tests.)
import { config } from '../src/config.js';

const { supabaseUrl: url, supabasePublishableKey: key } = config;
const headers = { apikey: key, 'Content-Type': 'application/json' };
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : `  -> ${detail}`}`);
};
const call = async (path, init = {}) => {
  const response = await fetch(`${url}${path}`, { headers, ...init });
  const text = await response.text();
  let body = text;
  try { body = JSON.parse(text); } catch { /* geen JSON */ }
  return { status: response.status, body };
};

const ping = await call('/rest/v1/rpc/ping', { method: 'POST', body: '{}' });
check('ping() antwoordt "ok" (migratie is uitgevoerd)', ping.status === 200 && ping.body === 'ok', `${ping.status} ${JSON.stringify(ping.body)}`);

const read = await call('/rest/v1/records?select=id&limit=1');
check('zonder in te loggen is er niets te lezen', (read.status === 200 && Array.isArray(read.body) && read.body.length === 0) || [401, 403].includes(read.status), `${read.status} ${JSON.stringify(read.body)}`);

const write = await call('/rest/v1/records', {
  method: 'POST',
  body: JSON.stringify({ user_id: '00000000-0000-0000-0000-000000000000', collection: 'habits', id: 'live-check', data: {} }),
});
check('zonder in te loggen is schrijven geweigerd', [401, 403].includes(write.status), `${write.status} ${JSON.stringify(write.body)}`);

const remove = await call('/rest/v1/records?id=eq.live-check', { method: 'DELETE' });
check('zonder in te loggen is verwijderen geweigerd of een no-op', [401, 403, 200, 204].includes(remove.status) && !(Array.isArray(remove.body) && remove.body.length > 0), `${remove.status} ${JSON.stringify(remove.body)}`);

const del = await call('/rest/v1/rpc/delete_my_account', { method: 'POST', body: '{}' });
check('delete_my_account is niet aan te roepen zonder in te loggen', [401, 403, 404].includes(del.status) || (del.body && del.body.code === '42501'), `${del.status} ${JSON.stringify(del.body)}`);

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} geslaagd`);
process.exit(failed ? 1 : 0);
