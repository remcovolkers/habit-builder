// Controleert de ECHTE Supabase (zonder in te loggen) nadat supabase/migrations/0001_init.sql is uitgevoerd.
// Gebruik: node tools/live-check.mjs          (productie)
//          node tools/live-check.mjs --dev    (het ontwikkelproject, zie docs/DEV-OMGEVING.md)
// Wat het bewijst: de migratie staat erop, ping() werkt voor iedereen, en een niet-ingelogde bezoeker kan niets
// lezen, schrijven of verwijderen. (Dat gebruikers elkaars data niet zien is gecontroleerd in supabase/tests.)
import { config, pickEnvironment } from '../src/config.js';

const target = process.argv.includes('--dev') ? pickEnvironment('localhost') : config;
if (process.argv.includes('--dev') && target.environment !== 'development') {
  console.error('Het ontwikkelproject is nog niet ingevuld in src/config.js (zie docs/DEV-OMGEVING.md).');
  process.exit(2);
}
console.log(`Omgeving: ${target.environment} (${target.supabaseUrl})\n`);
const { supabaseUrl: url, supabasePublishableKey: key } = target;
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

// Vrienden en ranglijst (migratie 0003): zonder in te loggen is niets bruikbaar. Is de migratie er nog niet, dan staat dat erbij (geen fout:
// de app kent dan de status "unavailable"); is hij er wel, dan moet alles dicht zijn.
const social = await call('/rest/v1/rpc/social_find', { method: 'POST', body: JSON.stringify({ p_username: 'test' }) });
if ([404].includes(social.status) || social.body?.code === 'PGRST202') {
  console.log('--   vrienden en ranglijst: migratie 0003 is hier nog niet uitgevoerd (de app blijft dan stil)');
} else {
  check('vrienden: zonder in te loggen is social_find niet aan te roepen', [401, 403].includes(social.status) || social.body?.code === '42501', `${social.status} ${JSON.stringify(social.body)}`);
  for (const fn of ['leaderboard', 'friend_list', 'invite_create', 'social_me']) {
    const r = await call(`/rest/v1/rpc/${fn}`, { method: 'POST', body: '{}' });
    check(`vrienden: zonder in te loggen is ${fn} niet aan te roepen`, [401, 403].includes(r.status) || r.body?.code === '42501', `${r.status} ${JSON.stringify(r.body)}`);
  }
  for (const table of ['social_profiles', 'friendships', 'invite_codes', 'score_summaries', 'social_rate']) {
    const r = await call(`/rest/v1/${table}?select=*&limit=1`);
    check(`vrienden: de tabel ${table} is zonder in te loggen niet te lezen`, [401, 403].includes(r.status) || (r.status === 200 && Array.isArray(r.body) && r.body.length === 0), `${r.status} ${JSON.stringify(r.body)}`);
  }
}

// Uitnodigingen (migratie 0005): de voorvertoning mag zonder in te loggen, en geeft voor een verzonnen code alleen {status: invalid}.
// Ontbreekt de functie, dan is de migratie er nog niet: de app valt dan terug op de oude flow (met een melding), dus dat is geen fout.
const peek = await call('/rest/v1/rpc/invite_peek', { method: 'POST', body: JSON.stringify({ p_code: 'a'.repeat(64) }) });
if (peek.status === 404 || peek.body?.code === 'PGRST202') {
  console.log('--   uitnodigingen: migratie 0005 is hier nog niet uitgevoerd (het welkomstscherm voor een nieuwe gebruiker werkt dan nog niet)');
} else {
  check('uitnodigingen: een verzonnen code geeft zonder in te loggen alleen {status: invalid}', peek.status === 200 && JSON.stringify(peek.body) === JSON.stringify({ status: 'invalid' }), `${peek.status} ${JSON.stringify(peek.body)}`);
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} geslaagd`);
process.exitCode = failed ? 1 : 0; // geen process.exit: op Windows crasht dat soms terwijl verbindingen nog sluiten
