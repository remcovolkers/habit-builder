import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteAppDevice, deleteSubscription, saveAppDevice, saveSubscription, sendTestReminder, updateSubscription } from '../../src/data/push-remote.js';

/** Een nagebootste Supabase-client die onthoudt wat ermee gedaan is. */
function fakeClient({ error = null, invoke } = {}) {
  const calls = [];
  const table = (name) => ({
    upsert: async (row, options) => { calls.push({ name, op: 'upsert', row, options }); return { error }; },
    update: (columns) => ({ eq: async (column, value) => { calls.push({ name, op: 'update', columns, column, value }); return { error }; } }),
    delete: () => ({ eq: async (column, value) => { calls.push({ name, op: 'delete', column, value }); return { error }; } }),
  });
  return { calls, from: table, functions: { invoke: async (fn, options) => { calls.push({ fn, options }); return invoke ?? { data: { sent: 1 }, error: null }; } } };
}

const subscription = { endpoint: 'https://push.example.org/abc', keys: { p256dh: 'PUB', auth: 'AUTH' } };

test('saveSubscription: upsert op (user, endpoint) met sleutels, tijdstip, tijdzone en samenvatting', async () => {
  const client = fakeClient();
  await saveSubscription({ client, userId: 'u1', subscription, remindTime: '07:30', timezone: 'Europe/Amsterdam', summary: { name: 'R', days: {} } });
  assert.deepEqual(client.calls[0], {
    name: 'push_subscriptions', op: 'upsert',
    row: { user_id: 'u1', endpoint: subscription.endpoint, p256dh: 'PUB', auth: 'AUTH', remind_time: '07:30', timezone: 'Europe/Amsterdam', summary: { name: 'R', days: {} } },
    options: { onConflict: 'user_id,endpoint' },
  });
});

test('saveSubscription: een onvolledig abonnement of een databasefout geeft een fout', async () => {
  await assert.rejects(saveSubscription({ client: fakeClient(), userId: 'u1', subscription: { endpoint: 'https://x', keys: {} }, remindTime: '08:00', timezone: 'UTC', summary: {} }), /onvolledig/);
  await assert.rejects(saveSubscription({ client: fakeClient({ error: { message: 'kapot', code: '23514' } }), userId: 'u1', subscription, remindTime: '08:00', timezone: 'UTC', summary: {} }), /kapot/);
});

test('updateSubscription: wijzigt alleen wat is meegegeven, voor dit endpoint', async () => {
  const client = fakeClient();
  await updateSubscription({ client, endpoint: subscription.endpoint, patch: { remindTime: '09:00' } });
  await updateSubscription({ client, endpoint: subscription.endpoint, patch: { summary: { name: '', days: {} }, timezone: 'UTC' } });
  assert.deepEqual(client.calls[0], { name: 'push_subscriptions', op: 'update', columns: { remind_time: '09:00' }, column: 'endpoint', value: subscription.endpoint });
  assert.deepEqual(client.calls[1].columns, { summary: { name: '', days: {} }, timezone: 'UTC' });
});

test('deleteSubscription: verwijdert op endpoint', async () => {
  const client = fakeClient();
  await deleteSubscription({ client, endpoint: subscription.endpoint });
  assert.deepEqual(client.calls[0], { name: 'push_subscriptions', op: 'delete', column: 'endpoint', value: subscription.endpoint });
  await assert.rejects(deleteSubscription({ client: fakeClient({ error: { message: 'nee' } }), endpoint: 'x' }), /nee/);
});

const httpError = (status, body) => ({ data: null, error: { message: 'x', context: { status, json: async () => body } } });

test('sendTestReminder met vertraging: stuurt delaySeconds mee en meldt "gepland" als de server 202 antwoordt', async () => {
  const client = fakeClient({ invoke: { data: { mode: 'test', scheduled: true, delaySeconds: 15, devices: 1 }, error: null } });
  assert.deepEqual(await sendTestReminder({ client, endpoint: 'E', delaySeconds: 15 }), { ok: true, scheduled: true });
  assert.deepEqual(client.calls[0].options.body, { test: true, endpoint: 'E', delaySeconds: 15 });
});

test('sendTestReminder: roept de functie aan met { test, endpoint } en meldt succes', async () => {
  const client = fakeClient();
  assert.deepEqual(await sendTestReminder({ client, endpoint: 'E' }), { ok: true });
  assert.deepEqual(client.calls[0], { fn: 'send-reminders', options: { body: { test: true, endpoint: 'E' } } });
});

