// Grade maths and the Safe → Reach chance logic. Pure functions, no DOM, so they can be unit tested.

export const GRADES = ['A*', 'A', 'B', 'C', 'D', 'E', 'U'];
export const GRADE_POINTS = { 'A*': 6, A: 5, B: 4, C: 3, D: 2, E: 1, U: 0 };
// Official UCAS tariff points for A-levels (checked on ucas.com).
export const TARIFF_POINTS = { 'A*': 56, A: 48, B: 40, C: 32, D: 24, E: 16, U: 0 };
export const TARIFF_PER_GRADE = 8;

export const CHANCES = ['safe', 'good', 'match', 'reach', 'longshot'];
export const CHANCE_LABELS = {
  safe: 'Safe', good: 'Good chance', match: 'Match', reach: 'Reach', longshot: 'Long shot',
};

// A course is "very competitive" if the uni officially says so in numbers.
export const VERY_COMPETITIVE = { applicationsPerPlace: 10, offerRate: 0.2 };

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const num = (n) => (n <= 10 ? WORDS[n] : String(n));
const grades = (n) => `${num(n)} grade${n === 1 ? '' : 's'}`;

/** "A*AA" → ['A*','A','A']; null if it isn't a valid grade string. */
export function parseGrades(str) {
  if (!str || typeof str !== 'string') return null;
  const s = str.toUpperCase().replace(/[\s,]+/g, '');
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (!'ABCDEU'.includes(c)) return null;
    if (c === 'A' && s[i + 1] === '*') { out.push('A*'); i++; } else out.push(c);
  }
  return out.length ? out : null;
}

export const isGrade = (g) => Object.prototype.hasOwnProperty.call(GRADE_POINTS, g);
export const pointsOf = (list) => list.reduce((t, g) => t + (GRADE_POINTS[g] ?? 0), 0);
export const tariffOf = (list) => list.reduce((t, g) => t + (TARIFF_POINTS[g] ?? 0), 0);
export const meetsGrade = (have, need) => !need || (isGrade(have) && GRADE_POINTS[have] >= GRADE_POINTS[need]);
export const sortGrades = (list) => [...list].sort((a, b) => GRADE_POINTS[b] - GRADE_POINTS[a]);
export const gradesString = (list) => sortGrades(list).join('');

/** Points for an offer string like "A*AA" (null if not a grade offer). */
export function offerPoints(str) {
  const g = parseGrades(str);
  return g ? pointsOf(g) : null;
}

// ---- Subject names -------------------------------------------------------

const SUBJECT_ALIASES = {
  maths: 'mathematics', math: 'mathematics', 'a level maths': 'mathematics', 'a level mathematics': 'mathematics',
  'further maths': 'further mathematics', 'further math': 'further mathematics',
  'english lit': 'english literature', 'english lang': 'english language',
  'english language and literature': 'english language and literature',
  'government and politics': 'politics', 'government politics': 'politics',
  'business studies': 'business',
  'computing': 'computer science', 'ict': 'information technology', 're': 'religious studies',
  'pe': 'physical education', 'sociology': 'sociology', 'psychology': 'psychology', 'geography': 'geography',
};

