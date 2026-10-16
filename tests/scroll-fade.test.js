import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fadeState } from '../src/ui/scroll-fade.js';

test('fade: boven alleen als er al gescrold is, onder alleen als er nog inhoud onder zit', () => {
  assert.deepEqual(fadeState({ scrollTop: 0, clientHeight: 400, scrollHeight: 1000 }), { top: false, bottom: true });
  assert.deepEqual(fadeState({ scrollTop: 300, clientHeight: 400, scrollHeight: 1000 }), { top: true, bottom: true });
  assert.deepEqual(fadeState({ scrollTop: 600, clientHeight: 400, scrollHeight: 1000 }), { top: true, bottom: false });
});

test('fade: een kolom die past heeft geen fade, en een afrondingsverschil van een pixel telt niet', () => {
  assert.deepEqual(fadeState({ scrollTop: 0, clientHeight: 500, scrollHeight: 500 }), { top: false, bottom: false });
  assert.deepEqual(fadeState({ scrollTop: 0.4, clientHeight: 500, scrollHeight: 500.6 }), { top: false, bottom: false });
  assert.deepEqual(fadeState({ scrollTop: 599.5, clientHeight: 400, scrollHeight: 1000 }), { top: true, bottom: false });
});
