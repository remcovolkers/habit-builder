// De privacyverklaring en voorwaarden mogen niet achterlopen op wat de database van de sociale functies bewaart.
// Komt er een kolom bij in supabase/migrations/0003_social.sql (of een latere migratie die deze tabellen uitbreidt), dan faalt deze test tot
// de kolom hieronder staat én de privacyverklaring hem noemt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const privacy = readFileSync(root('docs/PRIVACY.md'), 'utf8').toLowerCase();
const terms = readFileSync(root('docs/VOORWAARDEN.md'), 'utf8').toLowerCase();

// Per kolom: een woord of zinsdeel dat in de privacyverklaring moet staan. null = technisch (sleutel, tijdstip, aan/uit) en geen gegeven dat een eigen vermelding nodig heeft.
const COVERED = {
  social_profiles: { user_id: null, username: 'gebruikersnaam', display_name: 'weergavenaam', enabled: null, username_changed_at: null, created_at: null, updated_at: null },
  friendships: { id: null, user_low: null, user_high: null, requested_by: null, status: 'bevriend', created_at: null, responded_at: 'geweigerd verzoek' },
  invite_codes: { id: null, owner: null, code_hash: 'onleesbare versie van de code', created_at: null, expires_at: 'verloopt na 7 dagen', revoked_at: 'intrekken' },
  score_summaries: {
    user_id: null, as_of: 'dag van de berekening', points: 'punten van de laatste 7 dagen', done: 'aantal afgeronde taken', streak: 'reeks in dagen',
    active_habits: 'aantal habits', last_active: 'voor het laatst iets afvinkte', updated_at: null,
  },
  social_rate: { id: null, user_id: null, action: 'van je zoek-, verzoek- en uitnodigingsacties', at: null },
  // feedback (0007_feedback.sql): wat een gebruiker stuurt, en alleen met het vinkje ook het adres van het account
  feedback: {
    id: null, created_at: null, kind: 'soort feedback', body: 'de tekst van je feedback', route: 'de pagina waarop je zat', app_version: 'de versie van de app',
    user_id: null, contact_email: 'het e-mailadres van je account', status: null, handled_at: null,
  },
};

/** De kolomnamen van elke `create table ... public.<naam> (...)` in de migraties. */
function columnsFromMigrations() {
  const dir = root('supabase/migrations');
  const tables = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(`${dir}/${file}`, 'utf8');
    for (const match of sql.matchAll(/create table if not exists public\.(\w+) \(([\s\S]*?)\n\);/g)) {
      const [, name, body] = match;
      if (!(name in COVERED)) continue;
      tables[name] = body.split('\n')
        .map((line) => /^\s{2}([a-z_]+)\s+(uuid|text|boolean|integer|date|timestamptz|bigint)\b/.exec(line)?.[1])
        .filter(Boolean);
    }
  }
  return tables;
}

test('elke kolom van de sociale tabellen is bekend in deze test (en dus bewust beoordeeld voor de privacyverklaring)', () => {
  const tables = columnsFromMigrations();
  assert.deepEqual(Object.keys(tables).sort(), Object.keys(COVERED).sort(), 'een tabel ontbreekt of is nieuw');
  for (const [table, columns] of Object.entries(tables)) {
    const unknown = columns.filter((column) => !(column in COVERED[table]));
    assert.deepEqual(unknown, [], `${table}: nieuwe kolom(men) ${unknown.join(', ')}: zet ze in COVERED in tests/legal.test.js en noem ze in docs/PRIVACY.md`);
    const gone = Object.keys(COVERED[table]).filter((column) => !columns.includes(column));
    assert.deepEqual(gone, [], `${table}: kolom(men) ${gone.join(', ')} bestaan niet meer: haal ze uit COVERED`);
  }
});

test('de privacyverklaring noemt elk gegeven dat de sociale tabellen bewaren', () => {
  const missing = [];
  for (const [table, columns] of Object.entries(COVERED)) {
    for (const [column, phrase] of Object.entries(columns)) {
      if (phrase && !privacy.includes(phrase)) missing.push(`${table}.${column}: "${phrase}"`);
    }
  }
  assert.deepEqual(missing, []);
});

test('de privacyverklaring zegt wat vrienden niet zien, hoe je uitzet, en dat het standaard uit staat en op toestemming berust', () => {
  for (const phrase of ['standaard uit', 'wat je vrienden niet zien', 'toestemming', 'zet je vrienden en de ranglijst uit', 'je e-mailadres', 'de namen van je habits', 'je vrienden']) {
    assert.ok(privacy.includes(phrase), `ontbreekt in PRIVACY.md: ${phrase}`);
  }
});

test('de voorwaarden hebben spelregels voor vrienden en de ranglijst, en waarschuwen voor uitnodigingslinks', () => {
  for (const phrase of ['vrienden en de ranglijst', 'uitnodigingslink', 'doe je niet voor als iemand anders', 'punten']) {
    assert.ok(terms.includes(phrase), `ontbreekt in VOORWAARDEN.md: ${phrase}`);
  }
});

test('de privacyverklaring belooft niet langer onvoorwaardelijk dat alleen jijzelf je gegevens kunt lezen', () => {
  const sentence = privacy.split('\n').find((line) => line.includes('kopie van de gegevens'));
  assert.ok(sentence, 'de zin over de kopie op de server is er niet meer: pas deze test aan');
  assert.ok(!/alleen voor jou leesbaar\s*;?\s*$/.test(sentence), 'de zin moet de uitzondering voor vrienden noemen');
  assert.ok(sentence.includes('vrienden'));
});

