// Explore filters and sorting.

export const GRADE_STEPS = [
  { label: 'A*A*A*', pts: 18 }, { label: 'A*A*A', pts: 17 }, { label: 'A*AA', pts: 16 }, { label: 'AAA', pts: 15 },
  { label: 'AAB', pts: 14 }, { label: 'ABB', pts: 13 }, { label: 'BBB', pts: 12 }, { label: 'BBC', pts: 11 },
  { label: 'BCC', pts: 10 }, { label: 'CCC', pts: 9 },
];
export const GRADE_TOP = 17; // "A*A*A or higher"
export const GRADE_BOTTOM = 9; // "CCC or lower"

export const DEFAULT_MILES = 200;
export const MAX_MILES = 450; // slider end = any distance
export const NEAR_HOME_MILES = 75;

export const REGIONS = ['London', 'South East', 'South West', 'East of England', 'Midlands', 'North', 'Wales', 'Scotland', 'Northern Ireland'];

export function defaultFilters() {
  return {
    rgOnly: false, types: [], gradeHigh: GRADE_TOP, gradeLow: GRADE_BOTTOM, chances: [], maths: [], test: [],
    maxMiles: DEFAULT_MILES, regions: [], setting: 'any', london: 'any', yearAbroad: false, foundation: false, savedOnly: false,
  };
}

/** Number of filters changed from the defaults (for the Filters button badge). */
export function activeCount(f) {
  const d = defaultFilters();
  let n = 0;
  for (const k of Object.keys(d)) {
    if (k === 'gradeHigh' || k === 'gradeLow') continue;
    if (JSON.stringify(f[k]) !== JSON.stringify(d[k])) n++;
  }
  if (f.gradeHigh !== d.gradeHigh || f.gradeLow !== d.gradeLow) n++;
  return n;
}

/**
 * Why a course is hidden by the filters ([] = it passes).
 * ctx = { chance(course), isSaved(course) }
 */
export function filterReasons(course, f, ctx) {
  const u = course.uni;
  const out = [];
  if (f.rgOnly && !u.russellGroup) out.push('not Russell Group');
  if (f.types.length && !(course.types || []).some((t) => f.types.includes(t))) out.push('different course type');
  if (course.offerScore != null) {
    const hi = f.gradeHigh >= GRADE_TOP ? Infinity : f.gradeHigh;
    const lo = f.gradeLow <= GRADE_BOTTOM ? -Infinity : f.gradeLow;
    if (course.offerScore > hi || course.offerScore < lo) out.push('entry grades outside your range');
  } else if (f.gradeHigh < GRADE_TOP || f.gradeLow > GRADE_BOTTOM) {
    out.push('entry grades not confirmed');
  }
  if (f.chances.length) {
    const r = ctx.chance(course);
    if (!r || !f.chances.includes(r.chance)) out.push('different chance');
  }
  if (f.maths.length && !f.maths.includes(course.mathsNeed)) out.push('different Maths requirement');
  if (f.test.length && !f.test.includes(course.testStatus)) out.push('different admissions test');
  if (f.maxMiles < MAX_MILES) {
    if (u.distance == null) out.push('distance not confirmed');
    else if (u.distance > f.maxMiles) out.push(`${Math.round(u.distance / 10) * 10} miles away`);
  }
  if (f.regions.length && !f.regions.includes(u.region)) out.push(`in ${u.region}`);
  if (f.setting !== 'any' && u.setting !== f.setting && u.setting !== 'mixed') out.push(u.setting === 'campus' ? 'campus uni' : 'city uni');
  if (f.london === 'london' && !u.isLondon) out.push('not in London');
  if (f.london === 'notLondon' && u.isLondon) out.push('in London');
  if (f.yearAbroad && !['optional', 'required'].includes(course.options?.yearAbroad)) out.push('no year abroad');
  if (f.foundation && course.options?.foundationYear !== 'available') out.push('no foundation year');
  if (f.savedOnly && !ctx.isSaved(course)) out.push('not saved');
  return out;
}

const CHANCE_FIT = { good: 3, match: 3, safe: 2, reach: 1.5, longshot: 0 };

/** "Best match for me": realistic chances at highly ranked unis, plus courses that fit her subjects. */
export function bestMatchScore(course, r, links = []) {
  const rank = course.uni.rank?.overall;
  const rankScore = rank ? 1 - Math.min(rank - 1, 130) / 130 : 0.3;
  const fit = r ? CHANCE_FIT[r.chance] : 0.5;
  return rankScore * 3 + fit + (links.length ? 0.5 : 0) - (course.notOpen ? 10 : 0);
}

export const SORTS = {
  best: 'Best match for me',
  rank: 'League table rank',
  gradesHigh: 'Entry grades: high to low',
  gradesLow: 'Entry grades: low to high',
  distance: 'Distance',
  az: 'A to Z',
};

export function sortCourses(list, sort, ctx) {
  const byName = (a, b) => a.uni.name.localeCompare(b.uni.name) || a.name.localeCompare(b.name);
  const rank = (c) => c.uni.rank?.overall ?? 999;
  const offer = (c) => c.offerScore ?? -1;
  const cmp = {
    best: (a, b) => ctx.best(b) - ctx.best(a) || rank(a) - rank(b) || byName(a, b),
    rank: (a, b) => rank(a) - rank(b) || byName(a, b),
    gradesHigh: (a, b) => offer(b) - offer(a) || rank(a) - rank(b) || byName(a, b),
    gradesLow: (a, b) => (offer(a) < 0 ? 99 : offer(a)) - (offer(b) < 0 ? 99 : offer(b)) || rank(a) - rank(b) || byName(a, b),
    distance: (a, b) => (a.uni.distance ?? 9999) - (b.uni.distance ?? 9999) || byName(a, b),
    az: (a, b) => a.name.localeCompare(b.name) || a.uni.name.localeCompare(b.uni.name),
  }[sort] || ((a, b) => byName(a, b));
  return [...list].sort(cmp);
}
