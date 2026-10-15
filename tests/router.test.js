import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHash, matchRoute, DEFAULT_PATH } from '../src/router.js';

test('parseHash: lege hash en "#/" vallen terug op de standaardroute', () => {
  assert.equal(parseHash('').path, DEFAULT_PATH);
  assert.equal(parseHash('#').path, DEFAULT_PATH);
  assert.equal(parseHash('#/').path, DEFAULT_PATH);
  assert.equal(parseHash(undefined).path, DEFAULT_PATH);
});

test('parseHash: normaliseert slashes en leest query', () => {
  assert.deepEqual(parseHash('#/habits/'), { path: '/habits', query: {} });
  assert.deepEqual(parseHash('#habits'), { path: '/habits', query: {} });
  assert.deepEqual(parseHash('#/habits?x=1&y=a%20b'), { path: '/habits', query: { x: '1', y: 'a b' } });
});

test('matchRoute: exacte routes en parameters', () => {
  const routes = [{ path: '/today' }, { path: '/habits/:id' }];
  assert.equal(matchRoute(routes, '/today').route, routes[0]);
  const m = matchRoute(routes, '/habits/abc%20d');
  assert.equal(m.route, routes[1]);
  assert.deepEqual(m.params, { id: 'abc d' });
});

test('matchRoute: geen match bij ander aantal segmenten of onbekend pad', () => {
  const routes = [{ path: '/habits/:id' }];
  assert.equal(matchRoute(routes, '/habits'), null);
  assert.equal(matchRoute(routes, '/habits/a/b'), null);
  assert.equal(matchRoute(routes, '/nope/x'), null);
});
