// De Supabase-kant van de feedbackhub: foutcodes, en dat er nooit iets gegooid wordt waar de app dat niet verwacht.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FeedbackError, deleteFeedback, fetchIsAdmin, listFeedback, sendFeedback, setFeedbackStatus, toFeedbackError,
} from '../../src/data/feedback-remote.js';

const client = (handler) => async () => ({ rpc: async (fn, args) => handler(fn, args) });

test('versturen: de functie en de parameters kloppen, en het vinkje wordt alleen waar bij true', async () => {
  const calls = [];
  const getClient = client((fn, args) => { calls.push({ fn, args }); return { data: { ok: true }, error: null }; });
  await sendFeedback(getClient, { kind: 'idea', body: 'tekst', route: '#/today', version: '1.2', contact: true });
  await sendFeedback(getClient, { kind: 'problem', body: 'nog een', contact: 'ja' });
  assert.deepEqual(calls[0], { fn: 'feedback_send', args: { p_kind: 'idea', p_body: 'tekst', p_route: '#/today', p_version: '1.2', p_contact: true } });
  assert.equal(calls[1].args.p_contact, false, 'alleen echt true telt als toestemming');
  assert.equal(calls[1].args.p_route, null);
});

test('foutcodes van de server komen door als FeedbackError met een stabiele code', async () => {
  const fail = (error) => sendFeedback(client(() => ({ data: null, error })), { kind: 'idea', body: 'x' });
  await assert.rejects(fail({ message: 'invalid_feedback' }), (e) => e instanceof FeedbackError && e.code === 'invalid');
  await assert.rejects(fail({ message: 'too_many_requests' }), (e) => e.code === 'too_many_requests');
  await assert.rejects(fail({ status: 429, message: 'x' }), (e) => e.code === 'too_many_requests');
  await assert.rejects(fail({ code: 'PGRST202', message: 'x' }), (e) => e.code === 'unavailable');
  await assert.rejects(fail({ message: 'iets onverwachts' }), (e) => e.code === 'unknown');
});

test('geen verbinding (of een client die niet te laden is) wordt "offline" of "unknown", nooit een kale fout', async () => {
  await assert.rejects(sendFeedback(async () => ({ rpc: async () => { throw new TypeError('Failed to fetch'); } }), { kind: 'idea', body: 'x' }), (e) => e.code === 'offline');
  await assert.rejects(sendFeedback(async () => { throw new Error('SDK niet te laden'); }, { kind: 'idea', body: 'x' }), (e) => e instanceof FeedbackError && e.code === 'unknown');
  assert.equal(toFeedbackError(new FeedbackError('offline')).code, 'offline', 'een FeedbackError blijft zoals hij is');
});

test('is beheerder: alleen een echte true telt, en elke fout is "nee"', async () => {
  assert.equal(await fetchIsAdmin(client(() => ({ data: true, error: null }))), true);
  assert.equal(await fetchIsAdmin(client(() => ({ data: false, error: null }))), false);
  assert.equal(await fetchIsAdmin(client(() => ({ data: 'true', error: null }))), false);
  assert.equal(await fetchIsAdmin(client(() => ({ data: null, error: { code: 'PGRST202' } }))), false);
  assert.equal(await fetchIsAdmin(async () => { throw new Error('geen sdk'); }), false);
});

test('lezen, afhandelen en verwijderen: de juiste functies, en een lijst is altijd een lijst', async () => {
  const calls = [];
  const getClient = client((fn, args) => { calls.push({ fn, args }); return { data: fn === 'feedback_list' ? [{ id: 'a' }] : true, error: null }; });
  assert.deepEqual(await listFeedback(getClient), [{ id: 'a' }]);
  assert.equal(await setFeedbackStatus(getClient, 'a', 'done'), true);
  assert.equal(await deleteFeedback(getClient, 'a'), true);
  assert.deepEqual(calls.map((c) => c.fn), ['feedback_list', 'feedback_set_status', 'feedback_delete']);
  assert.deepEqual(calls[1].args, { p_id: 'a', p_status: 'done' });
  assert.deepEqual(await listFeedback(client(() => ({ data: null, error: null }))), []);
  assert.equal(await deleteFeedback(client(() => ({ data: false, error: null })), 'a'), false);
});
