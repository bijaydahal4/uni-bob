import { test, assert } from './harness.js';
import { programmeStatus, youAreHereIndex, formatDate, isStale, parseISO } from '../js/logic/dates.js';
import { milesBetween, roundMiles, distanceText } from '../js/logic/geo.js';

const on = (s) => parseISO(s);
const prog = (opens, deadline, infoYear = 2027) => ({
  opens: { date: opens, status: 'Confirmed' }, deadline: { date: deadline, status: 'Confirmed' }, infoYear,
});

test('status: not open yet / open / closing soon / closed', () => {
  const p = prog('2027-01-10', '2027-03-15');
  assert.equal(programmeStatus(p, on('2026-10-17')).key, 'notYet');
  assert.equal(programmeStatus(p, on('2027-02-01')).key, 'open');
  assert.equal(programmeStatus(p, on('2027-03-01')).key, 'closingSoon'); // 14 days left
  assert.equal(programmeStatus(p, on('2027-03-15')).key, 'closingSoon'); // deadline day
  assert.equal(programmeStatus(p, on('2027-03-16')).key, 'closed');
});

test('status: last year\'s details mean this year is not open yet', () => {
  const st = programmeStatus(prog('2026-01-10', '2026-03-15', 2026), on('2026-10-17'));
  assert.equal(st.key, 'notYet');
  assert.ok(st.old);
});

test('status: no dates → not announced', () => {
  assert.equal(programmeStatus({ infoYear: 2027 }, on('2026-10-17')).key, 'unknown');
});

test('You are here sits before the first future step', () => {
  const steps = [{ date: '2026-09-01' }, { date: '2026-10-01' }, { date: '2027-01-15' }, { date: '2028-08-17' }];
  assert.equal(youAreHereIndex(steps, on('2026-10-17')), 2);
  assert.equal(youAreHereIndex(steps, on('2029-01-01')), 4);
});

test('friendly dates', () => {
  assert.equal(formatDate('2026-10-17'), '17 October 2026');
  assert.equal(formatDate('2027-03-05', { short: true }), '5 Mar 2027');
});

test('data older than 4 months is stale', () => {
  assert.ok(!isStale('2026-10-17', on('2027-01-17')));
  assert.ok(isStale('2026-10-17', on('2027-03-01')));
});

test('distance: Bournemouth to Bath is roughly 50 miles', () => {
  const m = milesBetween({ lat: 50.72, lng: -1.88 }, { lat: 51.378, lng: -2.326 });
  assert.ok(m > 45 && m < 55, `got ${m}`);
  assert.equal(roundMiles(123), 120);
  assert.equal(roundMiles(47), 45);
  assert.equal(distanceText(123), 'About 120 miles from Bournemouth');
});
