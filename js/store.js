// Everything she enters lives here, saved in this browser only (localStorage). No server, no tracking.

const KEY = 'unibob:v1';
const VERSION = 1;
export const MAX_WHATIFS = 5;

export const DEFAULT_SUBJECTS = [
  { id: 's1', name: 'Mathematics', board: 'Edexcel', grade: 'A' },
  { id: 's2', name: 'Geography', board: 'AQA', grade: 'A' },
  { id: 's3', name: 'Psychology', board: 'Edexcel', grade: 'A' },
];

export function defaults() {
  return {
    version: VERSION,
    profile: { name: '', subjects: DEFAULT_SUBJECTS.map((s) => ({ ...s })), gcse: { maths: null, english: null } },
    settings: { theme: 'light', onboarded: false },
    favourites: { unis: [], courses: [], programmes: [] },
    tracker: {},
    contextual: {},
    whatIf: { active: false, current: null, currentId: null, saved: [] },
    explore: null,
    meta: { lastGreeting: -1, lastDataVersion: null, persisted: null, whatsNewSeen: null },
  };
}

let memoryOnly = false;
let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    return migrate(JSON.parse(raw));
  } catch {
    memoryOnly = true;
    return defaults();
  }
}

/** Fill in anything missing so older saves keep working. */
export function migrate(s) {
  const d = defaults();
  if (!s || typeof s !== 'object') return d;
  const out = { ...d, ...s };
  out.profile = { ...d.profile, ...(s.profile || {}) };
  out.profile.gcse = { ...d.profile.gcse, ...(s.profile?.gcse || {}) };
  if (!Array.isArray(out.profile.subjects) || !out.profile.subjects.length) out.profile.subjects = d.profile.subjects;
  out.settings = { ...d.settings, ...(s.settings || {}) };
  out.favourites = { unis: [...(s.favourites?.unis || [])], courses: [...(s.favourites?.courses || [])], programmes: [...(s.favourites?.programmes || [])] };
  out.tracker = { ...(s.tracker || {}) };
  out.contextual = { ...(s.contextual || {}) };
  out.whatIf = { ...d.whatIf, ...(s.whatIf || {}) };
  out.whatIf.saved = Array.isArray(out.whatIf.saved) ? out.whatIf.saved.slice(0, MAX_WHATIFS) : [];
  out.meta = { ...d.meta, ...(s.meta || {}) };
  out.version = VERSION;
  return out;
}

function save() {
  if (memoryOnly) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    memoryOnly = true;
  }
}

export const get = () => state;
export const isMemoryOnly = () => memoryOnly;

/** Change state with a function, save, and tell the app. `what` hints at what changed. */
export function update(fn, what = 'state') {
  fn(state);
  save();
  for (const l of listeners) l(what, state);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---- Helpers ----------------------------------------------------------------

export const uid = () => Math.random().toString(36).slice(2, 9);

export function isFavourite(kind, id) {
  return state.favourites[kind].includes(id);
}

export function toggleFavourite(kind, id) {
  update((s) => {
    const list = s.favourites[kind];
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1); else list.push(id);
  }, 'favourites');
  return isFavourite(kind, id);
}

/** The grades and What-if switches every slider should use right now. */
export function effectiveProfile() {
  const w = state.whatIf;
  if (w.active && w.current) {
    return { subjects: w.current.subjects, toggles: w.current.toggles, gcse: state.profile.gcse, isWhatIf: true };
  }
  return { subjects: state.profile.subjects, toggles: null, gcse: state.profile.gcse, isWhatIf: false };
}

export function blankWhatIf() {
  return {
    subjects: state.profile.subjects.map((s) => ({ ...s })),
    toggles: { epq: { on: false, grade: 'A' }, contextual: false, summerSchool: false, tmua: { on: false, score: 7 } },
    scope: { rgOnly: false, londonOnly: false, campusOnly: false, nearHome: false },
  };
}

// ---- Backup and restore -------------------------------------------------------

export function exportBackup() {
  return JSON.stringify({ app: 'uni-bob', version: VERSION, exported: new Date().toISOString(), state }, null, 2);
}

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64) {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function exportCode() {
  return `UNIBOB1:${toBase64(JSON.stringify({ v: VERSION, s: state }))}`;
}

/** Read a backup file's text or a copied code. Returns the state it contains (not applied yet). */
export function parseBackup(text) {
  const t = String(text || '').trim();
  let data;
  if (t.startsWith('UNIBOB1:')) {
    const obj = JSON.parse(fromBase64(t.slice(8).replace(/\s+/g, '')));
    data = obj.s;
  } else {
    const obj = JSON.parse(t);
    if (obj.app !== 'uni-bob' || !obj.state) throw new Error('This file is not a Uni Bob backup.');
    data = obj.state;
  }
  if (!data || typeof data !== 'object' || !data.profile) throw new Error('This backup looks empty.');
  return migrate(data);
}

export function restore(newState) {
  state = migrate(newState);
  save();
  for (const l of listeners) l('restore', state);
}

export function resetAll() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  state = defaults();
  for (const l of listeners) l('reset', state);
}
