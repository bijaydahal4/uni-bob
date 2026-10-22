// Loads the JSON data, links courses to unis and caches chance results for the current grades.

import { milesBetween } from './logic/geo.js';
import { computeChance, parseGrades, pointsOf, subjectKey, CHANCES } from './logic/grades.js';
import { effectiveProfile } from './store.js';

export const db = {
  unis: [], courses: [], programmes: [], timeline: { steps: [] }, glossary: {}, subjects: [], meta: {},
  uni: new Map(), course: new Map(), programme: new Map(), loaded: false,
};

const FILES = ['universities', 'programmes', 'timeline', 'glossary', 'subjects', 'meta'];

async function getJSON(name) {
  const r = await fetch(`data/${name}.json`, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`Couldn't load ${name} (${r.status})`);
  return r.json();
}

export const TYPE_LABELS = {
  economics: 'Economics',
  'economics-finance': 'Economics and Finance',
  'economics-accounting': 'Economics and Accounting',
  'business-economics': 'Business Economics',
  'economics-management': 'Economics and Management',
  'economics-politics': 'Economics and Politics',
  ppe: 'PPE',
  'economics-geography': 'Economics with Geography, Development or Environment',
  'behavioural-economics': 'Behavioural Economics or Psychology',
  'maths-economics': 'Maths and Economics, Econometrics',
  finance: 'Finance',
  'accounting-finance': 'Accounting and Finance',
  'business-management': 'Business and Management',
  'real-estate': 'Real Estate',
};

// Which of her A-levels a course type links to (for the "Fits your Geography" chip).
const SUBJECT_LINKS = {
  geography: ['economics-geography'],
  psychology: ['behavioural-economics'],
  mathematics: ['maths-economics'],
  'further mathematics': ['maths-economics'],
  politics: ['economics-politics', 'ppe'],
  business: ['business-economics', 'business-management', 'economics-management'],
  accounting: ['accounting-finance', 'economics-accounting'],
  philosophy: ['ppe'],
};

/** Grade-point equivalent of a course's typical offer (tariff → grades) for filters and sorting. */
function offerScore(offer) {
  if (!offer) return null;
  const g = parseGrades(offer.typical);
  if (g && offer.kind !== 'tariff') return pointsOf(g);
  if (typeof offer.tariff === 'number') return offer.tariff / 8 - 3;
  return g ? pointsOf(g) : null;
}

function mathsNeed(course) {
  const reqs = course.subjectRequirements || [];
  let best = null;
  for (const r of reqs) {
    if (!r?.subjects?.some((s) => subjectKey(s) === 'mathematics')) continue;
    // Only count it if Maths is required (not one option among many unrelated subjects).
    const onlyMaths = r.subjects.every((s) => ['mathematics', 'further mathematics'].includes(subjectKey(s)));
    if (!onlyMaths) continue;
    const g = r.minGrade || 'any';
    const order = { 'A*': 0, A: 1, B: 2, C: 3, D: 3, E: 3, any: 3 };
    if (best == null || order[g] < order[best]) best = g;
  }
  if (best == null) return 'none';
  if (best === 'A*') return 'astar';
  if (best === 'A') return 'a';
  if (best === 'B') return 'b';
  return 'any';
}

export async function loadData() {
  const [u, p, t, g, s, m] = await Promise.all(FILES.map(getJSON));
  db.meta = m;
  db.glossary = g.terms || {};
  db.subjects = s.subjects || [];
  db.timeline = t;
  db.unis = (u.unis || []).filter(Boolean);
  db.uni.clear(); db.course.clear(); db.programme.clear();
  db.courses = [];
  const home = m.home || null;
  for (const uni of db.unis) {
    uni.distance = home && uni.location?.lat != null && uni.location?.lng != null ? milesBetween(home, uni.location) : null;
    uni.isLondon = uni.region === 'London';
    db.uni.set(uni.id, uni);
    for (const c of uni.courses || []) {
      c.uniId = uni.id;
      c.uni = uni;
      c.offerScore = offerScore(c.offer);
      c.mathsNeed = mathsNeed(c);
      c.testStatus = c.admissionsTest?.status || 'none';
      db.course.set(c.id, c);
      db.courses.push(c);
    }
  }
  db.programmes = (p.programmes || []).filter(Boolean);
  for (const prog of db.programmes) db.programme.set(prog.id, prog);
  db.loaded = true;
  invalidate();
  return db;
}

// ---- Chances (cached per set of grades) --------------------------------------

let cacheKey = null;
let cache = new Map();

export function invalidate() { cacheKey = null; cache = new Map(); }

function profileKey(p) {
  return JSON.stringify([p.subjects.map((x) => [x.name, x.grade]), p.toggles]);
}

export function chanceFor(course, profile = effectiveProfile()) {
  const key = profileKey(profile);
  if (key !== cacheKey) { cacheKey = key; cache = new Map(); }
  if (!cache.has(course.id)) cache.set(course.id, computeChance(profile, course));
  return cache.get(course.id);
}

/** Uncached, for comparing a What-if with her real grades. */
export function chanceWith(profile, course) {
  return computeChance(profile, course);
}

export function countChances(courses, profile) {
  const out = Object.fromEntries(CHANCES.map((c) => [c, 0]));
  for (const c of courses) {
    const r = profile ? computeChance(profile, c) : chanceFor(c);
    if (r) out[r.chance]++;
  }
  return out;
}

/** Her A-levels that this course links to, e.g. ['Geography']. */
export function subjectLinks(course, subjects) {
  const types = course.types || [];
  const out = [];
  for (const s of subjects || []) {
    const linked = SUBJECT_LINKS[subjectKey(s.name)];
    if (linked && linked.some((t) => types.includes(t))) out.push(s.name === 'Mathematics' ? 'Maths' : s.name);
  }
  return out;
}

export function programmesForUni(uniId) {
  return db.programmes.filter((p) => (p.uniIds || []).includes(uniId) || (p.lowersOfferAt || []).includes(uniId));
}

export function glossary(key) {
  return db.glossary[key] || null;
}
