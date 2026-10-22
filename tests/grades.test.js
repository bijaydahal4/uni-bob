import { test, assert } from './harness.js';
import {
  parseGrades, offerPoints, selectCounted, computeChance, chanceFromGap, markerPosition,
  isVeryCompetitive, subjectKey, altApplies, positionFor,
} from '../js/logic/grades.js';

// Test-only fixtures (not real courses).
const subj = (...pairs) => pairs.map(([name, grade]) => ({ name, grade }));
const her = (grades3) => subj(['Mathematics', grades3[0]], ['Geography', grades3[1]], ['Psychology', grades3[2]]);
const course = (o) => ({ offer: { kind: 'grades', typical: 'AAA', low: null }, subjectRequirements: [], alternativeOffers: [], ...o });

test('parseGrades reads A* and plain grades', () => {
  assert.deepEqual(parseGrades('A*AA'), ['A*', 'A', 'A']);
  assert.deepEqual(parseGrades('a*a*a'), ['A*', 'A*', 'A']);
  assert.deepEqual(parseGrades('BBC'), ['B', 'B', 'C']);
  assert.deepEqual(parseGrades('AAU'), ['A', 'A', 'U']);
  assert.equal(parseGrades('128 points'), null);
  assert.equal(parseGrades(''), null);
  assert.equal(parseGrades(null), null);
});

test('offer points use A*=6 … U=0', () => {
  assert.equal(offerPoints('A*AA'), 16);
  assert.equal(offerPoints('AAA'), 15);
  assert.equal(offerPoints('ABB'), 13);
  assert.equal(offerPoints('CCC'), 9);
  assert.equal(offerPoints('UUU'), 0);
});

test('gap thresholds: +2 Safe, +1 Good, 0 Match, -1 Reach, -2 Long shot', () => {
  assert.equal(chanceFromGap(3), 'safe');
  assert.equal(chanceFromGap(2), 'safe');
  assert.equal(chanceFromGap(1), 'good');
  assert.equal(chanceFromGap(0), 'match');
  assert.equal(chanceFromGap(-1), 'reach');
  assert.equal(chanceFromGap(-2), 'longshot');
  assert.equal(chanceFromGap(-5), 'longshot');
});

test('AAA vs typical offers', () => {
  const p = { subjects: her('AAA') };
  assert.equal(computeChance(p, course({ offer: { typical: 'ABB' } })).chance, 'safe');
  assert.equal(computeChance(p, course({ offer: { typical: 'AAB' } })).chance, 'good');
  assert.equal(computeChance(p, course({ offer: { typical: 'AAA' } })).chance, 'match');
  assert.equal(computeChance(p, course({ offer: { typical: 'A*AA' } })).chance, 'reach');
  assert.equal(computeChance(p, course({ offer: { typical: 'A*A*A' } })).chance, 'longshot');
});

test('sentence explains the gap in plain words', () => {
  const r = computeChance({ subjects: her('AAA') }, course({ offer: { typical: 'A*AA' } }));
  assert.equal(r.sentence, 'Your AAA is one grade below their usual offer of A*AA, so this is a reach.');
  const m = computeChance({ subjects: her('AAA') }, course({ offer: { typical: 'AAA' } }));
  assert.equal(m.sentence, 'Your AAA matches their usual offer of AAA.');
  const s = computeChance({ subjects: her('AAA') }, course({ offer: { typical: 'ABB' } }));
  assert.equal(s.sentence, 'Your AAA is two grades above their usual offer of ABB, so this looks safe.');
});

test('U grades count as zero points', () => {
  const p = { subjects: her('AAU') };
  const r = computeChance(p, course({ offer: { typical: 'AAA' } }));
  assert.equal(r.gap, -5);
  assert.equal(r.chance, 'longshot');
  const all = computeChance({ subjects: her('UUU') }, course({ offer: { typical: 'EEE' } }));
  assert.equal(all.chance, 'longshot');
});

test('four subjects: best three are counted', () => {
  const p = { subjects: subj(['Mathematics', 'A'], ['Geography', 'A'], ['Psychology', 'B'], ['Economics', 'A*']) };
  const sel = selectCounted(p.subjects, []);
  assert.equal(sel.points, 16); // A*, A, A
  const r = computeChance(p, course({ offer: { typical: 'A*AA' } }));
  assert.equal(r.chance, 'match');
  assert.match(r.sentence, /^Your best three \(A\*AA\)/);
});

