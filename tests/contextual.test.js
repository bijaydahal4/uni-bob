import { test, assert } from './harness.js';
import { estimate, meetsCriterion } from '../js/logic/contextual.js';

// Test-only fixtures.
const uni = (criteria, extra = {}) => ({ contextual: { offersContextual: true, criteria, minCriteria: null, ...extra } });

test('no published criteria → Not confirmed', () => {
  assert.equal(estimate({}, { fsm: true }).level, 'unknown');
  assert.equal(estimate(uni([]), { fsm: true }).level, 'unknown');
});

test('nothing answered → ask her to answer', () => {
  assert.equal(estimate(uni([{ key: 'fsm' }]), {}).level, 'unanswered');
});

test('a criterion that counts on its own → Likely', () => {
  assert.equal(estimate(uni([{ key: 'care', alone: true }]), { care: true }).level, 'likely');
});

test('one criterion met, rules unknown → Possible', () => {
  assert.equal(estimate(uni([{ key: 'fsm', alone: null }, { key: 'firstGen', alone: null }]), { fsm: true }).level, 'possible');
});

test('meets the stated minimum → Likely', () => {
  const u = uni([{ key: 'fsm', alone: false }, { key: 'firstGen', alone: false }, { key: 'school', alone: false }], { minCriteria: 2 });
  assert.equal(estimate(u, { fsm: true, firstGen: true }).level, 'likely');
  assert.equal(estimate(u, { fsm: true, firstGen: false }).level, 'possible');
});

test('meets none → Unlikely', () => {
  assert.equal(estimate(uni([{ key: 'fsm' }, { key: 'care' }]), { fsm: false, care: false, area: 4 }).level, 'unlikely');
});

test('area: POLAR4 quintile from the OfS checker', () => {
  const c = { key: 'area', measure: 'POLAR4', quintiles: [1, 2] };
  assert.equal(meetsCriterion(c, { area: 1 }), true);
  assert.equal(meetsCriterion(c, { area: 3 }), false);
  assert.equal(meetsCriterion(c, {}), null);
  // IMD can't be answered from the OfS checker
  assert.equal(meetsCriterion({ key: 'area', measure: 'IMD', quintiles: [1] }, { area: 1 }), null);
});

test('uni that makes no contextual offers', () => {
  assert.equal(estimate({ contextual: { offersContextual: false, criteria: [] } }, { fsm: true }).level, 'none');
});
