import { test, assert } from './harness.js';
import { suggest, scoreNames, makeMatcher, editDistance, normalize } from '../js/logic/search.js';

// Test-only fixture: names and nicknames as they appear in the app's data.
const unis = [
  { id: 'warwick', name: 'University of Warwick', shortName: 'Warwick', aliases: ['Warwick Uni'], city: 'Coventry' },
  { id: 'kcl', name: "King's College London", shortName: "King's", aliases: ['KCL', 'Kings', "King's College"], city: 'London' },
  { id: 'loughborough', name: 'Loughborough University', shortName: 'Loughborough', aliases: ['Lboro', 'Lufbra'], city: 'Loughborough' },
  { id: 'lse', name: 'London School of Economics and Political Science', shortName: 'LSE', aliases: ['London School of Economics'], city: 'London' },
  { id: 'ucl', name: 'University College London', shortName: 'UCL', aliases: [], city: 'London' },
  { id: 'qmul', name: 'Queen Mary University of London', shortName: 'Queen Mary', aliases: ['QMUL', 'QM'], city: 'London' },
  { id: 'rhul', name: 'Royal Holloway, University of London', shortName: 'Royal Holloway', aliases: ['RHUL'], city: 'Egham' },
  { id: 'uea', name: 'University of East Anglia', shortName: 'UEA', aliases: ['East Anglia'], city: 'Norwich' },
  { id: 'bath', name: 'University of Bath', shortName: 'Bath', aliases: [], city: 'Bath' },
  { id: 'york', name: 'University of York', shortName: 'York', aliases: [], city: 'York' },
];
const courses = [
  { name: 'Economics', uniId: 'bath' }, { name: 'Economics', uniId: 'warwick' },
  { name: 'Economics and Finance', uniId: 'york' }, { name: 'Business Economics', uniId: 'loughborough' },
];
const top = (q) => suggest(q, unis, courses)[0];

test('normalize strips apostrophes and symbols', () => {
  assert.equal(normalize("King's College"), 'kings college');
  assert.equal(normalize('Economics & Finance'), 'economics and finance');
});

test('edit distance handles swaps', () => {
  assert.equal(editDistance('warrick', 'warwick'), 1);
  assert.equal(editDistance('lougborough', 'loughborough'), 1);
  assert.equal(editDistance('ab', 'ba'), 1);
});

test('typos: "warrick" finds Warwick', () => assert.equal(top('warrick').id, 'warwick'));
test('typos: "lougborough" finds Loughborough', () => assert.equal(top('lougborough').id, 'loughborough'));
test('typos: "loughbourgh" finds Loughborough', () => assert.equal(top('loughbourgh').id, 'loughborough'));
test('nicknames: "kings" and "kcl" find King\'s', () => {
  assert.equal(top('kings').id, 'kcl');
  assert.equal(top('kcl').id, 'kcl');
  assert.equal(top("king's").id, 'kcl');
});
test('initials: LSE, UCL, QMUL, RHUL, UEA', () => {
  assert.equal(top('lse').id, 'lse');
  assert.equal(top('ucl').id, 'ucl');
  assert.equal(top('qmul').id, 'qmul');
  assert.equal(top('rhul').id, 'rhul');
  assert.equal(top('uea').id, 'uea');
});
test('partial typing: "loughb" and "warw"', () => {
  assert.equal(top('loughb').id, 'loughborough');
  assert.equal(top('warw').id, 'warwick');
});
test('course names are suggested', () => {
  const s = suggest('economics and fin', unis, courses);
  assert.ok(s.some((x) => x.type === 'course' && x.label === 'Economics and Finance'));
});
const allCourses = [
  { name: 'Economics', uniId: 'bath', types: ['economics'] },
  { name: 'Economics', uniId: 'warwick', types: ['economics'] },
  { name: 'Accounting and Finance', uniId: 'lse', types: ['accounting-finance'] },
  { name: 'Philosophy, Politics and Economics', uniId: 'warwick', types: ['ppe'] },
  { name: 'Economics with Geography', uniId: 'york', types: ['economics-geography'] },
];
const U = Object.fromEntries(unis.map((u) => [u.id, u]));
const hits = (q) => {
  const m = makeMatcher(q, unis, allCourses);
  return allCourses.filter((c) => m(c, U[c.uniId]).score > 0).map((c) => `${c.uniId}:${c.name}`);
};
test('"bath economics" finds economics courses at that uni only', () => {
  assert.deepEqual(hits('bath economics'), ['bath:Economics']);
  assert.deepEqual(hits('warrick economics'), ['warwick:Economics', 'warwick:Philosophy, Politics and Economics']);
});
test('"economics" is a subject, not LSE\'s name', () => {
  assert.ok(!hits('economics').includes('lse:Accounting and Finance'));
  assert.ok(hits('economics').includes('bath:Economics'));
});
test('a uni name finds all its courses and marks them byUni', () => {
  const m = makeMatcher('warwick', unis, allCourses);
  assert.ok(m(allCourses[1], U.warwick).byUni);
  assert.deepEqual(hits('warwick'), ['warwick:Economics', 'warwick:Philosophy, Politics and Economics']);
});
test('type words: "ppe" and "geography" find the right courses', () => {
  assert.deepEqual(hits('ppe'), ['warwick:Philosophy, Politics and Economics']);
  assert.deepEqual(hits('geography'), ['york:Economics with Geography']);
});
test('typo in a subject: "econmics"', () => {
  assert.ok(hits('econmics').includes('bath:Economics'));
});
test('unrelated words do not match', () => {
  assert.equal(scoreNames('zzzz', ['University of Bath']), 0);
  assert.equal(top('qwerty'), undefined);
});