test('required subject must be one of the three counted', () => {
  // Maths is her lowest grade, but Maths is required, so it must be counted.
  const p = { subjects: subj(['Mathematics', 'B'], ['Geography', 'A'], ['Psychology', 'A'], ['Sociology', 'A']) };
  const groups = [{ subjects: ['Mathematics'], minGrade: null }];
  const sel = selectCounted(p.subjects, groups);
  assert.ok(sel.counted.some((s) => s.name === 'Mathematics'), 'Maths counted');
  assert.equal(sel.points, 14); // A, A, B
  const r = computeChance(p, course({ offer: { typical: 'AAA' }, subjectRequirements: groups }));
  assert.equal(r.gap, -1);
  assert.equal(r.chance, 'reach');
});

test('A* in Maths needed but she has A: best she can be is Reach', () => {
  const p = { subjects: subj(['Mathematics', 'A'], ['Geography', 'A*'], ['Psychology', 'A*']) };
  const c = course({ offer: { typical: 'A*AA' }, subjectRequirements: [{ subjects: ['Mathematics'], minGrade: 'A*' }] });
  const r = computeChance(p, c);
  assert.equal(r.gap, 1); // grades alone would be "Good chance"
  assert.equal(r.chance, 'reach');
  assert.match(r.sentence, /they need an A\* in Maths and you have an A, so the best it can be is a reach\./);
  const check = r.checks[0];
  assert.equal(check.status, 'unmet');
});

test('subject requirement met shows as met', () => {
  const c = course({ offer: { typical: 'AAA' }, subjectRequirements: [{ subjects: ['Mathematics'], minGrade: 'A' }] });
  const r = computeChance({ subjects: her('AAA') }, c);
  assert.equal(r.checks[0].status, 'met');
  assert.equal(r.chance, 'match');
});

test('either/or subject requirement (Maths or Further Maths)', () => {
  const p = { subjects: subj(['Further Mathematics', 'A*'], ['Mathematics', 'A'], ['Geography', 'A']) };
  const c = course({ offer: { typical: 'A*AA' }, subjectRequirements: [{ subjects: ['Mathematics', 'Further Mathematics'], minGrade: 'A*' }] });
  const r = computeChance(p, c);
  assert.equal(r.checks[0].status, 'met');
  assert.equal(r.chance, 'match');
});

