import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchReviewMailPref, setReviewMailPref, unsubscribeWithToken } from '../../src/data/review-mail-remote.js';

const client = (handler) => async () => ({ rpc: async (fn, args) => handler(fn, args) });

test('voorkeur lezen: true of false van de server; elke fout of rommel is null (de kaart blijft dan weg)', async () => {
  assert.equal(await fetchReviewMailPref(client(() => ({ data: true, error: null }))), true);
  assert.equal(await fetchReviewMailPref(client(() => ({ data: false, error: null }))), false);
  assert.equal(await fetchReviewMailPref(client(() => ({ data: null, error: { code: 'PGRST202' } }))), null);
  assert.equal(await fetchReviewMailPref(client(() => ({ data: 'ja', error: null }))), null);
  assert.equal(await fetchReviewMailPref(client(() => { throw new TypeError('Failed to fetch'); })), null);
});

test('voorkeur zetten: roept review_mail_set_pref aan en geeft de nieuwe stand; een fout is null', async () => {
  const seen = [];
  assert.equal(await setReviewMailPref(client((fn, args) => { seen.push([fn, args]); return { data: args.p_on, error: null }; }), false), false);
  assert.equal(await setReviewMailPref(client((fn, args) => ({ data: args.p_on, error: null })), true), true);
  assert.deepEqual(seen, [['review_mail_set_pref', { p_on: false }]]);
  assert.equal(await setReviewMailPref(client(() => ({ data: null, error: { message: 'not_signed_in' } })), true), null);
});

test('afmelden met de code: ok, ongeldige code (400) of mislukt (geen verbinding, functie ontbreekt)', async () => {
  const calls = [];
  const fetchImpl = (status) => async (url, init) => { calls.push([url, JSON.parse(init.body)]); return new Response('{}', { status }); };
  assert.equal(await unsubscribeWithToken({ supabaseUrl: 'https://p.supabase.co', token: 'abc', fetchImpl: fetchImpl(200) }), 'ok');
  assert.equal(await unsubscribeWithToken({ supabaseUrl: 'https://p.supabase.co', token: 'abc', undo: true, fetchImpl: fetchImpl(200) }), 'ok');
  assert.equal(await unsubscribeWithToken({ supabaseUrl: 'https://p.supabase.co', token: 'x', fetchImpl: fetchImpl(400) }), 'invalid');
  assert.equal(await unsubscribeWithToken({ supabaseUrl: 'https://p.supabase.co', token: 'x', fetchImpl: fetchImpl(404) }), 'failed');
  assert.equal(await unsubscribeWithToken({ supabaseUrl: 'https://p.supabase.co', token: 'x', fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }), 'failed');
  assert.deepEqual(calls[0], ['https://p.supabase.co/functions/v1/send-review-mails', { unsubscribe: 'abc', undo: false }]);
  assert.equal(calls[1][1].undo, true);
});
