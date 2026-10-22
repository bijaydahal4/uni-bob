// Typo-tolerant search for unis and courses. Pure functions (no DOM).

export function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export const tokenize = (s) => normalize(s).split(' ').filter(Boolean);

// Words that don't need to match (people often leave them out or add them).
const OPTIONAL = new Set(['university', 'uni', 'of', 'the', 'and', 'at', 'in', 'with', 'for', 'college', 'bsc', 'ba', 'ma', 'hons', 'degree', 'course', 'courses']);

/** Optimal string alignment distance (Levenshtein + adjacent swaps). */
export function editDistance(a, b, max = 99) {
  if (a === b) return 0;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  let prev2 = null;
  let prev = Array.from({ length: lb + 1 }, (_, j) => j);
  for (let i = 1; i <= la; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[lb];
}

function bigrams(s) {
  const out = new Map();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    out.set(g, (out.get(g) || 0) + 1);
  }
  return out;
}

/** Dice similarity of letter pairs (0–1). Copes with jumbled letters like "loughbourgh". */
export function dice(a, b) {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const A = bigrams(a), B = bigrams(b);
  let common = 0;
  for (const [g, n] of A) common += Math.min(n, B.get(g) || 0);
  return (2 * common) / (a.length - 1 + b.length - 1);
}

const allowedTypos = (len) => (len <= 3 ? 0 : len <= 5 ? 1 : len <= 8 ? 2 : 3);

/** How well one typed word matches one word of a name: 0 (no) to 1 (exact). */
export function wordScore(q, t) {
  if (!q || !t) return 0;
  if (q === t) return 1;
  if (t.startsWith(q)) return q.length >= 2 ? 0.9 : 0.5;
  const typos = allowedTypos(q.length);
  if (!typos) return 0;
  // Typo while still typing: compare with the start of the word.
  if (t.length > q.length) {
    const d = editDistance(q, t.slice(0, q.length), typos);
    if (d <= Math.min(1, typos)) return 0.7;
  }
  const d = editDistance(q, t, typos);
  if (d <= typos) return 0.8 - d * 0.1;
  if (q.length >= 6 && dice(q, t) >= 0.6) return 0.5;
  return 0;
}

/**
 * Score a query against a list of name variants (e.g. a uni's name, short name and nicknames).
 * Every important typed word must match something. Returns 0–1.2.
 */
export function scoreNames(query, names) {
  const qTokens = tokenize(query);
  if (!qTokens.length) return 0;
  const qNorm = qTokens.join(' ');
  let best = 0;
  for (const name of names) {
    if (!name) continue;
    const norm = normalize(name);
    if (!norm) continue;
    if (norm === qNorm) return 1.2; // exact name or nickname, e.g. "kcl"
    const tTokens = norm.split(' ');
    const important = qTokens.filter((t) => !OPTIONAL.has(t));
    const use = important.length ? important : qTokens;
    let total = 0;
    let ok = true;
    for (const q of use) {
      let s = 0;
      for (const t of tTokens) s = Math.max(s, wordScore(q, t));
      if (s === 0) { ok = false; break; }
      total += s;
    }
    if (!ok) continue;
    let score = total / use.length;
    if (norm.startsWith(qNorm)) score += 0.1; // typed the start of the name
    best = Math.max(best, score);
  }
  return best;
}

export function uniNames(uni) {
  return [uni.name, uni.shortName, ...(uni.aliases || []), uni.city];
}

/**
 * Build suggestions for the search box: unis first, then course names.
 * courses: [{ name, uniId }]. Returns [{ type, id, label, sub, score }].
 */
export function suggest(query, unis, courses, limit = 8) {
  const q = normalize(query);
  if (!q) return [];
  const uniHits = [];
  for (const u of unis) {
    const s = scoreNames(q, uniNames(u));
    if (s >= 0.5) uniHits.push({ type: 'uni', id: u.id, label: u.name, sub: u.city, score: s + (u.shortName && normalize(u.shortName) === q ? 0.2 : 0) });
  }
  const byName = new Map();
  for (const c of courses) {
    const key = normalize(c.name);
    if (!byName.has(key)) byName.set(key, { name: c.name, count: 0 });
    byName.get(key).count++;
  }
  const courseHits = [];
  for (const [key, v] of byName) {
    const s = scoreNames(q, [v.name]);
    if (s >= 0.6) courseHits.push({ type: 'course', id: key, label: v.name, sub: `${v.count} course${v.count === 1 ? '' : 's'}`, score: s, count: v.count });
  }
  uniHits.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  courseHits.sort((a, b) => b.score - a.score || b.count - a.count || a.label.localeCompare(b.label));
  const uniTake = Math.min(uniHits.length, courseHits.length ? Math.max(3, limit - Math.min(courseHits.length, 4)) : limit);
  return [...uniHits.slice(0, uniTake), ...courseHits].slice(0, limit);
}

// Extra words a course can be found by, from its type (e.g. "PPE", "Geography").
const TYPE_WORDS = {
  ppe: ['PPE', 'Philosophy Politics and Economics'],
  'maths-economics': ['Econometrics', 'Mathematics and Economics', 'Maths'],
  'behavioural-economics': ['Behavioural Economics', 'Psychology'],
  'economics-geography': ['Geography', 'Development', 'Environment'],
  'accounting-finance': ['Accounting and Finance'],
  'business-management': ['Business and Management'],
  'real-estate': ['Real Estate', 'Property'],
  'economics-politics': ['Politics'],
};

export function courseNames(course) {
  return [course.name, ...(course.types || []).flatMap((t) => TYPE_WORDS[t] || [])];
}

/**
 * Build a matcher for a query. Words that look like subjects ("economics", "finance") match course
 * names; other words ("warwick", "kcl") match uni names. "warwick economics" = Economics at Warwick.
 * Returns null for an empty query, else (course, uni) => { score, byUni }.
 */
export function makeMatcher(query, unis, courses) {
  const all = tokenize(query);
  if (!all.length) return null;
  const tokens = all.filter((t) => !OPTIONAL.has(t));
  const use = tokens.length ? tokens : all;
  const uniWords = new Set(unis.flatMap((u) => uniNames(u).flatMap(tokenize)));
  const courseWords = new Set(courses.flatMap((c) => courseNames(c).flatMap(tokenize)).filter((t) => !OPTIONAL.has(t)));
  const best = (q, set) => { let b = 0; for (const t of set) { const s = wordScore(q, t); if (s > b) b = s; if (b === 1) break; } return b; };
  const uniPart = [];
  const coursePart = [];
  for (const q of use) {
    const c = best(q, courseWords);
    const u = best(q, uniWords);
    if (c >= 0.9) coursePart.push(q);
    else if (u >= 0.9) uniPart.push(q);
    else if (c > 0 && c >= u) coursePart.push(q);
    else uniPart.push(q);
  }
  const uq = uniPart.join(' ');
  const cq = coursePart.join(' ');
  return (course, uni) => {
    const us = uq ? scoreNames(uq, uniNames(uni)) : null;
    const cs = cq ? scoreNames(cq, courseNames(course)) : null;
    if (us !== null && cs !== null) {
      if (us < 0.5 || cs < 0.5) return { score: 0, byUni: false };
      return { score: (us + cs) / 2, byUni: us >= 0.7 };
    }
    if (us !== null) return us >= 0.5 ? { score: us, byUni: us >= 0.7 } : { score: 0, byUni: false };
    return cs >= 0.6 ? { score: cs, byUni: false } : { score: 0, byUni: false };
  };
}