test('required subject she does not take makes it a long shot', () => {
  const c = course({ offer: { typical: 'AAA' }, subjectRequirements: [{ subjects: ['Further Mathematics'], minGrade: 'A' }] });
  const r = computeChance({ subjects: her('A*A*A*') }, c);
  assert.equal(r.chance, 'longshot');
  assert.match(r.sentence, /needs A-level Further Maths, which you're not taking/);
});

test('subject names match across spellings', () => {
  assert.equal(subjectKey('Maths'), subjectKey('Mathematics'));
  assert.equal(subjectKey('Further Maths'), 'further mathematics');
  assert.equal(subjectKey('Government and Politics'), subjectKey('Politics'));
});

test('ranges use the top of the range and report the band', () => {
  const c = course({ offer: { typical: 'AAA', low: 'AAB' } });
  const r = computeChance({ subjects: her('AAB') }, c);
  assert.equal(r.gap, -1);
  assert.equal(r.chance, 'reach');
  assert.deepEqual(r.range, { top: 15, low: 14 });
  assert.ok(r.notes.some((n) => /range from AAA to AAB/.test(n)));
  // band sits to the right of the typical-offer marker (lower grades are to the right)
  assert.equal(markerPosition(15, r.reference), 50);
  assert.equal(markerPosition(14, r.reference), 70);
});

test('tariff offers convert with 8 points ≈ one grade', () => {
  const c = course({ offer: { kind: 'tariff', typical: null, tariff: 128 } });
  const r = computeChance({ subjects: her('AAA') }, c); // 144 points
  assert.equal(r.herTariff, 144);
  assert.equal(r.gap, 2);
  assert.equal(r.chance, 'safe');
  assert.match(r.sentence, /worth 144 UCAS points, 16 more than their usual offer of 128/);
  const r2 = computeChance({ subjects: her('ABB') }, course({ offer: { kind: 'tariff', tariff: 136 } })); // 128
  assert.equal(r2.gap, -1);
  assert.equal(r2.chance, 'reach');
  const r3 = computeChance({ subjects: her('AAA') }, course({ offer: { kind: 'tariff', tariff: 150 } })); // -6 → -1
  assert.equal(r3.chance, 'reach');
  const r4 = computeChance({ subjects: her('AAA') }, course({ offer: { kind: 'tariff', tariff: 144 } }));
  assert.equal(r4.chance, 'match');
});

test('tariff range uses the top', () => {
  const r = computeChance({ subjects: her('ABB') }, course({ offer: { kind: 'tariff', tariff: 128, tariffLow: 112 } }));
  assert.equal(r.chance, 'match');
  assert.deepEqual(r.range, { top: 128, low: 112 });
});

test('very competitive courses move one step towards Reach', () => {
  const comp = { applicationsPerPlace: 12 };
  assert.ok(isVeryCompetitive(comp));
  assert.ok(isVeryCompetitive({ offerRate: 0.15 }));
  assert.ok(!isVeryCompetitive({ offerRate: 0.45 }));
  assert.ok(!isVeryCompetitive(null));
  const r = computeChance({ subjects: her('AAA') }, course({ offer: { typical: 'AAB' }, competition: comp }));
  assert.equal(r.chance, 'match'); // good → match
  assert.match(r.sentence, /very competitive \(about 12 applications per place\), so we've moved it one step towards Reach/);
  const r2 = computeChance({ subjects: her('AAA') }, course({ offer: { typical: 'A*AA' }, competition: comp }));
  assert.equal(r2.chance, 'reach'); // Reach stays Reach
});

test('What-if: EPQ offer shows both markers and improves the chance', () => {
  const c = course({
    offer: { typical: 'AAA' },
    alternativeOffers: [{ type: 'epq', offer: 'AAB', epqGrade: 'A', conditions: 'plus A in the EPQ' }],
  });
  const real = computeChance({ subjects: her('AAB') }, c);
  assert.equal(real.chance, 'reach');
  assert.equal(real.markers.length, 1);
  const what = computeChance({ subjects: her('AAB'), toggles: { epq: { on: true, grade: 'A' } } }, c);
  assert.equal(what.chance, 'match');
  assert.equal(what.markers.length, 2);
  assert.equal(what.markers[1].label, 'Your offer with an EPQ');
  assert.match(what.sentence, /With an EPQ, their offer could be AAB, which you match\./);
  // EPQ grade too low → no change
  const low = computeChance({ subjects: her('AAB'), toggles: { epq: { on: true, grade: 'B' } } }, c);
  assert.equal(low.chance, 'reach');
});

test('What-if: alternative offers only apply to the matching toggle', () => {
  const ctx = { type: 'contextual', offer: 'ABB' };
  assert.ok(altApplies(ctx, { contextual: true }));
  assert.ok(!altApplies(ctx, { epq: { on: true, grade: 'A*' } }));
  const tm = { type: 'tmua', offer: 'AAB', tmuaMinScore: 6.5 };
  assert.ok(altApplies(tm, { tmua: { on: true, score: 7 } }));
  assert.ok(!altApplies(tm, { tmua: { on: true, score: 5 } }));
  assert.ok(!altApplies({ type: 'tmua', offer: 'AAB' }, { tmua: { on: true, score: 9 } }), 'no threshold → not applied');
  assert.ok(altApplies({ type: 'accessProgramme', offer: 'BBB' }, { summerSchool: true }));
});

test('What-if: alternative offer inherits subject needs, capped at the offer grades', () => {
  const c = course({
    offer: { typical: 'A*AA' },
    subjectRequirements: [{ subjects: ['Mathematics'], minGrade: 'A*' }],
    alternativeOffers: [{ type: 'contextual', offer: 'AAB' }],
  });
  const r = computeChance({ subjects: her('AAA'), toggles: { contextual: true } }, c);
  assert.equal(r.chance, 'good'); // AAA vs AAB, Maths A meets the capped A requirement
  assert.equal(r.usedAlt.type, 'contextual');
});

test('a subject the course does not accept is not counted', () => {
  const p = { subjects: subj(['Mathematics', 'A'], ['Geography', 'A'], ['General Studies', 'A*']) };
  const r = computeChance(p, course({ offer: { typical: 'AAA' }, notAccepted: ['General Studies'] }));
  assert.equal(r.gap, -5); // only two A-levels count
  assert.equal(r.excluded.length, 1);
  assert.ok(r.notes[0].includes("don't accept General Studies"));
});

test('fewer than three subjects: missing ones count as nothing', () => {
  const r = computeChance({ subjects: subj(['Mathematics', 'A'], ['Geography', 'A']) }, course({ offer: { typical: 'AAA' } }));
  assert.equal(r.gap, -5);
  assert.equal(r.chance, 'longshot');
});

test('no confirmed offer → no chance shown', () => {
  assert.equal(computeChance({ subjects: her('AAA') }, course({ offer: { typical: null } })), null);
  assert.equal(computeChance({ subjects: her('AAA') }, course({ offer: null })), null);
});

test('slider positions: zones from Safe (left) to Long shot (right)', () => {
  assert.equal(positionFor('safe', 2), 10);
  assert.equal(positionFor('safe', 4), 5);
  assert.equal(positionFor('match', 0), 50);
  assert.equal(positionFor('reach', -1), 70);
  assert.equal(positionFor('longshot', -4), 95);
});