test('sendTestReminder: vertaalt de uitkomsten naar redenen die de UI kan uitleggen', async () => {
  const reason = async (invoke) => (await sendTestReminder({ client: fakeClient({ invoke }), endpoint: 'E' })).reason;
  assert.equal(await reason(httpError(404, { error: 'geen apparaat gevonden' })), 'no_device');
  assert.equal(await reason(httpError(404, null)), 'not_deployed');
  assert.equal(await reason(httpError(500, { error: 'niet ingesteld' })), 'not_configured');
  assert.equal(await reason(httpError(401, {})), 'unknown');
  assert.equal(await reason({ data: { sent: 0, failed: 1, removed: 0 }, error: null }), 'push_failed');
  assert.equal(await reason({ data: { sent: 0, failed: 0, removed: 1 }, error: null }), 'no_device');
  assert.equal(await reason({ data: null, error: { message: 'netwerk' } }), 'unknown');
});

test('saveSubscription: last_notified_date gaat alleen mee als het tijdstip is ingesteld of gewijzigd (anders blijft het staan)', async () => {
  const withNone = fakeClient();
  await saveSubscription({ client: withNone, userId: 'u1', subscription, remindTime: '08:00', timezone: 'UTC', summary: {} });
  assert.ok(!('last_notified_date' in withNone.calls[0].row), 'een gewone bijwerking van de samenvatting raakt het niet aan');

  const rearmed = fakeClient();
  await saveSubscription({ client: rearmed, userId: 'u1', subscription, remindTime: '08:00', timezone: 'UTC', summary: {}, lastNotifiedDate: null });
  assert.equal(rearmed.calls[0].row.last_notified_date, null, 'null = vandaag opnieuw scherp');

  const skipToday = fakeClient();
  await saveSubscription({ client: skipToday, userId: 'u1', subscription, remindTime: '08:00', timezone: 'UTC', summary: {}, lastNotifiedDate: '2026-10-15' });
  assert.equal(skipToday.calls[0].row.last_notified_date, '2026-10-15');
});

test('saveAppDevice: upsert op (user, fcm_token) met platform android, zonder webadres of sleutels', async () => {
  const client = fakeClient();
  await saveAppDevice({ client, userId: 'u1', token: 'tok-1', remindTime: '07:30', timezone: 'Europe/Amsterdam', summary: { name: 'R', days: {} } });
  assert.deepEqual(client.calls[0], {
    name: 'push_subscriptions', op: 'upsert',
    row: { user_id: 'u1', platform: 'android', fcm_token: 'tok-1', remind_time: '07:30', timezone: 'Europe/Amsterdam', summary: { name: 'R', days: {} } },
    options: { onConflict: 'user_id,fcm_token' },
  });
});

test('saveAppDevice: last_notified_date alleen meesturen als het is meegegeven (zoals bij een webabonnement), en een leeg token of databasefout is een fout', async () => {
  const plain = fakeClient();
  await saveAppDevice({ client: plain, userId: 'u1', token: 't', remindTime: '08:00', timezone: 'UTC', summary: {} });
  assert.ok(!('last_notified_date' in plain.calls[0].row));
  const rearmed = fakeClient();
  await saveAppDevice({ client: rearmed, userId: 'u1', token: 't', remindTime: '08:00', timezone: 'UTC', summary: {}, lastNotifiedDate: null });
  assert.equal(rearmed.calls[0].row.last_notified_date, null);
  await assert.rejects(saveAppDevice({ client: fakeClient(), userId: 'u1', token: '', remindTime: '08:00', timezone: 'UTC', summary: {} }), /FCM-token/);
  await assert.rejects(saveAppDevice({ client: fakeClient({ error: { message: 'kapot' } }), userId: 'u1', token: 't', remindTime: '08:00', timezone: 'UTC', summary: {} }), /kapot/);
});

test('deleteAppDevice: verwijdert op fcm_token', async () => {
  const client = fakeClient();
  await deleteAppDevice({ client, token: 'tok-1' });
  assert.deepEqual(client.calls[0], { name: 'push_subscriptions', op: 'delete', column: 'fcm_token', value: 'tok-1' });
  await assert.rejects(deleteAppDevice({ client: fakeClient({ error: { message: 'nee' } }), token: 'x' }), /nee/);
});

test('sendTestReminder voor de app: wijst het toestel aan met { token }, ook met vertraging', async () => {
  const client = fakeClient();
  assert.deepEqual(await sendTestReminder({ client, token: 'tok-1' }), { ok: true });
  assert.deepEqual(client.calls[0].options.body, { test: true, token: 'tok-1' });
  await sendTestReminder({ client, token: 'tok-1', delaySeconds: 15 });
  assert.deepEqual(client.calls[1].options.body, { test: true, token: 'tok-1', delaySeconds: 15 });
});