/** Canonical key for a subject name so "Maths" matches "Mathematics". */
export function subjectKey(name) {
  const k = String(name || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return SUBJECT_ALIASES[k] || k;
}

const groupHas = (group, subject) => group.subjects.some((s) => subjectKey(s) === subjectKey(subject.name));

/** Short label used in sentences: "Mathematics" → "Maths". */
export function subjectLabel(name) {
  const k = subjectKey(name);
  if (k === 'mathematics') return 'Maths';
  if (k === 'further mathematics') return 'Further Maths';
  return String(name).replace(/^A[- ]level\s+/i, '');
}

function* combinations(list, k, start = 0, acc = []) {
  if (acc.length === k) { yield acc; return; }
  for (let i = start; i < list.length; i++) yield* combinations(list, k, i + 1, [...acc, list[i]]);
}

/**
 * Pick the three A-levels to count: required subjects must be among them,
 * then the highest grades. Returns { counted, points, tariff, padded }.
 */
export function selectCounted(subjects, groups = []) {
  const subs = (subjects || []).filter((s) => s && isGrade(s.grade) && String(s.name || '').trim());
  const n = Math.min(3, subs.length);
  let best = null;
  for (const combo of combinations(subs, n)) {
    const covered = groups.filter((g) => combo.some((s) => groupHas(g, s))).length;
    const pts = pointsOf(combo.map((s) => s.grade));
    if (!best || covered > best.covered || (covered === best.covered && pts > best.points)) {
      best = { combo, covered, points: pts };
    }
  }
  const counted = best ? best.combo : [];
  // Fewer than three A-levels: the missing ones count as nothing.
  const padded = 3 - counted.length;
  const list = counted.map((s) => s.grade);
  return { counted, points: pointsOf(list), tariff: tariffOf(list), padded, grades: list };
}

/** Requirement groups the app can check automatically (named A-level subjects). */
export function checkableGroups(course) {
  return (course.subjectRequirements || []).filter((g) => g && Array.isArray(g.subjects) && g.subjects.length && g.checkable !== false);
}

/** For each requirement: is it met, missing (not taking it) or unmet (grade too low)? */
export function checkSubjects(counted, groups) {
  return groups.map((g) => {
    const matches = counted.filter((s) => groupHas(g, s));
    if (!matches.length) return { group: g, status: 'missing', have: null };
    const bestSub = matches.reduce((a, b) => (GRADE_POINTS[b.grade] > GRADE_POINTS[a.grade] ? b : a));
    const ok = meetsGrade(bestSub.grade, g.minGrade);
    return { group: g, status: ok ? 'met' : 'unmet', have: bestSub.grade, subject: bestSub.name };
  });
}

export function chanceFromGap(gap) {
  if (gap >= 2) return 'safe';
  if (gap === 1) return 'good';
  if (gap === 0) return 'match';
  if (gap === -1) return 'reach';
  return 'longshot';
}

const idx = (c) => CHANCES.indexOf(c);
const atBest = (c, cap) => CHANCES[Math.max(idx(c), idx(cap))];
const stepTowardsReach = (c) => CHANCES[Math.min(idx(c) + 1, CHANCES.length - 1)];

export function isVeryCompetitive(comp) {
  if (!comp) return false;
  if (typeof comp.applicationsPerPlace === 'number' && comp.applicationsPerPlace >= VERY_COMPETITIVE.applicationsPerPlace) return true;
  if (typeof comp.offerRate === 'number' && comp.offerRate > 0 && comp.offerRate <= VERY_COMPETITIVE.offerRate) return true;
  return false;
}

/** The offer as points on one scale. Grade offers use grade points; tariff offers use UCAS points. */
function offerBasis(offer) {
  if (!offer) return null;
  const top = parseGrades(offer.typical);
  if (offer.kind !== 'tariff' && top) {
    const low = parseGrades(offer.low);
    return { kind: 'grades', top: pointsOf(top), low: low ? pointsOf(low) : null, label: gradesString(top), lowLabel: low ? gradesString(low) : null };
  }
  if (typeof offer.tariff === 'number') {
    return { kind: 'tariff', top: offer.tariff, low: typeof offer.tariffLow === 'number' ? offer.tariffLow : null, label: `${offer.tariff} UCAS points`, lowLabel: offer.tariffLow ? `${offer.tariffLow} points` : null };
  }
  if (top) return { kind: 'grades', top: pointsOf(top), low: null, label: gradesString(top), lowLabel: null };
  return null;
}

/** Gap in "grades" between her and an offer basis. Tariff gaps use 8 points ≈ one grade, rounded down. */
function gapFor(sel, basis, value = basis.top) {
  if (basis.kind === 'tariff') return Math.floor((sel.tariff - value) / TARIFF_PER_GRADE);
  return sel.points - value;
}

const ALT_LABELS = {
  epq: 'with an EPQ', contextual: 'with a contextual offer', accessProgramme: 'with the access programme',
  summerSchool: 'with the summer school', tmua: 'with your TMUA score', other: 'with an alternative offer',
};
export const altLabel = (type) => ALT_LABELS[type] || ALT_LABELS.other;

/** Does a What-if toggle unlock this alternative offer? Only officially published offers are in the data. */
export function altApplies(alt, toggles) {
  if (!toggles || !alt) return false;
  switch (alt.type) {
    case 'epq':
      return !!toggles.epq?.on && meetsGrade(toggles.epq.grade || 'A', alt.epqGrade || 'A');
    case 'contextual':
      return !!toggles.contextual;
    case 'accessProgramme':
    case 'summerSchool':
      return !!toggles.summerSchool;
    case 'tmua':
      return !!toggles.tmua?.on && typeof alt.tmuaMinScore === 'number' && Number(toggles.tmua.score) >= alt.tmuaMinScore;
    default:
      return false;
  }
}

function capGrade(minGrade, offerGrades) {
  if (!minGrade || !offerGrades?.length) return minGrade;
  const best = sortGrades(offerGrades)[0];
  return GRADE_POINTS[minGrade] > GRADE_POINTS[best] ? best : minGrade;
}

function evaluate(profileSubjects, course, offer, groupsOverride) {
  const basis = offerBasis(offer);
  if (!basis) return null;
  const groups = groupsOverride || checkableGroups(course);
  const sel = selectCounted(profileSubjects, groups);
  const checks = checkSubjects(sel.counted, groups);
  const gap = gapFor(sel, basis);
  let chance = chanceFromGap(gap);
  const missing = checks.filter((c) => c.status === 'missing');
  const unmet = checks.filter((c) => c.status === 'unmet');
  if (missing.length) chance = 'longshot';
  else if (unmet.length) chance = atBest(chance, 'reach');
  return { basis, sel, checks, gap, chance, missing, unmet, groups };
}

function relation(ev, totalSubjects) {
  const { basis, sel, gap } = ev;
  const her = gradesString(sel.grades) || 'grades';
  const yours = totalSubjects > 3 ? `Your best three (${her})` : `Your ${her}`;
  if (basis.kind === 'tariff') {
    const diff = sel.tariff - basis.top;
    const base = `${yours} is worth ${sel.tariff} UCAS points`;
    if (diff === 0) return `${base}, exactly their usual offer`;
    return `${base}, ${Math.abs(diff)} ${diff > 0 ? 'more' : 'fewer'} than their usual offer of ${basis.top}`;
  }
  if (gap === 0) return `${yours} matches their usual offer of ${basis.label}`;
  return `${yours} is ${grades(Math.abs(gap))} ${gap > 0 ? 'above' : 'below'} their usual offer of ${basis.label}`;
}

function tail(chance) {
  switch (chance) {
    case 'safe': return ', so this looks safe.';
    case 'good': return ', so you have a good chance.';
    case 'match': return '.';
    case 'reach': return ', so this is a reach.';
    default: return ', so this is a long shot.';
  }
}

function buildSentence(ev, totalSubjects, competition) {
  if (ev.missing.length) {
    const names = ev.missing[0].group.subjects.map(subjectLabel).join(' or ');
    return `This course needs A-level ${names}, which you're not taking, so it's a long shot.`;
  }
  const rel = relation(ev, totalSubjects);
  if (ev.unmet.length) {
    const u = ev.unmet[0];
    const need = `${article(u.group.minGrade)} ${u.group.minGrade} in ${subjectLabel(u.subject)}`;
    if (ev.gap >= 0) return `${rel}, but they need ${need} and you have ${article(u.have)} ${u.have}, so the best it can be is a reach.`;
    return `${rel}, and they need ${need} (you have ${article(u.have)} ${u.have}), so this is ${ev.chance === 'reach' ? 'a reach' : 'a long shot'}.`;
  }
  if (competition && SHIFTABLE.has(ev.chance)) {
    return `${rel}, but it's very competitive${competitionText(competition)}, so we've moved it one step towards Reach.`;
  }
  return rel + tail(ev.chance);
}

// Very competitive courses move one step towards Reach (Reach and Long shot stay as they are).
const SHIFTABLE = new Set(['safe', 'good', 'match']);

function extraSubjectNotes(ev) {
  if (ev.missing.length) return ev.missing.slice(1).map((m) => `They also need A-level ${m.group.subjects.map(subjectLabel).join(' or ')}.`);
  return ev.unmet.slice(1).map((u) => `They also need ${article(u.group.minGrade)} ${u.group.minGrade} in ${subjectLabel(u.subject)} (you have ${article(u.have)} ${u.have}).`);
}

const article = (g) => (g === 'A' || g === 'A*' || g === 'E' ? 'an' : 'a');

/**
 * Work out her chance for one course.
 * profile = { subjects: [{name, grade}], toggles?: {epq, contextual, summerSchool, tmua} }
 * Returns null when the course has no confirmed offer.
 */
/** Her subjects the course says it doesn't accept (e.g. General Studies). */
export function excludedSubjects(subjects, course) {
  const no = new Set((course.notAccepted || []).map(subjectKey));
  return (subjects || []).filter((s) => no.has(subjectKey(s.name)));
}

export function computeChance(profile, course) {
  const all = profile?.subjects || [];
  const excluded = excludedSubjects(all, course);
  const subjects = excluded.length ? all.filter((s) => !excluded.includes(s)) : all;
  const ev = evaluate(subjects, course, course.offer);
  if (!ev) return null;
  const notes = extraSubjectNotes(ev);
  for (const x of excluded) notes.unshift(`They don't accept ${subjectLabel(x.name)}, so it isn't counted.`);
  let chance = ev.chance;
  const competitive = isVeryCompetitive(course.competition);
  const sentence = buildSentence(ev, subjects.length, competitive ? course.competition : null);

  if (ev.basis.low != null && ev.basis.lowLabel) {
    notes.push(`Their offers range from ${ev.basis.label} to ${ev.basis.lowLabel}, so we use the top of the range.`);
  }

  if (competitive && SHIFTABLE.has(chance)) chance = stepTowardsReach(chance);

  // What-if: officially published lower offers she'd unlock.
  let effective = null;
  const toggles = profile?.toggles;
  if (toggles) {
    for (const alt of course.alternativeOffers || []) {
      if (!altApplies(alt, toggles)) continue;
      const altOffer = { kind: alt.tariff ? 'tariff' : 'grades', typical: alt.offer, tariff: alt.tariff ?? null };
      const altGrades = parseGrades(alt.offer);
      const groups = alt.subjectRequirements
        || checkableGroups(course).map((g) => ({ ...g, minGrade: capGrade(g.minGrade, altGrades) }));
      const aev = evaluate(subjects, course, altOffer, groups);
      if (!aev || aev.basis.kind !== ev.basis.kind) continue;
      if (aev.basis.top >= ev.basis.top) continue;
      let altChance = aev.chance;
      if (competitive && SHIFTABLE.has(altChance)) altChance = stepTowardsReach(altChance);
      if (!effective || idx(altChance) < idx(effective.chance) || (altChance === effective.chance && aev.basis.top < effective.ev.basis.top)) {
        effective = { alt, ev: aev, chance: altChance };
      }
    }
  }

  const markers = [];
  const usual = { kind: 'usual', label: 'Usual offer', value: ev.basis.top, text: ev.basis.label };
  let finalChance = chance;
  let finalSentence = sentence;
  let reference = ev.basis;
  if (effective && idx(effective.chance) < idx(chance)) {
    finalChance = effective.chance;
    reference = effective.ev.basis;
    const what = altLabel(effective.alt.type);
    finalSentence = `${sentence.replace(/\.$/, '')}. ${capital(what)}, their offer could be ${effective.ev.basis.label}${effective.chance === 'match' ? ', which you match.' : `, so it becomes ${CHANCE_LABELS[effective.chance].toLowerCase()}.`}`;
    markers.push(usual, { kind: 'alt', label: `Your offer ${what}`, value: effective.ev.basis.top, text: effective.ev.basis.label, type: effective.alt.type });
  } else {
    markers.push(usual);
  }

  return {
    chance: finalChance,
    label: CHANCE_LABELS[finalChance],
    sentence: finalSentence,
    notes,
    gap: ev.gap,
    her: gradesString(ev.sel.grades),
    herTariff: ev.sel.tariff,
    offerLabel: ev.basis.label,
    basis: ev.basis,
    reference,
    markers,
    range: ev.basis.low != null ? { top: ev.basis.top, low: ev.basis.low } : null,
    checks: ev.checks,
    excluded,
    competitive,
    usedAlt: effective && idx(effective.chance) < idx(chance) ? effective.alt : null,
    position: positionFor(finalChance, effective && idx(effective.chance) < idx(chance) ? gapFor(effective.ev.sel, effective.ev.basis) : ev.gap),
  };
}

const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function competitionText(comp) {
  if (typeof comp.applicationsPerPlace === 'number') return ` (about ${Math.round(comp.applicationsPerPlace)} applications per place)`;
  if (typeof comp.offerRate === 'number') return ` (about ${Math.round(comp.offerRate * 100)}% of applicants get an offer)`;
  return '';
}

// ---- Slider geometry ------------------------------------------------------
// The bar runs Safe (left) → Reach/Long shot (right). Five equal zones; one grade = one zone.

const ZONE_CENTRE = { safe: 10, good: 30, match: 50, reach: 70, longshot: 90 };

export function positionFor(chance, gap) {
  if (chance === 'safe' && gap >= 3) return 5;
  if (chance === 'longshot' && gap <= -3) return 95;
  return ZONE_CENTRE[chance];
}

/** Where an offer line sits, relative to the offer the zones are centred on. */
export function markerPosition(value, reference) {
  const step = reference.kind === 'tariff' ? TARIFF_PER_GRADE : 1;
  const pos = 50 - ((value - reference.top) / step) * 20;
  return Math.max(3, Math.min(97, pos));
}

/** Grade points for a profile's best three (used for summaries). */
export function profileSummary(subjects) {
  const sel = selectCounted(subjects, []);
  return { grades: gradesString(sel.grades), points: sel.points, tariff: sel.tariff };
}
