import { test, assert } from './harness.js';
import { defaultFilters, filterReasons, MAX_MILES, NEAR_HOME_MILES } from '../js/logic/filters.js';

const ctx = { chance: () => null, isSaved: () => false };
const course = (distance) => ({ offerScore: 15, types: ['economics'], uni: { distance, region: 'North', setting: 'campus' } });

test('distance: a uni within the limit passes', () => {
  assert.deepEqual(filterReasons(course(120), defaultFilters(), ctx), []);
});

test('distance: a uni beyond the limit is hidden with its distance', () => {
  const f = { ...defaultFilters(), maxMiles: NEAR_HOME_MILES };
  assert.deepEqual(filterReasons(course(123), f, ctx), ['120 miles away']);
});

test('distance: an unconfirmed distance is hidden while a limit is on', () => {
  const f = { ...defaultFilters(), maxMiles: NEAR_HOME_MILES };
  assert.deepEqual(filterReasons(course(null), f, ctx), ['distance not confirmed']);
});

test('distance: "Any distance" shows unis with an unconfirmed distance', () => {
  const f = { ...defaultFilters(), maxMiles: MAX_MILES };
  assert.deepEqual(filterReasons(course(null), f, ctx), []);
});
