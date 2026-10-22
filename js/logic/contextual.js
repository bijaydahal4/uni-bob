// A simple, honest estimate of whether a uni's published contextual criteria fit her answers.
// Only the uni can decide; this just reads their published criteria against the checklist.

export const CHECKLIST = [
  { key: 'area', label: 'I live in an area where fewer young people go to uni', kind: 'quintile' },
  { key: 'fsm', label: 'I get (or have had) free school meals' },
  { key: 'school', label: "My school or sixth form's results are below the national average" },
  { key: 'firstGen', label: "I'd be the first in my family to go to uni" },
  { key: 'care', label: "I've been in care" },
  { key: 'carer', label: "I'm a young carer" },
  { key: 'estranged', label: "I'm estranged from my parents" },
  { key: 'refugee', label: "I'm a refugee or asylum seeker" },
  { key: 'income', label: 'My household income is low' },
  { key: 'access', label: "I've taken part in a uni access programme" },
];

export const LEVELS = {
  likely: 'Likely', possible: 'Possible', unlikely: 'Unlikely', unknown: 'Not confirmed', none: 'No contextual offers', unanswered: 'Answer the checklist',
};

// Area measures she can answer from the Office for Students postcode checker.
const OFS_MEASURES = new Set(['POLAR4', 'POLAR', 'TUNDRA', null, undefined, '']);

export function answeredCount(answers = {}) {
  return CHECKLIST.filter((c) => answers[c.key] !== undefined && answers[c.key] !== null && answers[c.key] !== '').length;
}

/** true / false / null (can't tell from her answers). */
export function meetsCriterion(c, answers = {}) {
  if (!c) return null;
  if (c.key === 'area') {
    const q = Number(answers.area);
    if (!q) return answers.area === 0 ? false : null;
    if (!OFS_MEASURES.has(c.measure ? String(c.measure).toUpperCase() : c.measure)) return null; // e.g. IMD/ACORN: use the uni's checker
    if (!Array.isArray(c.quintiles) || !c.quintiles.length) return null;
    return c.quintiles.includes(q);
  }
  if (c.key === 'other') return null;
  const a = answers[c.key];
  if (a === true) return true;
  if (a === false) return false;
  return null;
}

/**
 * Estimate for one uni: { level, met, unknown } where level is a key of LEVELS.
 */
export function estimate(uni, answers = {}) {
  const ctx = uni?.contextual;
  if (!ctx || ctx.offersContextual == null) return { level: 'unknown', met: [], unknown: [] };
  if (ctx.offersContextual === false) return { level: 'none', met: [], unknown: [] };
  const criteria = (ctx.criteria || []).filter(Boolean);
  if (!criteria.length) return { level: 'unknown', met: [], unknown: [] };
  if (!answeredCount(answers)) return { level: 'unanswered', met: [], unknown: [] };
  const met = [];
  const unknown = [];
  for (const c of criteria) {
    const r = meetsCriterion(c, answers);
    if (r === true) met.push(c);
    else if (r === null) unknown.push(c);
  }
  if (met.some((c) => c.alone === true)) return { level: 'likely', met, unknown };
  const need = Number(ctx.minCriteria) || null;
  if (need && met.length >= need) return { level: 'likely', met, unknown };
  if (!need && met.length >= 2) return { level: 'likely', met, unknown };
  if (met.length >= 1) return { level: 'possible', met, unknown };
  return { level: 'unlikely', met, unknown };
}
